import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SpaceIdDto {
  @IsUUID()
  spaceId: string;
}

export class PageIdDto {
  @IsUUID()
  pageId: string;
}

export class RequirementPropertyDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name: string;

  @IsIn(['text', 'select'])
  type: 'text' | 'select';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  options?: string[];
}

export class UpdateRequirementSettingsDto {
  @IsUUID()
  spaceId: string;

  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{1,15}$/, {
    message:
      'Key prefix must be 2-16 characters: letters, digits or underscore, starting with a letter',
  })
  keyPrefix: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  keyPadding?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RequirementPropertyDefinitionDto)
  propertySchema?: RequirementPropertyDefinitionDto[];
}

export class AllocateKeyDto {
  @IsUUID()
  spaceId: string;
}

export class RequirementFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyPrefix?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, string>;

  @IsOptional()
  @IsUUID()
  pageId?: string;

  @IsOptional()
  @IsIn(['any', 'covered', 'uncovered'])
  coverage?: 'any' | 'covered' | 'uncovered';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  keys?: string[];
}

export class ListRequirementsDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RequirementFilterDto)
  filter?: RequirementFilterDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class RequirementInfoDto {
  @IsOptional()
  @IsUUID()
  requirementId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;
}

export class TraceabilityDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RequirementFilterDto)
  rowFilter?: RequirementFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RequirementFilterDto)
  columnFilter?: RequirementFilterDto;
}

export class CreateBaselineDto {
  @IsUUID()
  spaceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class BaselineIdDto {
  @IsUUID()
  baselineId: string;
}

export class CompareBaselinesDto {
  @IsUUID()
  fromBaselineId: string;

  // omitted means compare against the current requirements
  @IsOptional()
  @IsUUID()
  toBaselineId?: string;
}

export class ExportRequirementsDto {
  @IsUUID()
  spaceId: string;

  @IsIn(['xlsx', 'csv'])
  format: 'xlsx' | 'csv';

  @IsOptional()
  @ValidateNested()
  @Type(() => RequirementFilterDto)
  filter?: RequirementFilterDto;

  @IsOptional()
  @IsUUID()
  baselineId?: string;
}

export class ImportRequirementRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, string>;
}

export class ConfirmImportDto {
  @IsUUID()
  spaceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  pageTitle: string;

  @IsOptional()
  @IsUUID()
  parentPageId?: string;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportRequirementRowDto)
  rows: ImportRequirementRowDto[];
}
