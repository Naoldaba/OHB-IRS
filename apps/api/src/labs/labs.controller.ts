import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequireCapability, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { LabsService } from './labs.service';
import { CreateLabDto, UpdateLabDto } from './dto';

/**
 * Laboratory administration. Requires `manage_laboratories` (lab users get 403).
 * Laboratories are never hard-deleted (they anchor submissions and audit
 * history); use isActive to retire one.
 */
@Controller('labs')
@RequireCapability('manage_laboratories')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  list() {
    return this.labs.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.labs.get(id);
  }

  @Post()
  create(@Body() dto: CreateLabDto, @CurrentUser() user: AuthUser) {
    return this.labs.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.labs.update(id, dto, user.id);
  }
}
