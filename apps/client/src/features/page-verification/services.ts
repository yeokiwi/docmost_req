import api from "@/lib/api-client";
import {
  IPageVerificationInfo,
  ISetupVerification,
  IVerificationListItem,
  VerificationType,
} from "./types";

const post = async <T,>(path: string, body: any): Promise<T> =>
  (await api.post<T>(`/page-verifications/${path}`, body)).data;

export const getPageVerification = (pageId: string) =>
  post<IPageVerificationInfo>("info", { pageId });
export const setupPageVerification = (data: ISetupVerification) =>
  post<IPageVerificationInfo>("setup", data);
export const removePageVerification = (pageId: string) =>
  post<void>("remove", { pageId });
export const verifyPage = (pageId: string) =>
  post<IPageVerificationInfo>("verify", { pageId });
export const requestPageApproval = (pageId: string) =>
  post<IPageVerificationInfo>("request-approval", { pageId });
export const approvePage = (pageId: string) =>
  post<IPageVerificationInfo>("approve", { pageId });
export const rejectPage = (pageId: string, comment?: string) =>
  post<IPageVerificationInfo>("reject", { pageId, comment });
export const listVerifications = (params: {
  spaceId?: string;
  type?: VerificationType;
  state?: string;
}) => post<{ items: IVerificationListItem[] }>("list", params);
