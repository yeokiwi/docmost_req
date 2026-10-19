import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";

export type PageRole = "reader" | "writer";

export interface IPageAccessInfo {
  restricted: boolean;
  inheritedFrom: { id: string; title: string | null; slugId: string } | null;
  permissions: { canManage: boolean };
}

export interface IPagePermissionMember {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  memberCount?: number;
  type: "user" | "group";
  role: PageRole;
}

const post = async <T,>(path: string, body: any): Promise<T> =>
  (await api.post<T>(`/page-permissions/${path}`, body)).data;

export function usePageAccessQuery(pageId: string, enabled = true) {
  return useQuery({
    queryKey: ["page-access", pageId],
    queryFn: () => post<IPageAccessInfo>("info", { pageId }),
    enabled: !!pageId && enabled,
  });
}

export function usePagePermissionMembersQuery(pageId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["page-permission-members", pageId],
    queryFn: () =>
      post<IPagination<IPagePermissionMember>>("members", { pageId, limit: 100 }),
    enabled: !!pageId && enabled,
  });
}

type Action =
  | { kind: "restrict" }
  | { kind: "unrestrict" }
  | { kind: "add"; userIds: string[]; groupIds: string[]; role: PageRole }
  | { kind: "remove"; userId?: string; groupId?: string }
  | { kind: "role"; userId?: string; groupId?: string; role: PageRole };

export function usePageAccessMutation(pageId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<any, any, Action>({
    mutationFn: (a) => {
      switch (a.kind) {
        case "restrict":
          return post("restrict", { pageId });
        case "unrestrict":
          return post("unrestrict", { pageId });
        case "add":
          return post("add", { pageId, userIds: a.userIds, groupIds: a.groupIds, role: a.role });
        case "remove":
          return post("remove", { pageId, userId: a.userId, groupId: a.groupId });
        case "role":
          return post("change-role", { pageId, userId: a.userId, groupId: a.groupId, role: a.role });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-access", pageId] });
      queryClient.invalidateQueries({ queryKey: ["page-permission-members", pageId] });
      // page info carries hasRestriction / canEdit
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
    onError: (err) =>
      notifications.show({
        message: err?.response?.data?.message ?? t("Something went wrong"),
        color: "red",
      }),
  });
}
