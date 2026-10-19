import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";
import { ISpace } from "@/features/space/types/space.types.ts";

export async function getPersonalSpace(): Promise<ISpace | null> {
  const req = await api.post<ISpace | null>("/spaces/personal");
  return req.data ?? null;
}

export async function createPersonalSpace(name?: string): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/personal/create", { name });
  return req.data;
}

export function usePersonalSpaceQuery(enabled = true) {
  return useQuery({
    queryKey: ["personal-space"],
    queryFn: getPersonalSpace,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePersonalSpaceMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<ISpace, any, string | undefined>({
    mutationFn: (name) => createPersonalSpace(name),
    onSuccess: (space) => {
      queryClient.setQueryData(["personal-space"], space);
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    },
    onError: (err) => {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to create space"),
        color: "red",
      });
    },
  });
}
