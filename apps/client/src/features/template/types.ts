export interface ITemplate {
  id: string;
  title: string | null;
  description: string | null;
  icon: string | null;
  spaceId: string | null;
  workspaceId: string;
  creatorId: string | null;
  lastUpdatedById: string | null;
  content?: any;
  createdAt: string;
  updatedAt: string;
  creator?: { id: string; name: string; avatarUrl: string | null } | null;
  permissions?: { canEdit: boolean };
}

export interface ITemplateInput {
  title: string;
  description?: string;
  icon?: string;
  spaceId?: string | null;
  content?: any;
  pageId?: string;
}

export interface ITemplatePermissions {
  canManageWorkspace: boolean;
  canManageSpace: boolean;
}
