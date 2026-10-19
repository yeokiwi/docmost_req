import { useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  PinInput,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useHasFeature } from "@/features/edition/entitlements";
import { Feature } from "@/features/edition/features";
import {
  beginMfaSetup,
  disableMfa,
  enableMfa,
  getMfaStatus,
  regenerateBackupCodes,
} from "./mfa-service";
import { BackupCodes, MfaEnroll } from "./mfa-enroll";

export function AccountMfaSection() {
  const { t } = useTranslation();
  const enabled = useHasFeature(Feature.MFA);
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["mfa-status"],
    queryFn: getMfaStatus,
    enabled,
  });
  const [mode, setMode] = useState<null | "enroll" | "disable" | "codes">(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!enabled || !status) return null;

  const close = () => {
    setMode(null);
    setPassword("");
    setCode("");
    setNewCodes(null);
    queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Group gap="xs">
            <Text size="md">{t("Two-factor authentication")}</Text>
            <Badge size="sm" variant="light" color={status.isEnabled ? "green" : "gray"}>
              {status.isEnabled ? t("On") : t("Off")}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {status.isEnabled
              ? t("{{n}} backup codes left.", { n: status.backupCodesRemaining })
              : t("Protect your account with a code from an authenticator app.")}
          </Text>
        </div>
        {status.isEnabled ? (
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" size="xs" onClick={() => setMode("codes")}>
              {t("New backup codes")}
            </Button>
            {!status.isEnforced && (
              <Button variant="default" color="red" size="xs" onClick={() => setMode("disable")}>
                {t("Turn off")}
              </Button>
            )}
          </Group>
        ) : (
          <Button variant="default" onClick={() => setMode("enroll")}>
            {t("Set up")}
          </Button>
        )}
      </Group>

      <Modal opened={mode === "enroll"} onClose={close} title={t("Set up two-factor authentication")}>
        {mode === "enroll" && (
          <MfaEnroll begin={beginMfaSetup} confirm={enableMfa} onDone={close} />
        )}
      </Modal>

      <Modal opened={mode === "disable"} onClose={close} title={t("Turn off two-factor authentication")}>
        <Stack>
          <PasswordInput
            label={t("Confirm your password")}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button
              color="red"
              loading={busy}
              disabled={!password}
              onClick={() =>
                run(async () => {
                  await disableMfa(password);
                  notifications.show({ message: t("Two-factor authentication turned off") });
                  close();
                })
              }
            >
              {t("Turn off")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={mode === "codes"} onClose={close} title={t("New backup codes")}>
        {newCodes ? (
          <Stack>
            <BackupCodes codes={newCodes} />
            <Button onClick={close}>{t("Done")}</Button>
          </Stack>
        ) : (
          <Stack align="center">
            <Text size="sm">
              {t("Enter a code from your authenticator app. Your old backup codes will stop working.")}
            </Text>
            <PinInput length={6} type="number" value={code} onChange={setCode} autoFocus />
            <Button
              loading={busy}
              disabled={code.length !== 6}
              onClick={() =>
                run(async () => {
                  const res = await regenerateBackupCodes(code);
                  setNewCodes(res.backupCodes);
                })
              }
            >
              {t("Generate")}
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}
