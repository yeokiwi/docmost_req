export type VerificationType = "expiring" | "qms";
export type PeriodUnit = "day" | "week" | "month" | "year";
export type VerificationState =
  | "unverified"
  | "verified"
  | "expiring_soon"
  | "expired"
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "changed";

export interface IVerificationUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  email?: string;
}

export interface IPageVerification {
  id: string;
  pageId: string;
  type: VerificationType;
  status: string | null;
  state: VerificationState;
  periodAmount: number | null;
  periodUnit: PeriodUnit | null;
  verifiedAt: string | null;
  verifiedBy: IVerificationUser | null;
  expiresAt: string | null;
  requestedAt: string | null;
  requestedBy: IVerificationUser | null;
  rejectedAt: string | null;
  rejectedBy: IVerificationUser | null;
  rejectionComment: string | null;
  verifiers: IVerificationUser[];
}

export interface IPageVerificationInfo {
  verification: IPageVerification | null;
  permissions: { canManage: boolean; canVerify: boolean };
}

export interface ISetupVerification {
  pageId: string;
  type: VerificationType;
  verifierIds: string[];
  periodAmount?: number | null;
  periodUnit?: PeriodUnit;
}

export interface IVerificationListItem {
  id: string;
  pageId: string;
  spaceId: string;
  type: VerificationType;
  status: string | null;
  state: VerificationState;
  verifiedAt: string | null;
  expiresAt: string | null;
  requestedAt: string | null;
  pageTitle: string | null;
  pageIcon: string | null;
  pageSlugId: string;
  spaceName: string;
  spaceSlug: string;
  verifiedByName: string | null;
}
