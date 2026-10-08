import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { AuthUser } from './auth-user';

/** Marks a route as not requiring authentication (e.g. login). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles (enforced by RolesGuard). */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Marks a route as reachable while the user still owes a password change
 * (e.g. the change-password endpoint itself, logout, and /auth/me). Every other
 * route is blocked by SessionAuthGuard until mustChangePassword is cleared.
 */
export const PASSWORD_CHANGE_EXEMPT_KEY = 'passwordChangeExempt';
export const PasswordChangeExempt = () =>
  SetMetadata(PASSWORD_CHANGE_EXEMPT_KEY, true);

/** Injects the authenticated user into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
