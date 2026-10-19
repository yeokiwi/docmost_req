import api from "@/lib/api-client";

export interface IMfaSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface IMfaStatus {
  isEnabled: boolean;
  method: string;
  backupCodesRemaining: number;
  isEnforced: boolean;
}

const post = async <T,>(path: string, body?: any): Promise<T> =>
  (await api.post<T>(`/mfa/${path}`, body ?? {})).data;

export const getMfaStatus = () => post<IMfaStatus>("status");
export const beginMfaSetup = () => post<IMfaSetup>("setup");
export const enableMfa = (code: string) =>
  post<{ backupCodes: string[] }>("enable", { code });
export const disableMfa = (password: string) => post<void>("disable", { password });
export const regenerateBackupCodes = (code: string) =>
  post<{ backupCodes: string[] }>("backup-codes", { code });
export const resetUserMfa = (userId: string) => post<void>("reset-user", { userId });

// second sign-in step, authenticated by the short-lived mfaToken cookie
export const verifyMfaLogin = (code: string) => post<void>("login/verify", { code });
export const beginMfaLoginSetup = () => post<IMfaSetup>("login/setup");
export const enableMfaLogin = (code: string) =>
  post<{ backupCodes: string[] }>("login/enable", { code });
