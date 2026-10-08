import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles } from '../common/decorators';
import { ReportTypesService } from './report-types.service';
import { CreateReportTypeDto, UpdateReportTypeDto } from './dto';

/**
 * Report types. Listing/reading is open to any authenticated user (labs need to
 * choose a report to submit); authoring is BUREAU_ADMIN-only.
 */
@Controller('report-types')
export class ReportTypesController {
  constructor(private readonly reportTypes: ReportTypesService) {}

  @Get()
  list() {
    return this.reportTypes.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.reportTypes.get(id);
  }

  @Post()
  @Roles(RoleName.BUREAU_ADMIN)
  create(@Body() dto: CreateReportTypeDto) {
    return this.reportTypes.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.BUREAU_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateReportTypeDto) {
    return this.reportTypes.update(id, dto);
  }
}
