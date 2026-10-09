import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { AuditAction, RoleScope } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto';

/** Fields safe to return to clients — never the password hash. */
const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  isActive: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, scope: true } },
  laboratory: { select: { id: true, name: true, code: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: { fullName: 'asc' },
      select: PUBLIC_USER_SELECT,
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, actorId: string) {
    const role = await this.resolveRole(dto.role);
    const laboratoryId = await this.resolveLaboratory(role.scope, dto.laboratoryId ?? null);
    const roleId = role.id;
    const email = dto.email.toLowerCase().trim();

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          fullName: dto.fullName.trim(),
          passwordHash: await hash(dto.password, 10),
          // Admin sets a temporary password; the user must change it at first login.
          mustChangePassword: true,
          roleId,
          laboratoryId,
        },
        select: PUBLIC_USER_SELECT,
      });
      await this.audit.record({
        action: AuditAction.USER_CREATED,
        actorId,
        entityType: 'User',
        entityId: user.id,
        metadata: { email: user.email, role: dto.role, laboratoryId },
      });
      return user;
    } catch (e) {
      throw this.translateUniqueError(e);
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    // Self-protection: an admin cannot lock themselves out or drop their own role.
    if (id === actorId) {
      if (dto.isActive === false) {
        throw new ForbiddenException('You cannot deactivate your own account');
      }
      if (dto.role !== undefined && dto.role !== existing.role.name) {
        throw new ForbiddenException('You cannot change your own role');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) {
      // An admin-reset password is temporary — force a change at next login.
      data.passwordHash = await hash(dto.password, 10);
      data.mustChangePassword = true;
    }

    // Role and laboratory must stay consistent, so resolve them together against
    // the resulting role.
    const roleChanging = dto.role !== undefined;
    const labChanging = dto.laboratoryId !== undefined;
    if (roleChanging || labChanging) {
      const effectiveRole = roleChanging
        ? await this.resolveRole(dto.role as string)
        : { id: existing.roleId, scope: existing.role.scope };
      // When the lab isn't explicitly set, carry the current one forward — except
      // a move to a BUREAU-scoped role clears it, since bureau holds no lab.
      const effectiveLabInput = labChanging
        ? dto.laboratoryId ?? null
        : effectiveRole.scope === RoleScope.BUREAU
          ? null
          : existing.laboratoryId;
      const laboratoryId = await this.resolveLaboratory(effectiveRole.scope, effectiveLabInput);
      if (roleChanging) data.role = { connect: { id: effectiveRole.id } };
      data.laboratory = laboratoryId
        ? { connect: { id: laboratoryId } }
        : { disconnect: true };
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
        select: PUBLIC_USER_SELECT,
      });
      await this.audit.record({
        action: AuditAction.USER_UPDATED,
        actorId,
        entityType: 'User',
        entityId: user.id,
        metadata: {
          passwordReset: dto.password !== undefined,
          role: dto.role,
          laboratoryId: labChanging || roleChanging ? user.laboratory?.id ?? null : undefined,
          isActive: dto.isActive,
        },
      });
      return user;
    } catch (e) {
      throw this.translateUniqueError(e);
    }
  }

  /**
   * Assign a user to a role (the roles admin screen, Phase 26). A focused,
   * audited variant of {@link update} that only moves a user between roles and
   * reconciles the laboratory contract. The same server-side authority applies:
   * a user cannot change their own role, a LAB-scoped role needs an active
   * laboratory, a BUREAU-scoped role holds none. Records a ROLE_ASSIGNED entry.
   */
  async assignRole(
    userId: string,
    roleName: string,
    laboratoryId: string | null,
    actorId: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!existing) throw new NotFoundException('User not found');

    if (userId === actorId && roleName !== existing.role.name) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const role = await this.resolveRole(roleName);
    const resolvedLabId = await this.resolveLaboratory(role.scope, laboratoryId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: { connect: { id: role.id } },
        laboratory: resolvedLabId ? { connect: { id: resolvedLabId } } : { disconnect: true },
      },
      select: PUBLIC_USER_SELECT,
    });
    await this.audit.record({
      action: AuditAction.ROLE_ASSIGNED,
      actorId,
      entityType: 'User',
      entityId: userId,
      metadata: {
        from: existing.role.name,
        to: roleName,
        laboratoryId: resolvedLabId,
      },
    });
    return user;
  }

  /**
   * Enforces the scope/laboratory contract and returns the laboratoryId to store:
   * a LAB-scoped role must reference an existing active lab; a BUREAU-scoped role
   * has none.
   */
  private async resolveLaboratory(
    scope: string,
    laboratoryId: string | null,
  ): Promise<string | null> {
    if (scope === RoleScope.LAB) {
      if (!laboratoryId) {
        throw new BadRequestException('A laboratory is required for a lab-scoped role');
      }
      const lab = await this.prisma.laboratory.findUnique({ where: { id: laboratoryId } });
      if (!lab) throw new BadRequestException('Laboratory not found');
      if (!lab.isActive) throw new BadRequestException('Laboratory is not active');
      return lab.id;
    }
    // Bureau-scoped roles are not confined to a laboratory.
    if (laboratoryId) {
      throw new BadRequestException('A bureau-scoped role cannot be assigned to a laboratory');
    }
    return null;
  }

  /** Resolve a role name to its id + scope; rejects unknown or inactive roles. */
  private async resolveRole(name: string): Promise<{ id: string; scope: string }> {
    const record = await this.prisma.role.findUnique({ where: { name } });
    if (!record) throw new BadRequestException(`Unknown role: ${name}`);
    if (!record.isActive) throw new BadRequestException(`Role is not active: ${name}`);
    return { id: record.id, scope: record.scope };
  }

  private translateUniqueError(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('A user with this email already exists');
    }
    return e;
  }
}
