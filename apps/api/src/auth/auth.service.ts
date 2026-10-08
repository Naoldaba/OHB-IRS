import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';
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
    };
  }
}
