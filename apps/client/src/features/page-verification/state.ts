import { VerificationState } from "./types";

export const STATE_META: Record<
  VerificationState,
  { label: string; color: string }
> = {
  unverified: { label: "Not verified", color: "gray" },
  verified: { label: "Verified", color: "green" },
  expiring_soon: { label: "Expires soon", color: "yellow" },
  expired: { label: "Verification expired", color: "red" },
  draft: { label: "Draft", color: "gray" },
  pending: { label: "In approval", color: "blue" },
  approved: { label: "Approved", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  changed: { label: "Changed since approval", color: "orange" },
};
