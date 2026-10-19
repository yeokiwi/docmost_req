import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SsoProviderIdDto {
  @IsUUID()
  providerId: string;
}

export class CreateSsoProviderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsIn(['oidc'])
  type: 'oidc';

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  oidcIssuer: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  oidcClientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  oidcClientSecret: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  groupSync?: boolean;
}

export class UpdateSsoProviderDto {
  @IsUUID()
  providerId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  oidcIssuer?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  oidcClientId?: string;

  // omitted or empty: keep the stored secret
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  oidcClientSecret?: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  groupSync?: boolean;
}
