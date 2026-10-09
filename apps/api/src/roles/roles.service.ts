import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CAPABILITIES,
  CAPABILITY_GROUPS,
  NON_REVOCABLE_CAPABILITIES,
  ROLE_META,
  RoleScope,
  isCapabilityKey,
  type PermissionMatrix,
  type RoleColumn,
  type RoleMember,
  type RoleSummary,
} from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../common/permissions.service';

/** A DB role row with the fields this service reads. */
type RoleRecord = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  isSystem: boolean;
  isActive: boolean;
};

/**
 * Role & permission administration (Phase 26; editable grants in 28a; scope axis
 * + custom roles in 28b). Roles are **data**: the two seeded roles are system
 * roles (protected), and admins may create custom roles with a chosen scope and
 * capability set. Capability *keys* remain the code-backed whitelist (@ohb/shared,
 * each mapping to a `@RequireCapability` guard); the *grants* and the *set of
 * roles* are DB-backed, so this screen is the live authorization control. Role
 * *assignment* is delegated to UsersService so the scope/laboratory contract and
 * audit stay in one place.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  /** System roles first, then custom roles alphabetically. */
  private roleOrder() {
    return [{ isSystem: 'desc' as const }, { name: 'asc' as const }];
  }

  /** Map a DB role to a display column (system roles get their nicer meta label). */
  private toColumn(r: RoleRecord): RoleColumn {
    const meta = (ROLE_META as Record<string, { label: string; description: string }>)[r.name];
    return {
      name: r.name,
      label: r.isSystem && meta ? meta.label : r.name,
      description: r.description ?? meta?.description ?? '',
      scope: r.scope as RoleScope,
      isSystem: r.isSystem,
      isActive: r.isActive,
    };
  }

  /** Every role with its description, scope, live member count and granted capabilities. */
  async listRoles(): Promise<RoleSummary[]> {
    const counts = await this.prisma.user.groupBy({
      by: ['roleId'],
      _count: { _all: true },
    });
    const roleRecords = await this.prisma.role.findMany({
      orderBy: this.roleOrder(),
      include: { permissions: { select: { capabilityKey: true } } },
    });
    const countByRoleId = new Map(counts.map((c) => [c.roleId, c._count._all]));

    return roleRecords.map((r) => ({
      ...this.toColumn(r),
      memberCount: countByRoleId.get(r.id) ?? 0,
      capabilityKeys: r.permissions.map((p) => p.capabilityKey),
    }));
  }

  /** The full permission matrix: roles × grouped capabilities, with a grant map. */
  async permissionMatrix(): Promise<PermissionMatrix> {
    const roleRecords = await this.prisma.role.findMany({
      orderBy: this.roleOrder(),
      include: { permissions: { select: { capabilityKey: true } } },
    });
    const grantByRole = new Map(
      roleRecords.map((r) => [r.name, new Set(r.permissions.map((p) => p.capabilityKey))]),
    );

    const roles = roleRecords.map((r) => this.toColumn(r));

    const groups = CAPABILITY_GROUPS.map((group) => ({
      group,
      capabilities: CAPABILITIES.filter((c) => c.group === group),
    })).filter((g) => g.capabilities.length > 0);

    const grants: Record<string, Record<string, boolean>> = {};
    for (const cap of CAPABILITIES) {
      grants[cap.key] = {};
      for (const r of roleRecords) {
        grants[cap.key][r.name] = grantByRole.get(r.name)?.has(cap.key) ?? false;
      }
    }

    return { roles, groups, grants };
  }

  /**
   * Create a custom role (Phase 28b). Validates the name is free and the scope +
   * any starting capabilities are valid, then seeds its grants. Audited.
   */
  async createRole(
    input: { name: string; scope: RoleScope; description?: string; capabilityKeys?: string[] },
    actorId: string,
  ): Promise<PermissionMatrix> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('A role name is required');
    if (!Object.values(RoleScope).includes(input.scope)) {
      throw new BadRequestException('Invalid scope');
    }
    const keys = input.capabilityKeys ?? [];
    const invalid = keys.filter((k) => !isCapabilityKey(k));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown capability: ${invalid.join(', ')}`);
    }

    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) throw new ConflictException('A role with this name already exists');

    const role = await this.prisma.role.create({
      data: {
        name,
        description: input.description?.trim() || null,
        scope: input.scope,
        isSystem: false,
        isActive: true,
        permissions: { create: keys.map((capabilityKey) => ({ capabilityKey })) },
      },
    });
    await this.audit.record({
      action: AuditAction.ROLE_CREATED,
      actorId,
      entityType: 'Role',
      entityId: role.id,
      metadata: { name, scope: input.scope, capabilityKeys: keys },
    });
    return this.permissionMatrix();
  }

  /**
   * Edit a custom role's name / description / active state. System roles cannot be
   * renamed or deactivated (their identity is relied on in code and the seed).
   */
  async updateRole(
    name: string,
    dto: { name?: string; description?: string; isActive?: boolean },
    actorId: string,
  ): Promise<PermissionMatrix> {
    const role = await this.requireRole(name);

    const data: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
    } = {};

    if (dto.name !== undefined && dto.name.trim() !== role.name) {
      if (role.isSystem) throw new BadRequestException('A system role cannot be renamed');
      const nextName = dto.name.trim();
      const clash = await this.prisma.role.findUnique({ where: { name: nextName } });
      if (clash) throw new ConflictException('A role with this name already exists');
      data.name = nextName;
    }
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.isActive !== undefined && dto.isActive !== role.isActive) {
      if (role.isSystem && dto.isActive === false) {
        throw new BadRequestException('A system role cannot be deactivated');
      }
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.role.update({ where: { id: role.id }, data });
      this.permissions.invalidate(role.id);
      await this.audit.record({
        action: AuditAction.ROLE_UPDATED,
        actorId,
        entityType: 'Role',
        entityId: role.id,
        metadata: { ...data, previousName: role.name },
      });
    }
    return this.permissionMatrix();
  }

  /** Delete a custom role. System roles and roles with members are protected. */
  async deleteRole(name: string, actorId: string): Promise<PermissionMatrix> {
    const role = await this.requireRole(name);
    if (role.isSystem) throw new BadRequestException('A system role cannot be deleted');

    const members = await this.prisma.user.count({ where: { roleId: role.id } });
    if (members > 0) {
      throw new BadRequestException(
        'Reassign the users holding this role before deleting it',
      );
    }

    await this.prisma.role.delete({ where: { id: role.id } }); // RolePermission cascades
    this.permissions.invalidate(role.id);
    await this.audit.record({
      action: AuditAction.ROLE_DELETED,
      actorId,
      entityType: 'Role',
      entityId: role.id,
      metadata: { name: role.name, scope: role.scope },
    });
    return this.permissionMatrix();
  }

  /**
   * Replace a role's capability grants with `capabilityKeys`. Validates every
   * key against the code-backed whitelist, enforces the anti-lockout invariant,
   * applies the diff atomically, invalidates the capability cache and audits the
   * change. Returns the refreshed matrix.
   */
  async updatePermissions(
    name: string,
    capabilityKeys: string[],
    actorId: string,
  ): Promise<PermissionMatrix> {
    const invalid = capabilityKeys.filter((k) => !isCapabilityKey(k));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown capability: ${invalid.join(', ')}`);
    }
    const desired = new Set(capabilityKeys);

    const role = await this.prisma.role.findUnique({
      where: { name },
      include: { permissions: { select: { capabilityKey: true } } },
    });
    if (!role) throw new NotFoundException(`Unknown role: ${name}`);

    await this.assertNoLockout(role.id, desired);

    const current = new Set(role.permissions.map((p) => p.capabilityKey));
    const toAdd = [...desired].filter((k) => !current.has(k));
    const toRemove = [...current].filter((k) => !desired.has(k));

    if (toAdd.length > 0 || toRemove.length > 0) {
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({
          where: { roleId: role.id, capabilityKey: { in: toRemove } },
        }),
        ...toAdd.map((capabilityKey) =>
          this.prisma.rolePermission.create({ data: { roleId: role.id, capabilityKey } }),
        ),
      ]);
      // Live authorization reads the cache resolved in SessionAuthGuard — drop it
      // so the next request for this role reflects the new grants.
      this.permissions.invalidate(role.id);
      await this.audit.record({
        action: AuditAction.ROLE_PERMISSIONS_UPDATED,
        actorId,
        entityType: 'Role',
        entityId: role.id,
        metadata: { role: name, added: toAdd, removed: toRemove },
      });
    }

    return this.permissionMatrix();
  }

  /**
   * Reject a change that would leave no active user holding a non-revocable
   * capability (e.g. removing the last `manage_roles` grant would lock
   * administration out). After the change a capability is still held iff another
   * role grants it to an active user, or this role keeps it and has an active user.
   */
  private async assertNoLockout(roleId: string, desired: Set<string>): Promise<void> {
    for (const cap of NON_REVOCABLE_CAPABILITIES) {
      const heldElsewhere = await this.prisma.role.findFirst({
        where: {
          id: { not: roleId },
          permissions: { some: { capabilityKey: cap } },
          users: { some: { isActive: true } },
        },
        select: { id: true },
      });
      if (heldElsewhere) continue;

      const keptHere =
        desired.has(cap) &&
        (await this.prisma.user.count({ where: { roleId, isActive: true } })) > 0;
      if (!keptHere) {
        const label = CAPABILITIES.find((c) => c.key === cap)?.label ?? cap;
        throw new BadRequestException(
          `At least one active user must keep the “${label}” capability.`,
        );
      }
    }
  }

  /** Active-first list of the users holding a role. */
  async members(name: string): Promise<RoleMember[]> {
    await this.requireRole(name);
    const users = await this.prisma.user.findMany({
      where: { role: { name } },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
        laboratory: { select: { id: true, name: true, code: true } },
      },
    });
    return users;
  }

  private async requireRole(name: string): Promise<RoleRecord> {
    const role = await this.prisma.role.findUnique({ where: { name } });
    if (!role) throw new NotFoundException(`Unknown role: ${name}`);
    return role;
  }
}
