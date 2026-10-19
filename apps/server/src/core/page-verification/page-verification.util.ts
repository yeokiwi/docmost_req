import { PeriodUnit, VerificationType } from './page-verification.dto';

export const EXPIRING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type VerificationState =
  // expiring
  | 'unverified'
  | 'verified'
  | 'expiring_soon'
  | 'expired'
  // qms (approval workflow)
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changed';

export function addPeriod(from: Date, amount: number, unit: PeriodUnit): Date {
  const d = new Date(from.getTime());
  switch (unit) {
    case 'day':
      d.setUTCDate(d.getUTCDate() + amount);
      break;
    case 'week':
      d.setUTCDate(d.getUTCDate() + amount * 7);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + amount);
      break;
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + amount);
      break;
  }
  return d;
}

/**
 * The state shown to users. It is derived from the stored row and the page's
 * last update so that expiry and "changed since approval" need no writes.
 */
export function computeVerificationState(
  v: {
    type: string;
    status: string | null;
    verifiedAt: Date | string | null;
    expiresAt: Date | string | null;
  },
  pageUpdatedAt: Date | string | null,
  now: Date = new Date(),
): VerificationState {
  const type = v.type as VerificationType;
  if (type === 'qms') {
    if (v.status === 'pending') return 'pending';
    if (v.status === 'rejected') return 'rejected';
    if (v.status === 'approved' && v.verifiedAt) {
      // a minute of grace covers the save that happens around approval
      if (
        pageUpdatedAt &&
        new Date(pageUpdatedAt).getTime() >
          new Date(v.verifiedAt).getTime() + 60_000
      ) {
        return 'changed';
      }
      return 'approved';
    }
    return 'draft';
  }

  if (!v.verifiedAt) return 'unverified';
  if (!v.expiresAt) return 'verified';
  const expiresMs = new Date(v.expiresAt).getTime();
  if (expiresMs <= now.getTime()) return 'expired';
  if (expiresMs - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS) {
    return 'expiring_soon';
  }
  return 'verified';
}

export function isPositiveState(state: VerificationState): boolean {
  return state === 'verified' || state === 'expiring_soon' || state === 'approved';
}
