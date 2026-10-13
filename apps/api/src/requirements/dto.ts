import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateRequirementDto {
  @IsString()
  reportTypeId: string;

  /** Null/omitted means "all active laboratories". */
  @IsOptional()
  @IsString()
  laboratoryId?: string | null;
}

export class UpdateRequirementDto {
  @IsBoolean()
  isActive: boolean;
}
