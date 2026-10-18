import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import * as requirementService from "../services/requirement-service";
import { IRequirementFilter } from "../types/requirement.types";

function errorMessage(error: unknown): string | undefined {
  return (error as any)?.["response"]?.data?.message;
}

export function useRequirementSettingsQuery(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["requirement-settings", spaceId],
    queryFn: () => requirementService.getRequirementSettings(spaceId),
    enabled: !!spaceId,
    staleTime: 60 * 1000,
  });
}

export function useUpdateRequirementSettingsMutation() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: requirementService.updateRequirementSettings,
    onSuccess: (data) => {
      notifications.show({ message: t("Requirement settings saved") });
      qc.setQueryData(["requirement-settings", data.spaceId], data);
    },
    onError: (error) => {
      notifications.show({
        message: errorMessage(error) || t("Failed to save requirement settings"),
        color: "red",
      });
    },
  });
}

export function useRequirementsQuery(params: {
  spaceId: string | undefined;
  filter?: IRequirementFilter;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const { spaceId, filter, limit, offset, enabled = true } = params;
  return useQuery({
    queryKey: ["requirements", spaceId, filter, limit, offset],
    queryFn: () =>
      requirementService.listRequirements({ spaceId, filter, limit, offset }),
    enabled: !!spaceId && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useRequirementInfoQuery(params: {
  requirementId?: string;
  spaceId?: string;
  key?: string;
  enabled?: boolean;
}) {
  const { requirementId, spaceId, key, enabled = true } = params;
  return useQuery({
    queryKey: ["requirement-info", requirementId, spaceId, key],
    queryFn: () =>
      requirementService.getRequirementInfo({ requirementId, spaceId, key }),
    enabled: enabled && (!!requirementId || (!!spaceId && !!key)),
    retry: false,
    staleTime: 30 * 1000,
  });
}

export function usePageRequirementConflictsQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: ["requirement-conflicts", pageId],
    queryFn: () => requirementService.getPageRequirementConflicts(pageId),
    enabled: !!pageId,
    refetchInterval: 30 * 1000,
  });
}

export function useTraceabilityQuery(params: {
  spaceId: string | undefined;
  rowFilter?: IRequirementFilter;
  columnFilter?: IRequirementFilter;
}) {
  return useQuery({
    queryKey: [
      "requirement-traceability",
      params.spaceId,
      params.rowFilter,
      params.columnFilter,
    ],
    queryFn: () =>
      requirementService.getTraceabilityMatrix({
        spaceId: params.spaceId,
        rowFilter: params.rowFilter,
        columnFilter: params.columnFilter,
      }),
    enabled: !!params.spaceId,
    placeholderData: keepPreviousData,
  });
}

export function useBaselinesQuery(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["requirement-baselines", spaceId],
    queryFn: () => requirementService.getBaselines(spaceId),
    enabled: !!spaceId,
  });
}

export function useCreateBaselineMutation() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: requirementService.createBaseline,
    onSuccess: (data) => {
      notifications.show({
        message: t("Baseline v{{version}} created", { version: data.version }),
      });
      qc.invalidateQueries({
        queryKey: ["requirement-baselines", data.spaceId],
      });
    },
    onError: (error) => {
      notifications.show({
        message: errorMessage(error) || t("Failed to create baseline"),
        color: "red",
      });
    },
  });
}

export function useDeleteBaselineMutation(spaceId: string | undefined) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: requirementService.deleteBaseline,
    onSuccess: () => {
      notifications.show({ message: t("Baseline deleted") });
      qc.invalidateQueries({ queryKey: ["requirement-baselines", spaceId] });
    },
    onError: (error) => {
      notifications.show({
        message: errorMessage(error) || t("Failed to delete baseline"),
        color: "red",
      });
    },
  });
}

export function useCompareBaselinesQuery(params: {
  fromBaselineId?: string;
  toBaselineId?: string;
}) {
  return useQuery({
    queryKey: [
      "requirement-baseline-compare",
      params.fromBaselineId,
      params.toBaselineId,
    ],
    queryFn: () =>
      requirementService.compareBaselines({
        fromBaselineId: params.fromBaselineId,
        toBaselineId: params.toBaselineId,
      }),
    enabled: !!params.fromBaselineId,
  });
}

export function useRequirementTypesQuery(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["requirement-types", spaceId],
    queryFn: () => requirementService.listRequirementTypes(spaceId!),
    enabled: !!spaceId,
    staleTime: 30 * 1000,
  });
}

/**
 * Wraps a requirement-type action: on success refresh the types and anything
 * showing validation results; on failure show the server's message.
 */
export function useRequirementTypeMutation<TArgs, TResult>(
  spaceId: string | undefined,
  fn: (args: TArgs) => Promise<TResult>,
  successMessage?: (result: TResult) => string | undefined,
) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const message = successMessage?.(result);
      if (message) notifications.show({ message });
      qc.invalidateQueries({ queryKey: ["requirement-types", spaceId] });
      qc.invalidateQueries({ queryKey: ["requirements", spaceId] });
      qc.invalidateQueries({ queryKey: ["page-requirement-validation"] });
    },
    onError: (error) => {
      notifications.show({
        message: errorMessage(error) || t("Something went wrong"),
        color: "red",
      });
    },
  });
}

export function usePageValidationQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: ["page-requirement-validation", pageId],
    queryFn: () => requirementService.getPageValidation(pageId!),
    enabled: !!pageId,
    refetchInterval: 30 * 1000,
  });
}

export function useBaselineItemQuery(
  baselineId: string | null | undefined,
  key: string | undefined,
) {
  return useQuery({
    queryKey: ["requirement-baseline-item", baselineId, key],
    queryFn: () => requirementService.getBaselineItem(baselineId!, key!),
    enabled: !!baselineId && !!key,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrokenLinksQuery(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["requirement-broken-links", spaceId],
    queryFn: () => requirementService.getBrokenLinks(spaceId!),
    enabled: !!spaceId,
  });
}
