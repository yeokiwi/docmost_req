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
