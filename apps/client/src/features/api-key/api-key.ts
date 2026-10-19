import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";

export interface IApiKey {
  id: string;
  name: string | null;
  creatorId: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  creatorName?: string | null;
  creatorEmail?: string | null;
  creatorAvatarUrl?: string | null;
}

export async function getApiKeys(params: { adminView?: boolean }) {
  const req = await api.post<{ items: IApiKey[] }>("/api-keys", params);
  return req.data;
}

export function useApiKeysQuery(adminView = false) {
  return useQuery({
    queryKey: ["api-key-list", { adminView }],
    queryFn: () => getApiKeys({ adminView }),
  });
}

export function useCreateApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<
    { apiKey: IApiKey; token: string },
    any,
    { name: string; expiresAt?: string }
  >({
    mutationFn: async (data) =>
      (await api.post("/api-keys/create", data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-key-list"] }),
    onError: (err) =>
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to create API key"),
        color: "red",
      }),
  });
}

export function useRevokeApiKeyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<void, any, string>({
    mutationFn: async (apiKeyId) => {
      await api.post("/api-keys/revoke", { apiKeyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-key-list"] });
      notifications.show({ message: t("API key revoked") });
    },
    onError: (err) =>
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to revoke API key"),
        color: "red",
      }),
  });
}
