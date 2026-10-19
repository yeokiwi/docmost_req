import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  approvePage,
  getPageVerification,
  listVerifications,
  rejectPage,
  removePageVerification,
  requestPageApproval,
  setupPageVerification,
  verifyPage,
} from "./services";
import { IPageVerificationInfo, VerificationType } from "./types";

export const VERIFICATION_KEY = (pageId: string) => ["page-verification", pageId];

export function usePageVerificationQuery(pageId?: string, enabled = true) {
  return useQuery({
    queryKey: VERIFICATION_KEY(pageId ?? ""),
    queryFn: () => getPageVerification(pageId),
    enabled: !!pageId && enabled,
  });
}

export function useVerificationListQuery(params: {
  spaceId?: string;
  type?: VerificationType;
  state?: string;
}) {
  return useQuery({
    queryKey: ["verification-list", params],
    queryFn: () => listVerifications(params),
  });
}

type Action =
  | { kind: "setup"; data: Parameters<typeof setupPageVerification>[0] }
  | { kind: "remove" }
  | { kind: "verify" }
  | { kind: "request" }
  | { kind: "approve" }
  | { kind: "reject"; comment?: string };

export function usePageVerificationMutation(pageId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IPageVerificationInfo | void, any, Action>({
    mutationFn: (action) => {
      switch (action.kind) {
        case "setup":
          return setupPageVerification(action.data);
        case "remove":
          return removePageVerification(pageId);
        case "verify":
          return verifyPage(pageId);
        case "request":
          return requestPageApproval(pageId);
        case "approve":
          return approvePage(pageId);
        case "reject":
          return rejectPage(pageId, action.comment);
      }
    },
    onSuccess: (result, action) => {
      if (result) {
        queryClient.setQueryData(VERIFICATION_KEY(pageId), result);
      } else {
        queryClient.invalidateQueries({ queryKey: VERIFICATION_KEY(pageId) });
      }
      queryClient.invalidateQueries({ queryKey: ["verification-list"] });
      const messages: Record<Action["kind"], string> = {
        setup: t("Verification settings saved"),
        remove: t("Verification removed"),
        verify: t("Page verified"),
        request: t("Approval requested"),
        approve: t("Page approved"),
        reject: t("Page rejected"),
      };
      notifications.show({ message: messages[action.kind] });
    },
    onError: (err) => {
      notifications.show({
        message: err?.response?.data?.message ?? t("Something went wrong"),
        color: "red",
      });
    },
  });
}
