import api from "@/lib/api-client";
import { saveAs } from "file-saver";
import {
  IBaselineComparison,
  IImportPreview,
  IImportRow,
  IRequirementBaseline,
  IRequirementDetail,
  IRequirementFilter,
  IRequirementList,
  IRequirementPropertyDefinition,
  IRequirementSettings,
  IRequirementType,
  IRequirementTypeList,
  IPageValidationItem,
  ITraceabilityMatrix,
} from "../types/requirement.types";

export async function getRequirementSettings(
  spaceId: string,
): Promise<IRequirementSettings | null> {
  const req = await api.post<IRequirementSettings | null>(
    "/requirements/settings",
    { spaceId },
  );
  return req.data ?? null;
}

export async function updateRequirementSettings(data: {
  spaceId: string;
  keyPrefix: string;
  keyPadding?: number;
  propertySchema?: IRequirementPropertyDefinition[];
}): Promise<IRequirementSettings> {
  const req = await api.post<IRequirementSettings>(
    "/requirements/settings/update",
    data,
  );
  return req.data;
}

export async function allocateRequirementKey(
  spaceId: string,
): Promise<string> {
  const req = await api.post<{ key: string }>("/requirements/allocate-key", {
    spaceId,
  });
  return req.data.key;
}

export async function allocateRequirementKeys(
  spaceId: string,
  count: number,
  typeId?: string,
): Promise<string[]> {
  const req = await api.post<{ keys: string[] }>(
    "/requirements/allocate-key",
    { spaceId, count, typeId },
  );
  return req.data.keys;
}

export async function listRequirementTypes(
  spaceId: string,
): Promise<IRequirementTypeList> {
  const req = await api.post<IRequirementTypeList>(
    "/requirements/types/list",
    { spaceId },
  );
  return req.data;
}

export type RequirementTypeInput = Partial<
  Pick<
    IRequirementType,
    "name" | "keyPrefix" | "keyPadding" | "nextSeq" | "color" | "properties"
  >
>;

export async function createRequirementType(
  data: RequirementTypeInput & { spaceId: string },
): Promise<IRequirementType> {
  const req = await api.post<IRequirementType>("/requirements/types/create", data);
  return req.data;
}

export async function updateRequirementType(
  data: RequirementTypeInput & { typeId: string },
): Promise<IRequirementType> {
  const req = await api.post<IRequirementType>("/requirements/types/update", data);
  return req.data;
}

export async function deleteRequirementType(typeId: string): Promise<void> {
  await api.post("/requirements/types/delete", { typeId });
}

export async function resetRequirementTypeSequence(
  typeId: string,
): Promise<IRequirementType> {
  const req = await api.post<IRequirementType>(
    "/requirements/types/reset-sequence",
    { typeId },
  );
  return req.data;
}

export async function validateRequirementType(typeId: string): Promise<{
  valid: number;
  warning: number;
  error: number;
  checked: number;
}> {
  const req = await api.post("/requirements/types/validate", { typeId });
  return req.data as any;
}

export async function setRequirementLockKeys(
  spaceId: string,
  lockKeys: boolean,
): Promise<void> {
  await api.post("/requirements/types/lock-keys", { spaceId, lockKeys });
}

export async function getPageValidation(
  pageId: string,
): Promise<IPageValidationItem[]> {
  const req = await api.post<{ items: IPageValidationItem[] }>(
    "/requirements/page-validation",
    { pageId },
  );
  return req.data.items;
}

export async function linkKeyOccurrences(params: {
  spaceId: string;
  key: string;
  excludePageId?: string;
}): Promise<{ pages: number }> {
  const req = await api.post<{ pages: number }>(
    "/requirements/link-key-occurrences",
    params,
  );
  return req.data;
}

export async function listRequirements(params: {
  spaceId: string;
  filter?: IRequirementFilter;
  limit?: number;
  offset?: number;
}): Promise<IRequirementList> {
  const req = await api.post<IRequirementList>("/requirements/list", params);
  return req.data;
}

export async function getRequirementInfo(params: {
  requirementId?: string;
  spaceId?: string;
  key?: string;
}): Promise<IRequirementDetail> {
  const req = await api.post<IRequirementDetail>("/requirements/info", params);
  return req.data;
}

export async function getPageRequirementConflicts(
  pageId: string,
): Promise<string[]> {
  const req = await api.post<{ nodeIds: string[] }>(
    "/requirements/page-conflicts",
    { pageId },
  );
  return req.data.nodeIds;
}

export async function getTraceabilityMatrix(params: {
  spaceId: string;
  rowFilter?: IRequirementFilter;
  columnFilter?: IRequirementFilter;
}): Promise<ITraceabilityMatrix> {
  const req = await api.post<ITraceabilityMatrix>(
    "/requirements/traceability",
    params,
  );
  return req.data;
}

export async function getBaselines(
  spaceId: string,
): Promise<IRequirementBaseline[]> {
  const req = await api.post<IRequirementBaseline[]>(
    "/requirements/baselines",
    { spaceId },
  );
  return req.data;
}

export async function createBaseline(data: {
  spaceId: string;
  name: string;
  description?: string;
}): Promise<IRequirementBaseline> {
  const req = await api.post<IRequirementBaseline>(
    "/requirements/baselines/create",
    data,
  );
  return req.data;
}

export async function deleteBaseline(baselineId: string): Promise<void> {
  await api.post("/requirements/baselines/delete", { baselineId });
}

export async function compareBaselines(params: {
  fromBaselineId: string;
  toBaselineId?: string;
}): Promise<IBaselineComparison> {
  const req = await api.post<IBaselineComparison>(
    "/requirements/baselines/compare",
    params,
  );
  return req.data;
}

export async function exportRequirements(params: {
  spaceId: string;
  format: "xlsx" | "csv";
  filter?: IRequirementFilter;
  baselineId?: string;
}): Promise<void> {
  const req = await api.post("/requirements/export", params, {
    responseType: "blob",
  });

  const fileName = req?.headers["content-disposition"]
    .split("filename=")[1]
    .replace(/"/g, "");

  let decodedFileName = fileName;
  try {
    decodedFileName = decodeURIComponent(fileName);
  } catch (err) {
    // fallback to raw filename
  }

  saveAs(req.data, decodedFileName);
}

export async function previewRequirementImport(
  file: File,
  spaceId: string,
): Promise<IImportPreview> {
  const formData = new FormData();
  formData.append("spaceId", spaceId);
  formData.append("file", file);

  const req = await api.post<IImportPreview>(
    "/requirements/import/preview",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return req.data;
}

export async function confirmRequirementImport(data: {
  spaceId: string;
  pageTitle: string;
  parentPageId?: string;
  rows: IImportRow[];
}): Promise<{ pageId: string; slugId: string; title: string }> {
  const req = await api.post<{ pageId: string; slugId: string; title: string }>(
    "/requirements/import/confirm",
    {
      ...data,
      rows: data.rows.map(({ keepKey: _keepKey, ...row }) => row),
    },
  );
  return req.data;
}
