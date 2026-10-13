import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequireCapability } from '../common/decorators';
import { RequirementsService } from './requirements.service';
import { CreateRequirementDto, UpdateRequirementDto } from './dto';

/** Reporting requirement administration. Requires `manage_requirements`. */
@Controller('reporting-requirements')
@RequireCapability('manage_requirements')
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
