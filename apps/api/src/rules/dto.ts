import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Rule create/update DTOs. The `condition` and `action` jsonb payloads are the
 * declarative AST (validated structurally by the shared `validateRules`, not by
 * class-validator — class-validator only guards the envelope).
 */
export class CreateRuleDto {
  @IsString()
  key: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** BusinessRuleKind value. */
  @IsString()
  kind: string;

  /** RuleSeverity value (required for VALIDATION / CROSS_FIELD). */
  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsObject()
  action: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsString()
  templateId?: string;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  action?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

/** Validate an ad-hoc set of draft rules (optional; defaults to the persisted set). */
export class ValidateRulesDto {
  @IsOptional()
  @IsArray()
  rules?: Array<Record<string, unknown>>;
}

/** Dry-run: evaluate persisted (or supplied) rules against sample data. Nothing persisted. */
export class TestRulesDto {
  @IsObject()
  data: Record<string, unknown>;

  /** Optional unsaved rule set to test instead of the persisted rules. */
  @IsOptional()
  @IsArray()
  rules?: Array<Record<string, unknown>>;
}
