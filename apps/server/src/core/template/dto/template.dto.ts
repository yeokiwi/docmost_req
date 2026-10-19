import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class TemplateIdDto {
  @IsUUID()
  templateId: string;
}

export class ListTemplatesDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  // null or omitted: a workspace-wide template
  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, any>;

  // copy the content of an existing page
  @IsOptional()
  @IsUUID()
  pageId?: string;
}

export class UpdateTemplateDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, any>;
}
