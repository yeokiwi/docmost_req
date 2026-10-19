import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";

export interface ISsoProvider {
  id: string;
  name: string;
  type: "oidc";
  oidcIssuer: string;
  oidcClientId: string;
  allowSignup: boolean;
  isEnabled: boolean;
  groupSync: boolean;
  redirectUri: string;
  createdAt: string;
}

export type SsoProviderInput = {
  name: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret?: string;
  allowSignup: boolean;
  isEnabled: boolean;
  groupSync: boolean;
};

const post = async <T,>(path: string, body?: any): Promise<T> =>
  (await api.post<T>(`/sso/${path}`, body ?? {})).data;

export function useSsoProvidersQuery() {
  return useQuery({ queryKey: ["sso-providers"], queryFn: () => post<ISsoProvider[]>("providers") });
}

export function useSaveSsoProviderMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<ISsoProvider, any, SsoProviderInput & { providerId?: string }>({
    mutationFn: ({ providerId, ...data }) =>
      providerId
        ? post("providers/update", { providerId, ...data })
        : post("providers/create", { type: "oidc", ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-providers"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-public"] });
      notifications.show({ message: t("SSO provider saved") });
    },
    onError: (err) =>
      notifications.show({ message: err?.response?.data?.message ?? t("Failed to save"), color: "red" }),
  });
}

export function useDeleteSsoProviderMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<void, any, string>({
    mutationFn: (providerId) => post("providers/delete", { providerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-providers"] });
      notifications.show({ message: t("SSO provider deleted") });
    },
    onError: (err) =>
      notifications.show({ message: err?.response?.data?.message ?? t("Failed to delete"), color: "red" }),
  });
}

export const testSsoProvider = (providerId: string) =>
  post<{ ok: boolean; issuer: string; authorizationEndpoint: string }>("providers/test", { providerId });
