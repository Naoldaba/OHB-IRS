import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';

/**
 * User administration. Admin-only: lab users receive 403 via RolesGuard.
 * Users are never hard-deleted (they anchor submissions, feedback and audit
 * history); use isActive to disable an account.
 */
@Controller('users')
@Roles(RoleName.BUREAU_ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

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
}
