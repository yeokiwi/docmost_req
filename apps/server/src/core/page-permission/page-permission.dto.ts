import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export const PAGE_ROLES = ['reader', 'writer'] as const;
export type PageRole = (typeof PAGE_ROLES)[number];

export class PagePermissionPageDto {
  @IsUUID()
  pageId: string;
}

export class AddPagePermissionsDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  groupIds?: string[];

  @IsIn(PAGE_ROLES)
  role: PageRole;
}

export class PagePermissionTargetDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class ChangePagePermissionRoleDto extends PagePermissionTargetDto {
  @IsIn(PAGE_ROLES)
  role: PageRole;
}
