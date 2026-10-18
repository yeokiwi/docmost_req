import { useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

export type TransformOptions = {
  linkSpace: boolean;
  definePattern: boolean;
  pattern: string;
};

/** Regex that matches keys sharing the prefix of `key`, e.g. REQ-567 -> REQ-[^\s/\\]+ */
export function defaultKeyPattern(key: string): string {
  const prefix = key.match(/^(.*?)(\d[^\s/\\]*)$/)?.[1] ?? "";
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `${escaped}[^\\s/\\\\]+`;
}

/**
 * The "transform" dialog: define the selected key as a requirement (or link
 * it), link its other occurrences, and optionally define similar keys.
 */
export default function TransformKeyForm({
  keyText,
  whole,
  countSimilar,
  canLinkSpace,
  onSubmit,
  onCancel,
}: {
  keyText: string;
  whole: boolean;
  countSimilar: (pattern: string) => number | null;
  canLinkSpace: boolean;
  onSubmit: (options: TransformOptions) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [linkSpace, setLinkSpace] = useState(canLinkSpace);
  const [definePattern, setDefinePattern] = useState(false);
  const [pattern, setPattern] = useState(defaultKeyPattern(keyText));

  const similar = countSimilar(pattern);

  return (
    <Stack gap="sm">
      <Text size="sm">
        {whole
          ? t('"{{key}}" will become a requirement.', { key: keyText })
          : t('"{{key}}" will become a link to the requirement.', {
              key: keyText,
            })}
      </Text>
      <Checkbox
        checked
        disabled
        label={t('Make links for every "{{key}}" on this page.', {
          key: keyText,
        })}
      />
      <Checkbox
        checked={linkSpace}
        disabled={!canLinkSpace}
        onChange={(e) => setLinkSpace(e.currentTarget.checked)}
        label={t('Make links for every "{{key}}" in this space.', {
          key: keyText,
        })}
      />
      {whole && (
        <>
          <Checkbox
            checked={definePattern}
            onChange={(e) => setDefinePattern(e.currentTarget.checked)}
            label={t(
              "Create similar definitions for all keys matching the pattern below on this page{{count}}.",
              {
                count:
                  similar === null
                    ? ""
                    : ` (${t("about {{count}} other occurrences", { count: similar })})`,
              },
            )}
          />
          {definePattern && (
            <TextInput
              size="xs"
              ff="monospace"
              label={t("Pattern")}
              description={t(
                "A regular expression that must match the complete key.",
              )}
              value={pattern}
              onChange={(e) => setPattern(e.currentTarget.value)}
              error={similar === null ? t("Invalid regular expression") : undefined}
            />
          )}
        </>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button
          disabled={definePattern && similar === null}
          onClick={() => onSubmit({ linkSpace, definePattern, pattern })}
        >
          {t("Create")}
        </Button>
      </Group>
    </Stack>
  );
}
