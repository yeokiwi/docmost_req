import { Alert, Button, Divider, Stack } from "@mantine/core";
import { IconKey } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { IAuthProvider } from "@/features/workspace/types/workspace.types.ts";

interface SsoLoginButtonsProps {
  providers?: IAuthProvider[];
  /** show the "or" divider below the buttons (password form follows) */
  withDivider?: boolean;
}

/** "Continue with …" buttons for the workspace's enabled OIDC providers. */
export function SsoLoginButtons({ providers, withDivider }: SsoLoginButtonsProps) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const error = params.get("sso_error");
  const redirect = params.get("redirect");
  const oidc = (providers ?? []).filter((p) => p.type === "oidc");

  const start = (id: string) => {
    const target = redirect && redirect.startsWith("/") ? redirect : "/home";
    window.location.href = `/api/sso/oidc/${id}/login?redirect=${encodeURIComponent(target)}`;
  };

  if (oidc.length === 0 && !error) return null;

  return (
    <Stack gap="sm" mb="md">
      {error && (
        <Alert color="red" title={t("Single sign-on failed")}>
          {error}
        </Alert>
      )}
      {oidc.map((p) => (
        <Button
          key={p.id}
          variant="default"
          fullWidth
          leftSection={<IconKey size={16} />}
          onClick={() => start(p.id)}
        >
          {t("Continue with {{name}}", { name: p.name })}
        </Button>
      ))}
      {withDivider && oidc.length > 0 && (
        <Divider label={t("or")} labelPosition="center" />
      )}
    </Stack>
  );
}
