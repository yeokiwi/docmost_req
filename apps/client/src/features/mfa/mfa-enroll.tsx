import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Image,
  Loader,
  PinInput,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IMfaSetup } from "./mfa-service";

interface MfaEnrollProps {
  begin: () => Promise<IMfaSetup>;
  confirm: (code: string) => Promise<{ backupCodes: string[] }>;
  onDone: () => void;
}

export function BackupCodes({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const text = codes.join("\n");
  return (
    <Stack gap="xs">
      <Alert color="yellow">
        {t(
          "Save these backup codes somewhere safe. Each can be used once to sign in if you lose your device. They will not be shown again.",
        )}
      </Alert>
      <SimpleGrid cols={2} spacing={4}>
        {codes.map((c) => (
          <Code key={c} ta="center" fz="sm">
            {c}
          </Code>
        ))}
      </SimpleGrid>
      <Group gap="xs">
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Button size="xs" variant="default" onClick={copy}>
              {copied ? t("Copied") : t("Copy codes")}
            </Button>
          )}
        </CopyButton>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "docmost-backup-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t("Download")}
        </Button>
      </Group>
    </Stack>
  );
}

/** QR code + code confirmation, then backup codes. */
export function MfaEnroll({ begin, confirm, onDone }: MfaEnrollProps) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<IMfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    begin()
      .then(setSetup)
      .catch((err) => setError(err?.response?.data?.message ?? t("Something went wrong")));
  }, []);

  const submit = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirm(value);
      setCodes(res.backupCodes);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("Invalid code"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <Stack>
        <Text fw={500}>{t("Two-factor authentication is on")}</Text>
        <BackupCodes codes={codes} />
        <Button onClick={onDone}>{t("Continue")}</Button>
      </Stack>
    );
  }

  if (!setup) {
    return error ? <Alert color="red">{error}</Alert> : <Loader size="sm" />;
  }

  return (
    <Stack align="center">
      <Text size="sm" ta="center">
        {t("Scan this QR code with an authenticator app (e.g. Aegis, Google Authenticator, 1Password).")}
      </Text>
      <Image src={setup.qrCodeDataUrl} w={180} h={180} alt={t("QR code")} />
      <Text size="xs" c="dimmed" ta="center">
        {t("Or enter this key manually:")} <Code>{setup.secret}</Code>
      </Text>
      <Text size="sm">{t("Enter the 6-digit code from the app")}</Text>
      <PinInput
        length={6}
        type="number"
        oneTimeCode
        value={code}
        onChange={setCode}
        onComplete={(v) => submit(v)}
        disabled={busy}
        autoFocus
      />
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      <Button onClick={() => submit()} loading={busy} disabled={code.length !== 6}>
        {t("Verify and enable")}
      </Button>
    </Stack>
  );
}
