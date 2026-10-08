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

  /** Clone the schema from this existing version of the same report type. */
  @IsOptional()
  @IsString()
  cloneFromVersionId?: string;
}

export class UpdateSchemaDto {
  @IsObject()
  fieldSchema: Record<string, unknown>;
}
