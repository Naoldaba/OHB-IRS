import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AuditAction } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Validates credentials and returns the authenticated principal. */
  async validate(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { role: true },
    });

    // Constant-ish failure path: same error whether user missing or bad password.
    if (!user || !user.isActive || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({ action: AuditAction.LOGIN, actorId: user.id });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      laboratoryId: user.laboratoryId,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async profile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, laboratory: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      laboratoryId: user.laboratoryId,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * Self-service password change. Verifies the current password, stores the new
   * one and clears the mustChangePassword flag. Used both for the forced change
   * at first login and for voluntary changes.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (!(await compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await compare(newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(newPassword, 10),
        mustChangePassword: false,
      },
    });
    await this.audit.record({
      action: AuditAction.USER_UPDATED,
      actorId: user.id,
      entityType: 'User',
      entityId: user.id,
      metadata: { passwordChanged: true },
    });
  }
}
