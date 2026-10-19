import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ListApiKeysDto {
  // workspace admins: list every member's keys
  @IsOptional()
  @IsBoolean()
  adminView?: boolean;
}

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // omitted: the key does not expire
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateApiKeyDto {
  @IsUUID()
  apiKeyId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class ApiKeyIdDto {
  @IsUUID()
  apiKeyId: string;
}
