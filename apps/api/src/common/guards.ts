import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user';
import { PermissionsService } from './permissions.service';
import {
  IS_PUBLIC_KEY,
  PASSWORD_CHANGE_EXEMPT_KEY,
  REQUIRE_CAPABILITY_KEY,
  ROLES_KEY,
} from './decorators';

/**
 * Authoritative authentication: resolves the session's userId to a live, active
 * user and attaches it to the request. Routes are protected by default; opt out
 * with @Public().
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const capabilities = await this.permissions.capabilitiesForRole(user.roleId);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      scope: user.role.scope,
      capabilities: [...capabilities],
      laboratoryId: user.laboratoryId,
      avatarUrl: user.avatarUrl,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      emailNotifications: user.emailNotifications,
    };
    request.user = authUser;

    // A user who still owes a password change may only reach exempt routes
    // (the change-password endpoint, logout, /auth/me). Everything else is
    // blocked server-side so the frontend redirect can't be bypassed.
    if (user.mustChangePassword) {
      const exempt = this.reflector.getAllAndOverride<boolean>(
        PASSWORD_CHANGE_EXEMPT_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!exempt) {
        throw new ForbiddenException({
          message: 'You must change your password before continuing',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }
    }
    return true;
  }
}

/** Enforces @Roles(...) declared on a handler or controller (legacy). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user || !required.includes(user.role as RoleName)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}

/**
 * Enforces @RequireCapability(...) (Phase 28). The required capabilities come
 * from the handler (overriding the controller); the principal must hold every
 * one. No decoration ⇒ open to any authenticated user. The capability set is
 * the DB-backed grant resolved by SessionAuthGuard, so toggling a grant off a
 * role immediately 403s that role on the guarded routes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    const held = new Set(user?.capabilities ?? []);
    if (!user || !required.every((cap) => held.has(cap))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
