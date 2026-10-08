import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuditAction } from '@ohb/shared';
import { Public, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';

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

  @Post('logout')
  async logout(@Req() req: Request, @CurrentUser() user: AuthUser) {
    await this.audit.record({ action: AuditAction.LOGOUT, actorId: user.id });
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
