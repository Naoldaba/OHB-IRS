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
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthUser> {
    const user = await this.auth.validate(dto.email, dto.password);
    // Prevent session fixation: establish identity on a regenerated session.
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
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
}
