export type RequirementCoverage = "any" | "covered" | "uncovered";

export interface IRequirementFilter {
  text?: string;
  keyPrefix?: string;
  properties?: Record<string, string>;
  pageId?: string;
  coverage?: RequirementCoverage;
  keys?: string[];
}

export interface IRequirementPropertyDefinition {
  name: string;
  type: "text" | "select";
  options?: string[];
}

export interface IRequirementSettings {
  spaceId: string;
  workspaceId: string;
  keyPrefix: string;
  nextSeq: number;
  keyPadding: number;
  propertySchema: IRequirementPropertyDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface IRequirement {
  id: string;
  spaceId: string;
  key: string;
  title: string;
  description: string;
  properties: Record<string, string>;
  pageId: string;
  nodeId: string;
  isConflict: boolean;
  createdAt: string;
  updatedAt: string;
  pageTitle: string | null;
  pageSlugId: string;
  referenceCount: number;
  dependsOn: string[];
}

export interface IRequirementList {
  items: IRequirement[];
  total: number;
  truncated: boolean;
}

export interface IRequirementLinkSource {
  sourcePageId: string;
  sourceSpaceId: string;
  sourceKey: string | null;
  pageTitle: string | null;
  pageSlugId: string;
}

export interface IRequirementDependency {
  targetSpaceId: string;
  targetKey: string;
  targetId: string | null;
  targetTitle: string | null;
  targetPageId: string | null;
}

export interface IRequirementDetail {
  requirement: Omit<
    IRequirement,
    "pageTitle" | "pageSlugId" | "referenceCount" | "dependsOn"
  >;
  page: { id: string; title: string | null; slugId: string; spaceId: string };
  referencedByPages: IRequirementLinkSource[];
  referencedByRequirements: IRequirementLinkSource[];
  dependsOn: IRequirementDependency[];
}

export interface ITraceabilityItem {
  id: string;
  key: string;
  title: string;
  pageId: string;
  pageSlugId: string;
  referenceCount: number;
}

export interface ITraceabilityMatrix {
  rows: ITraceabilityItem[];
  columns: ITraceabilityItem[];
  cells: Array<[string, string]>;
  truncated: boolean;
}

export interface IRequirementBaseline {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  version: number;
  creatorId: string | null;
  createdAt: string;
  creator?: { id: string; name: string; avatarUrl: string } | null;
  itemCount?: number;
}

export interface IBaselineSnapshotItem {
  key: string;
  title: string;
  description: string;
  properties: Record<string, string>;
  pageId: string | null;
  pageTitle: string | null;
  dependsOnKeys: string[];
}

export interface IFieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface IBaselineComparison {
  from: IRequirementBaseline;
  to: IRequirementBaseline | null;
  diff: {
    added: IBaselineSnapshotItem[];
    removed: IBaselineSnapshotItem[];
    modified: Array<{
      key: string;
      before: IBaselineSnapshotItem;
      after: IBaselineSnapshotItem;
      changes: IFieldChange[];
    }>;
    unchangedCount: number;
  };
}

export interface IImportRow {
  key?: string;
  title: string;
  description?: string;
  properties: Record<string, string>;
  keepKey?: boolean;
}

export interface IImportPreview {
  fileName: string;
  rows: IImportRow[];
  propertyNames: string[];
  warnings: string[];
}
