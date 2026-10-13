import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateDefinitionVersionDto {
  /**
   * The field structure for the new draft. Optional: omit to clone from an
   * existing version (see cloneFromVersionId) or to start empty and author it
   * via PATCH .../schema before publishing.
   */
  @IsOptional()
  @IsObject()
  fieldSchema?: Record<string, unknown>;

  /** Clone the schema (and its rules) from this existing version of the same report type. */
  @IsOptional()
  @IsString()
  cloneFromVersionId?: string;

  /**
   * Clone the schema and attached rules from a version of ANY report type
   * (Phase 19) — "start from an existing report". Takes precedence over
   * cloneFromVersionId. An explicit `fieldSchema` still overrides the copied one
   * (and then no rules are copied, since they may no longer match).
   */
  @IsOptional()
  @IsString()
  cloneFromDefinitionVersionId?: string;
}

export class UpdateSchemaDto {
  @IsObject()
  fieldSchema: Record<string, unknown>;
}
