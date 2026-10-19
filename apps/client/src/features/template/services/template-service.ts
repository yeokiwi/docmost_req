import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import { IPage } from "@/features/page/types/page.types.ts";
import {
  ITemplate,
  ITemplateInput,
  ITemplatePermissions,
} from "@/features/template/types.ts";

export async function getTemplates(params: {
  spaceId?: string;
  query?: string;
  cursor?: string;
  limit?: number;
}): Promise<IPagination<ITemplate>> {
  const req = await api.post("/templates", params);
  return req.data;
}

export async function getTemplateById(templateId: string): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/info", { templateId });
  return req.data;
}

export async function createTemplate(data: ITemplateInput): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/create", data);
  return req.data;
}

export async function updateTemplate(
  data: Partial<ITemplateInput> & { templateId: string },
): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/update", data);
  return req.data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await api.post("/templates/delete", { templateId });
}

export async function getTemplatePermissions(
  spaceId?: string,
): Promise<ITemplatePermissions> {
  const req = await api.post<ITemplatePermissions>("/templates/permissions", {
    spaceId,
  });
  return req.data;
}

export async function createPageFromTemplate(params: {
  template: ITemplate;
  spaceId: string;
  parentPageId?: string;
}): Promise<IPage> {
  const { template, spaceId, parentPageId } = params;
  const req = await api.post<IPage>("/pages/create", {
    spaceId,
    parentPageId,
    title: template.title ?? undefined,
    icon: template.icon ?? undefined,
    content: template.content,
    format: "json",
  });
  return req.data;
}
