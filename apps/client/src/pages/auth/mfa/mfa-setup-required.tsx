import { Box, Container, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout.tsx";
import classes from "@/features/auth/components/auth.module.css";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { getPostLoginRedirect } from "@/lib/app-route.ts";
import { MfaEnroll } from "@/features/mfa/mfa-enroll.tsx";
import { beginMfaLoginSetup, enableMfaLogin } from "@/features/mfa/mfa-service.ts";

export default function MfaSetupRequiredPage() {
  const { t } = useTranslation();
  return (
    <AuthLayout>
      <DocumentTitle title={t("Set up two-factor authentication")} />
      <Container size={460} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={2} ta="center" fw={500} mb="xs">
            {t("Set up two-factor authentication")}
          </Title>
          <Text size="sm" c="dimmed" ta="center" mb="md">
            {t("Your workspace requires two-factor authentication.")}
          </Text>
          <MfaEnroll
            begin={beginMfaLoginSetup}
            confirm={enableMfaLogin}
            onDone={() => (window.location.href = getPostLoginRedirect())}
          />
        </Box>
      </Container>
    </AuthLayout>
  );
}
