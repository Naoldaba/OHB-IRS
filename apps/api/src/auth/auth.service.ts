import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AuditAction } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { STORAGE, StorageProvider } from '../storage/storage.provider';

/** Image types accepted for a profile picture, mapped to a file extension. */
const AVATAR_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
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

    return this.toAuthUser(user);
  }

  async profile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, laboratory: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.toAuthUser(user);
  }

  /**
   * Self-service profile update: the user may change their own display name.
   * Email, role and laboratory are administrator-managed and cannot be changed
   * here. Returns the refreshed principal.
   */
  async updateProfile(userId: string, fullName: string): Promise<AuthUser> {
    const trimmed = fullName.trim();
    if (!trimmed) throw new BadRequestException('Name cannot be empty');

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: trimmed },
      include: { role: true },
    });
    await this.audit.record({
      action: AuditAction.USER_UPDATED,
      actorId: userId,
      entityType: 'User',
      entityId: userId,
      metadata: { self: true, fullNameChanged: true },
    });
    return this.toAuthUser(user);
  }

  /**
   * Stores an uploaded profile picture through the configured storage provider
   * and records its public URL. Any previous avatar object is cleaned up
   * best-effort. Returns the refreshed principal.
   */
  async setAvatar(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<AuthUser> {
    const ext = AVATAR_MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Profile picture must be a JPEG, PNG or WebP image');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Profile picture must be 2 MB or smaller');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!existing) throw new UnauthorizedException();

    const { url } = await this.storage.save({
      buffer: file.buffer,
      mimeType: file.mimetype,
      ext,
      folder: 'avatars',
    });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
      include: { role: true },
    });

    // Remove the superseded object after the DB points at the new one.
    if (existing.avatarUrl && existing.avatarUrl !== url) {
      await this.storage.remove(existing.avatarUrl);
    }

    await this.audit.record({
      action: AuditAction.USER_UPDATED,
      actorId: userId,
      entityType: 'User',
      entityId: userId,
      metadata: { self: true, avatarChanged: true },
    });
    return this.toAuthUser(user);
  }

  /** Clears the user's profile picture and cleans up the stored object. */
  async removeAvatar(userId: string): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!existing) throw new UnauthorizedException();

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      include: { role: true },
    });

    if (existing.avatarUrl) {
      await this.storage.remove(existing.avatarUrl);
      await this.audit.record({
        action: AuditAction.USER_UPDATED,
        actorId: userId,
        entityType: 'User',
        entityId: userId,
        metadata: { self: true, avatarRemoved: true },
      });
    }
    return this.toAuthUser(user);
  }

  /** Maps a user row (with its role loaded) to the session principal shape. */
  private toAuthUser(user: {
    id: string;
    email: string;
    fullName: string;
    role: { name: string };
    laboratoryId: string | null;
    avatarUrl: string | null;
    mustChangePassword: boolean;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      laboratoryId: user.laboratoryId,
      avatarUrl: user.avatarUrl,
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
