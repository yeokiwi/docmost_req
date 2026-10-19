import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  getTemplatePermissions,
  getTemplates,
  updateTemplate,
} from "@/features/template/services/template-service.ts";
import { ITemplate, ITemplateInput } from "@/features/template/types.ts";

export function useTemplatesQuery(params: { spaceId?: string; query?: string }) {
  return useQuery({
    queryKey: ["templates", params],
    queryFn: () => getTemplates({ ...params, limit: 100 }),
    placeholderData: keepPreviousData,
  });
}

export function useTemplateQuery(templateId?: string) {
  return useQuery({
    queryKey: ["template", templateId],
    queryFn: () => getTemplateById(templateId),
    enabled: !!templateId,
  });
}

export function useTemplatePermissionsQuery(spaceId?: string) {
  return useQuery({
    queryKey: ["template-permissions", spaceId ?? null],
    queryFn: () => getTemplatePermissions(spaceId),
  });
}

export function useCreateTemplateMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<ITemplate, any, ITemplateInput>({
    mutationFn: (data) => createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      notifications.show({ message: t("Template saved") });
    },
    onError: (err) => {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to save template"),
        color: "red",
      });
    },
  });
}

export function useUpdateTemplateMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<
    ITemplate,
    any,
    Partial<ITemplateInput> & { templateId: string }
  >({
    mutationFn: (data) => updateTemplate(data),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.setQueryData(["template", template.id], (prev: any) => ({
        ...prev,
        ...template,
      }));
    },
    onError: (err) => {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to save template"),
        color: "red",
      });
    },
  });
}

export function useDeleteTemplateMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<void, any, string>({
    mutationFn: (templateId) => deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      notifications.show({ message: t("Template deleted") });
    },
    onError: (err) => {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to delete template"),
        color: "red",
      });
    },
  });
}
