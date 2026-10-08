import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { Roles, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { DefinitionVersionsService } from './definition-versions.service';
import { CreateDefinitionVersionDto, UpdateSchemaDto } from './dto';

/**
 * Report-definition version authoring. BUREAU_ADMIN only — labs never read or
 * modify definitions. Nested under a report type.
 */
@Controller('report-types/:reportTypeId/definition-versions')
@Roles(RoleName.BUREAU_ADMIN)
export class DefinitionVersionsController {
  constructor(private readonly versions: DefinitionVersionsService) {}

  @Get()
  list(@Param('reportTypeId') reportTypeId: string) {
    return this.versions.listForType(reportTypeId);
  }

  @Get(':versionId')
  get(@Param('reportTypeId') reportTypeId: string, @Param('versionId') versionId: string) {
    return this.versions.get(reportTypeId, versionId);
  }

  @Post()
  create(
    @Param('reportTypeId') reportTypeId: string,
    @Body() dto: CreateDefinitionVersionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.versions.create(reportTypeId, dto, user.id);
  }

  @Patch(':versionId/schema')
  updateSchema(
    @Param('reportTypeId') reportTypeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateSchemaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.versions.updateSchema(reportTypeId, versionId, dto, user.id);
  }

  @Post(':versionId/publish')
  publish(
    @Param('reportTypeId') reportTypeId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.versions.publish(reportTypeId, versionId, user.id);
  }
}
