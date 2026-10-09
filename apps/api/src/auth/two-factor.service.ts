import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { compare } from 'bcryptjs';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { AuditAction } from '@ohb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Issuer shown in the authenticator app (e.g. "OHB (you@ohb.local)"). */
const TOTP_ISSUER = process.env.TWO_FACTOR_ISSUER ?? 'OHB Integrated Report System';
/** How many recovery codes are generated per enrollment. */
const RECOVERY_CODE_COUNT = 10;
/** Unambiguous alphabet for recovery codes (no 0/O/1/I/l). */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

// Accept the current step plus one before/after (±30s) to tolerate clock skew.
authenticator.options = { window: 1 };

export interface SetupInfo {
  /** The base32 secret, shown for manual entry when a QR can't be scanned. */
  secret: string;
  /** otpauth:// URI encoded for the authenticator app. */
  otpauthUrl: string;
  /** A PNG data URL of the otpauth URI, ready for an <img src>. */
  qrDataUrl: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  /** An enrollment has been started but not yet confirmed. */
  pendingSetup: boolean;
  /** Count of recovery codes still unused (0 when 2FA is off). */
  recoveryCodesRemaining: number;
}

/**
 * TOTP (RFC 6238) two-step verification. Opt-in for every role. The confirmed
 * secret and single-use recovery codes are the second factor; the backend is
 * authoritative — a code is verified here, never trusted from the client.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(userId: string): Promise<TwoFactorStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorPendingSecret: true },
    });
    if (!user) throw new UnauthorizedException();
    const recoveryCodesRemaining = user.twoFactorEnabled
      ? await this.prisma.twoFactorRecoveryCode.count({
          where: { userId, usedAt: null },
        })
      : 0;
    return {
      enabled: user.twoFactorEnabled,
      pendingSetup: !user.twoFactorEnabled && !!user.twoFactorPendingSecret,
      recoveryCodesRemaining,
    };
  }

  /**
   * Begins enrollment: generates a fresh pending secret (replacing any earlier
   * un-confirmed one) and returns the QR / manual-entry material. Nothing is
   * active until {@link enable} confirms a code.
   */
  async beginSetup(userId: string): Promise<SetupInfo> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-step verification is already enabled');
    }

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorPendingSecret: secret },
    });

    const otpauthUrl = authenticator.keyuri(user.email, TOTP_ISSUER, secret);
    const qrDataUrl = await toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrDataUrl };
  }

  /**
   * Confirms enrollment: verifies a code against the pending secret, promotes it
   * to the active secret, and issues a fresh set of recovery codes (returned in
   * plaintext exactly once). Throws if setup wasn't started or the code is wrong.
   */
  async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorPendingSecret: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-step verification is already enabled');
    }
    if (!user.twoFactorPendingSecret) {
      throw new BadRequestException('Start setup before confirming a code');
    }
    if (!this.verifyTotp(user.twoFactorPendingSecret, code)) {
      throw new BadRequestException('That code is incorrect or has expired');
    }

    const { plaintext, rows } = this.makeRecoveryCodes(userId);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: user.twoFactorPendingSecret,
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: new Date(),
        },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({ data: rows }),
    ]);

    await this.audit.record({
      action: AuditAction.TWO_FACTOR_ENABLED,
      actorId: userId,
      entityType: 'User',
      entityId: userId,
    });
    return { recoveryCodes: plaintext };
  }

  /**
   * Turns 2FA off. Requires the account password AND a current code (TOTP or a
   * recovery code) so a walk-up session can't disable it. Clears the secret and
   * all recovery codes.
   */
  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-step verification is not enabled');
    }
    if (!(await compare(password, user.passwordHash))) {
      throw new BadRequestException('Your password is incorrect');
    }
    const ok =
      this.verifyTotp(user.twoFactorSecret, code) ||
      (await this.consumeRecoveryCode(userId, code));
    if (!ok) {
      throw new BadRequestException('That code is incorrect or has expired');
    }

    await this.clearTwoFactor(userId);
    await this.audit.record({
      action: AuditAction.TWO_FACTOR_DISABLED,
      actorId: userId,
      entityType: 'User',
      entityId: userId,
    });
  }

  /** Issues a fresh recovery-code set, invalidating the old ones. Requires a current code. */
  async regenerateRecoveryCodes(
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-step verification is not enabled');
    }
    if (!this.verifyTotp(user.twoFactorSecret, code)) {
      throw new BadRequestException('That code is incorrect or has expired');
    }

    const { plaintext, rows } = this.makeRecoveryCodes(userId);
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({ data: rows }),
    ]);
    await this.audit.record({
      action: AuditAction.TWO_FACTOR_RECOVERY_REGENERATED,
      actorId: userId,
      entityType: 'User',
      entityId: userId,
    });
    return { recoveryCodes: plaintext };
  }

  /**
   * Verifies a login-challenge code for a user mid-login. Accepts a 6-digit TOTP
   * or a single-use recovery code (consumed on use). Returns true on success.
   * Records whether a recovery code was spent for the audit trail.
   */
  async verifyChallenge(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) return false;

    if (this.verifyTotp(user.twoFactorSecret, code)) return true;

    if (await this.consumeRecoveryCode(userId, code)) {
      await this.audit.record({
        action: AuditAction.TWO_FACTOR_RECOVERY_USED,
        actorId: userId,
        entityType: 'User',
        entityId: userId,
      });
      return true;
    }
    return false;
  }

  /** Admin recovery path: clears a user's 2FA entirely (e.g. lost device). */
  async adminReset(targetUserId: string, actorId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, twoFactorEnabled: true, twoFactorPendingSecret: true },
    });
    if (!user) throw new UnauthorizedException();
    await this.clearTwoFactor(targetUserId);
    await this.audit.record({
      action: AuditAction.TWO_FACTOR_RESET,
      actorId,
      entityType: 'User',
      entityId: targetUserId,
      metadata: { byAdmin: true },
    });
  }

  // --- internals -------------------------------------------------------------

  private verifyTotp(secret: string, token: string): boolean {
    const normalized = (token ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) return false;
    try {
      return authenticator.verify({ token: normalized, secret });
    } catch {
      return false;
    }
  }

  /** Looks up an unused recovery code by hash and marks it used atomically. */
  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(code);
    if (!normalized) return false;
    const hash = hashCode(normalized);
    const record = await this.prisma.twoFactorRecoveryCode.findUnique({
      where: { codeHash: hash },
    });
    if (!record || record.userId !== userId || record.usedAt) return false;
    // Atomic single-use: only the request that flips usedAt from null wins.
    const consumed = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1;
  }

  private async clearTwoFactor(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: null,
        },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    ]);
  }

  private makeRecoveryCodes(userId: string): {
    plaintext: string[];
    rows: { userId: string; codeHash: string }[];
  } {
    const plaintext: string[] = [];
    const rows: { userId: string; codeHash: string }[] = [];
    const seen = new Set<string>();
    while (plaintext.length < RECOVERY_CODE_COUNT) {
      const code = randomRecoveryCode();
      if (seen.has(code)) continue;
      seen.add(code);
      plaintext.push(code);
      rows.push({ userId, codeHash: hashCode(normalizeRecoveryCode(code)!) });
    }
    return { plaintext, rows };
  }
}

/** Generates a code like `abcde-fghjk` from the unambiguous alphabet. */
function randomRecoveryCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < 10; i++) {
    chars.push(RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]);
  }
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** Strips formatting so entry variations (case, spaces, hyphens) match. */
function normalizeRecoveryCode(code: string): string | null {
  const cleaned = (code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length === 10 ? cleaned : null;
}

/** SHA-256 hex; only the hash of a recovery code is ever persisted. */
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
