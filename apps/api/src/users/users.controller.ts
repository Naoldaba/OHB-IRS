import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequireCapability, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { TwoFactorService } from '../auth/two-factor.service';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';

/**
 * User administration. Requires the `manage_users` capability (lab users get
 * 403). Users are never hard-deleted (they anchor submissions, feedback and
 * audit history); use isActive to disable an account.
 */
@Controller('users')
@RequireCapability('manage_users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor.id);
  }

  /**
   * Admin recovery path: clear a user's two-step verification (e.g. lost
   * authenticator). The user can re-enroll afterwards from their profile.
   */
  @Post(':id/reset-2fa')
  @HttpCode(200)
  async resetTwoFactor(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    await this.twoFactor.adminReset(id, actor.id);
    return { ok: true };
  }
}
