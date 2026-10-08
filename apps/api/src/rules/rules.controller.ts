import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RoleName } from '@ohb/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { RulesService } from './rules.service';
import { CreateRuleDto, TestRulesDto, UpdateRuleDto, ValidateRulesDto } from './dto';

/**
 * Business-rule authoring + config validation + dry-run, scoped to a report
 * type's definition version. BUREAU_ADMIN only — labs never read or modify
 * definitions or rules (IMPLEMENTATION_PLAN §6.8).
 */
@Controller('report-types/:reportTypeId/definition-versions/:versionId')
@Roles(RoleName.BUREAU_ADMIN)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  /** Field catalog (path/label/type) powering the rule builder's field selector. */
  @Get('fields')
  fields(@Param('reportTypeId') reportTypeId: string, @Param('versionId') versionId: string) {
    return this.rules.fields(reportTypeId, versionId);
  }

  @Get('rules')
  list(@Param('reportTypeId') reportTypeId: string, @Param('versionId') versionId: string) {
    return this.rules.list(reportTypeId, versionId);
  }

  @Post('rules')
  create(
    @Param('reportTypeId') reportTypeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateRuleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rules.create(reportTypeId, versionId, dto, user.id);
  }

  /** Config validation of the persisted (or a supplied draft) rule set. */
  @Post('rules/validate')
  @HttpCode(200)
  validate(
    @Param('reportTypeId') reportTypeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: ValidateRulesDto,
  ) {
    return this.rules.validate(reportTypeId, versionId, dto);
  }

  /** Dry-run: evaluate rules against sample data. Nothing is persisted. */
  @Post('test')
  @HttpCode(200)
  test(
    @Param('reportTypeId') reportTypeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: TestRulesDto,
  ) {
    return this.rules.test(reportTypeId, versionId, dto);
  }

  @Patch('rules/:ruleId')
  update(
    @Param('reportTypeId') reportTypeId: string,
    @Param('versionId') versionId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateRuleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rules.update(reportTypeId, versionId, ruleId, dto, user.id);
  }

  @Delete('rules/:ruleId')
  remove(
    @Param('reportTypeId') reportTypeId: string,
    @Param('versionId') versionId: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rules.remove(reportTypeId, versionId, ruleId, user.id);
  }
}
