import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles } from '../common/decorators';
import { RequirementsService } from './requirements.service';
import { CreateRequirementDto, UpdateRequirementDto } from './dto';

/** Reporting requirement administration. BUREAU_ADMIN only. */
@Controller('reporting-requirements')
@Roles(RoleName.BUREAU_ADMIN)
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Get()
  list(@Query('reportTypeId') reportTypeId?: string) {
    return this.requirements.list(reportTypeId);
  }

  @Post()
  create(@Body() dto: CreateRequirementDto) {
    return this.requirements.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRequirementDto) {
    return this.requirements.update(id, dto);
  }
}
