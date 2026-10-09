import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { AuditAction } from '@ohb/shared';
import {
  Public,
  CurrentUser,
  PasswordChangeExempt,
} from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import {
  ChangePasswordDto,
  DisableTwoFactorDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  TwoFactorCodeDto,
  UpdateProfileDto,
} from './dto';

/** How long the mid-login 2FA challenge stays valid after the password step. */
const PENDING_TWO_FACTOR_TTL_MS = 5 * 60 * 1000;

/** Response when a correct password still needs a second factor. */
type LoginResult = AuthUser | { twoFactorRequired: true };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResult> {
    const result = await this.auth.beginLogin(dto.email, dto.password);
    // Prevent session fixation: always start from a fresh session.
    await regenerateSession(req);

    if (result.status === 'TWO_FACTOR_REQUIRED') {
      // Hold the user in a pending stage; no authenticated session yet.
      req.session.pendingTwoFactorUserId = result.userId;
      req.session.pendingTwoFactorAt = Date.now();
      return { twoFactorRequired: true };
    }

    req.session.userId = result.user.id;
    return result.user;
  }

  /**
   * Second login step for accounts with 2FA. Reads the pending user from the
   * session (established by the password step), verifies a TOTP or recovery
   * code, then promotes the session to a fully authenticated one.
   */
  @Public()
  @Post('2fa/verify')
  @HttpCode(200)
  async verifyTwoFactor(
    @Body() dto: TwoFactorCodeDto,
    @Req() req: Request,
  ): Promise<AuthUser> {
    const pendingUserId = req.session.pendingTwoFactorUserId;
    const startedAt = req.session.pendingTwoFactorAt ?? 0;
    if (!pendingUserId || Date.now() - startedAt > PENDING_TWO_FACTOR_TTL_MS) {
      throw new UnauthorizedException('Your sign-in attempt expired. Please start again.');
    }
    const ok = await this.twoFactor.verifyChallenge(pendingUserId, dto.code);
    if (!ok) {
      throw new UnauthorizedException('That code is incorrect or has expired.');
    }

    const user = await this.auth.completeLogin(pendingUserId);
    // Fresh session on privilege elevation; drop the pending markers.
    await regenerateSession(req);
    req.session.userId = user.id;
    return user;
  }

  /**
   * Begin an email-based password reset. Always returns the same response
   * whether or not the email matches an account, to avoid revealing which
   * addresses are registered.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { ok: true };
  }

  /** Complete a password reset using a token from the emailed link. */
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  @PasswordChangeExempt()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  @PasswordChangeExempt()
  @Post('logout')
  async logout(@Req() req: Request, @CurrentUser() user: AuthUser) {
    await this.audit.record({ action: AuditAction.LOGOUT, actorId: user.id });
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );
    return { ok: true };
  }

  @PasswordChangeExempt()
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /** Self-service: update the signed-in user's display name. */
  @Patch('profile')
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AuthUser> {
    return this.auth.updateProfile(user.id, dto.fullName);
  }

  /** Self-service: upload/replace the signed-in user's profile picture. */
  @Post('profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  setAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<AuthUser> {
    if (!file) throw new BadRequestException('No image file was uploaded');
    return this.auth.setAvatar(user.id, file);
  }

  /** Self-service: remove the signed-in user's profile picture. */
  @Delete('profile/avatar')
  removeAvatar(@CurrentUser() user: AuthUser): Promise<AuthUser> {
    return this.auth.removeAvatar(user.id);
  }

  // --- Two-step verification (TOTP), self-service for every role -------------

  /** Current 2FA state for the signed-in user. */
  @Get('2fa/status')
  twoFactorStatus(@CurrentUser() user: AuthUser) {
    return this.twoFactor.status(user.id);
  }

  /** Begin enrollment: returns the QR / secret to add to an authenticator app. */
  @Post('2fa/setup')
  @HttpCode(200)
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.twoFactor.beginSetup(user.id);
  }

  /** Confirm enrollment with a code from the app; returns one-time recovery codes. */
  @Post('2fa/enable')
  @HttpCode(200)
  enableTwoFactor(
    @Body() dto: TwoFactorCodeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.twoFactor.enable(user.id, dto.code);
  }

  /** Turn 2FA off (requires the account password and a current code). */
  @Post('2fa/disable')
  @HttpCode(200)
  async disableTwoFactor(
    @Body() dto: DisableTwoFactorDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.twoFactor.disable(user.id, dto.password, dto.code);
    return { ok: true };
  }

  /** Issue a fresh set of recovery codes (requires a current code). */
  @Post('2fa/recovery-codes')
  @HttpCode(200)
  regenerateRecoveryCodes(
    @Body() dto: TwoFactorCodeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.twoFactor.regenerateRecoveryCodes(user.id, dto.code);
  }
}

/** Regenerate the session (prevents fixation) as a promise. */
function regenerateSession(req: Request): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
}
