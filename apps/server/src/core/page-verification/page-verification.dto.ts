import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const VERIFICATION_TYPES = ['expiring', 'qms'] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export const PERIOD_UNITS = ['day', 'week', 'month', 'year'] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];

export class VerificationPageIdDto {
  @IsUUID()
  pageId: string;
}

export class SetupVerificationDto {
  @IsUUID()
  pageId: string;

  @IsIn(VERIFICATION_TYPES)
  type: VerificationType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  verifierIds: string[];

  // expiring only; omitted/null means the verification never expires
  @IsOptional()
  @ValidateIf((o) => o.periodAmount !== null)
  @IsInt()
  @Min(1)
  @Max(1000)
  periodAmount?: number | null;

  @IsOptional()
  @IsIn(PERIOD_UNITS)
  periodUnit?: PeriodUnit;
}

export class RejectVerificationDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ListVerificationsDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: VerificationType;

  // computed state filter, see VerificationState
  @IsOptional()
  @IsString()
  state?: string;
}
