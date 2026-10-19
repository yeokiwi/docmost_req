import { useState } from "react";
import { Anchor, Box, Button, Container, PinInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout.tsx";
import classes from "@/features/auth/components/auth.module.css";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { getPostLoginRedirect } from "@/lib/app-route.ts";
import APP_ROUTE from "@/lib/app-route.ts";
import { verifyMfaLogin } from "@/features/mfa/mfa-service.ts";

export default function MfaChallengePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (value = code) => {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await verifyMfaLogin(value);
      window.location.href = getPostLoginRedirect();
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message;
      if (status === 401 && message === "Sign in again") {
        navigate(APP_ROUTE.AUTH.LOGIN);
        return;
      }
      setError(message ?? t("Invalid authentication code"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <DocumentTitle title={t("Two-factor authentication")} />
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={2} ta="center" fw={500} mb="xs">
            {t("Two-factor authentication")}
          </Title>
          <Stack align="center">
            <Text size="sm" c="dimmed" ta="center">
              {useBackup
                ? t("Enter one of your backup codes.")
                : t("Enter the 6-digit code from your authenticator app.")}
            </Text>
            {useBackup ? (
              <TextInput
                w="100%"
                placeholder="xxxx-xxxx"
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoFocus
              />
            ) : (
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
            )}
            {error && (
              <Text size="sm" c="red">
                {error}
              </Text>
            )}
            <Button fullWidth onClick={() => submit()} loading={busy} disabled={!code}>
              {t("Verify")}
            </Button>
            <Anchor
              component="button"
              size="sm"
              onClick={() => {
                setUseBackup(!useBackup);
                setCode("");
                setError(null);
              }}
            >
              {useBackup ? t("Use authenticator app") : t("Use a backup code")}
            </Anchor>
            <Anchor size="sm" c="dimmed" onClick={() => navigate(APP_ROUTE.AUTH.LOGIN)}>
              {t("Back to login")}
            </Anchor>
          </Stack>
        </Box>
      </Container>
    </AuthLayout>
  );
}
