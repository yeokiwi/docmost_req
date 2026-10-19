import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class MfaCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;
}

export class MfaDisableDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class MfaRegenerateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @IsOptional()
  @IsString()
  password?: string;
}
