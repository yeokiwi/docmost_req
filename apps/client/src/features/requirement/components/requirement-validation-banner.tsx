import { useState } from "react";
import { Alert, Anchor, Group, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { usePageValidationQuery } from "../queries/requirement-query";

/**
 * Banner above a page whose requirements don't satisfy their type. In view
 * mode only errors count; while editing, warnings do too.
 */
export default function RequirementValidationBanner({
  pageId,
  editing,
}: {
  pageId: string | undefined;
  editing: boolean;
}) {
  const { t } = useTranslation();
  const { data } = usePageValidationQuery(pageId);
  const [index, setIndex] = useState(0);

  const items = (data ?? []).filter(
    (i) => editing || i.validationStatus === "error",
  );
  if (!items.length) return null;

  const errors = items.filter((i) => i.validationStatus === "error").length;
  const warnings = items.length - errors;

  // step through the affected requirements one by one
  const showNext = () => {
    const item = items[index % items.length];
    setIndex((i) => i + 1);
    const el = document.querySelector(
      `[data-requirement-key="${CSS.escape(item.key)}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <Alert
      variant="light"
      color={errors ? "red" : "yellow"}
      icon={<IconAlertTriangle size={16} />}
      py={6}
      mb="sm"
    >
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text size="sm">
          {errors > 0 &&
            t("{{count}} requirements don't meet their type", { count: errors })}
          {errors > 0 && warnings > 0 && " · "}
          {warnings > 0 &&
            t("{{count}} requirements miss optional properties", { count: warnings })}
        </Text>
        <Anchor size="sm" component="button" onClick={showNext}>
          {t("Show")}
        </Anchor>
      </Group>
    </Alert>
  );
}
