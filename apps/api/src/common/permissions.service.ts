import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves a role's capability grants (Phase 28) from the `RolePermission`
 * table. Authorization runs on every request, so the role→capabilities map is
 * cached in memory and invalidated whenever grants change (see RolesService).
 * The DB is authoritative — this is a read-through cache, never a second source
 * of truth.
 */
@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, Set<string>>();

  constructor(private readonly prisma: PrismaService) {}

  /** The capability keys granted to a role, by role id (cached). */
  async capabilitiesForRole(roleId: string): Promise<Set<string>> {
    const cached = this.cache.get(roleId);
    if (cached) return cached;

    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { capabilityKey: true },
    });
    const set = new Set(rows.map((r) => r.capabilityKey));
    this.cache.set(roleId, set);
    return set;
  }

  /** Drop cached grants — all roles, or one — after an edit. */
  invalidate(roleId?: string): void {
    if (roleId) this.cache.delete(roleId);
    else this.cache.clear();
  }
}
