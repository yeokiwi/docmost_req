import { useState } from "react";
import { Badge, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function buildBulkKeys(
  prefix: string,
  first: string,
  count: number,
): string[] {
  const width = first.length;
  const start = parseInt(first, 10);
  return Array.from(
    { length: count },
    (_, i) => `${prefix}${String(start + i).padStart(width, "0")}`,
  );
}

export function validateBulkKeyParts(prefix: string, first: string) {
  if (!prefix.trim()) return "prefix";
  if (/[/\\]/.test(prefix)) return "slash";
  if (!/^\d+$/.test(first)) return "number";
  return null;
}

/**
 * "Insert the Requirement macro": one requirement per selected line, with the
 * chosen prefix and first number (leading zeros set the number width).
 */
export default function BulkInsertRequirementsForm({
  count,
  defaultPrefix,
  defaultNumber,
  allowedPrefixes = null,
  prefixSuggestions = [],
  onSubmit,
  onCancel,
}: {
  count: number;
  defaultPrefix: string;
  defaultNumber: string;
  // set when keys are locked: the only prefixes that may be used
  allowedPrefixes?: string[] | null;
  // requirement types: clicking one fills in its prefix and next number
  prefixSuggestions?: { prefix: string; number: string; label: string }[];
  onSubmit: (prefix: string, first: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [prefix, setPrefix] = useState(defaultPrefix);
  const [first, setFirst] = useState(defaultNumber);

  const locked =
    !!allowedPrefixes &&
    !!prefix.trim() &&
    !allowedPrefixes.includes(prefix.trim().toUpperCase());
  const problem = validateBulkKeyParts(prefix, first) ?? (locked ? "locked" : null);
  const preview = problem ? [] : buildBulkKeys(prefix.trim(), first, count);

  return (
    <Stack gap="sm">
      <Text size="sm">
        {t("This will create one requirement for each of the {{count}} selected lines.", {
          count,
        })}
      </Text>
      <Group align="flex-start" grow>
        <TextInput
          label={t("Prefix")}
          description={t("Mandatory. No / or \\ allowed.")}
          value={prefix}
          onChange={(e) => setPrefix(e.currentTarget.value)}
          error={
            problem === "prefix"
              ? t("Enter a prefix")
              : problem === "slash"
                ? t("A key cannot contain / or \\")
                : problem === "locked"
                  ? t("Keys are locked: use the prefix of a requirement type")
                  : undefined
          }
          ff="monospace"
          data-autofocus
        />
        <TextInput
          label={t("First number")}
          description={t("Use leading zeros to keep keys sorted.")}
          value={first}
          onChange={(e) => setFirst(e.currentTarget.value)}
          error={problem === "number" ? t("Enter a number") : undefined}
          ff="monospace"
        />
      </Group>
      {prefixSuggestions.length > 0 && (
        <Group gap={6}>
          {prefixSuggestions.map((s) => (
            <Badge
              key={s.prefix}
              variant="light"
              radius="sm"
              tt="none"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setPrefix(s.prefix);
                setFirst(s.number);
              }}
            >
              {s.label} · {s.prefix}
              {s.number}
            </Badge>
          ))}
        </Group>
      )}
      {preview.length > 0 && (
        <Text size="xs" c="dimmed" ff="monospace">
          {preview.length > 3
            ? `${preview[0]}, ${preview[1]} … ${preview[preview.length - 1]}`
            : preview.join(", ")}
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button
          disabled={!!problem}
          onClick={() => onSubmit(prefix.trim(), first)}
        >
          {t("Insert")}
        </Button>
      </Group>
    </Stack>
  );
}
