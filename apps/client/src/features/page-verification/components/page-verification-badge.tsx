import { Badge, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconShieldCheck, IconShieldExclamation } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useHasFeature } from "@/features/edition/entitlements";
import { Feature } from "@/features/edition/features";
import { usePageVerificationQuery } from "../queries";
import { STATE_META } from "../state";
import PageVerificationModal from "./page-verification-modal";

// Shown in the page byline when the page has a verification set up.
export function PageVerificationBadge({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const enabled = useHasFeature(Feature.PAGE_VERIFICATION);
  const { data } = usePageVerificationQuery(pageId, enabled);
  const [opened, { open, close }] = useDisclosure(false);
  const v = data?.verification;
  if (!enabled || !v) return null;

  const meta = STATE_META[v.state];
  const good = v.state === "verified" || v.state === "approved";

  return (
    <>
      <Tooltip label={t("Page verification")} withArrow>
        <Badge
          variant="light"
          color={meta.color}
          leftSection={
            good ? <IconShieldCheck size={12} /> : <IconShieldExclamation size={12} />
          }
          style={{ cursor: "pointer", textTransform: "none" }}
          onClick={open}
          component="button"
        >
          {t(meta.label)}
        </Badge>
      </Tooltip>
      {opened && (
        <PageVerificationModal pageId={pageId} opened={opened} onClose={close} />
      )}
    </>
  );
}
