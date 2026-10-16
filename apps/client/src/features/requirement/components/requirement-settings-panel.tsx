import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useRequirementSettingsQuery,
  useUpdateRequirementSettingsMutation,
} from "../queries/requirement-query";
import { IRequirementPropertyDefinition } from "../types/requirement.types";

const PREFIX_REGEX = /^[A-Za-z][A-Za-z0-9_]{1,15}$/;

export default function RequirementSettingsPanel({
  spaceId,
  readOnly,
}: {
  spaceId: string;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useRequirementSettingsQuery(spaceId);
  const mutation = useUpdateRequirementSettingsMutation();

  const [keyPrefix, setKeyPrefix] = useState("");
  const [keyPadding, setKeyPadding] = useState<number>(3);
  const [schema, setSchema] = useState<IRequirementPropertyDefinition[]>([]);

  useEffect(() => {
    if (isLoading) return;
    setKeyPrefix(settings?.keyPrefix ?? "");
    setKeyPadding(settings?.keyPadding ?? 3);
    setSchema(settings?.propertySchema ?? []);
  }, [settings, isLoading]);

  // the prefix is locked once keys have been handed out
  const prefixLocked = !!settings && settings.nextSeq > 1;
  const prefixValid = PREFIX_REGEX.test(keyPrefix);
  const example = prefixValid
    ? `${keyPrefix.toUpperCase()}-${String(settings?.nextSeq ?? 1).padStart(keyPadding || 1, "0")}`
    : "";

  const updateDef = (
    index: number,
    patch: Partial<IRequirementPropertyDefinition>,
  ) =>
    setSchema((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );

  const save = () =>
    mutation.mutate({
      spaceId,
      keyPrefix: keyPrefix.toUpperCase(),
      keyPadding,
      propertySchema: schema
        .filter((d) => d.name.trim())
        .map((d) => ({
          name: d.name.trim(),
          type: d.type,
          options: d.type === "select" ? d.options ?? [] : undefined,
        })),
    });

  return (
    <Stack gap="md" mt="md">
      <div>
        <Title order={5}>{t("Requirement keys")}</Title>
        <Text size="sm" c="dimmed">
          {t(
            "Requirements in this space get keys built from this prefix, such as SYS-001.",
          )}
        </Text>
      </div>

      <Group align="flex-start">
        <TextInput
          label={t("Key prefix")}
          value={keyPrefix}
          onChange={(e) => setKeyPrefix(e.currentTarget.value.toUpperCase())}
          disabled={readOnly || prefixLocked}
          error={
            keyPrefix && !prefixValid
              ? t("2-16 letters, digits or underscores, starting with a letter")
              : undefined
          }
          description={
            prefixLocked
              ? t("Locked because keys have already been assigned")
              : undefined
          }
          w={220}
        />
        <NumberInput
          label={t("Number padding")}
          value={keyPadding}
          min={1}
          max={8}
          onChange={(v) => setKeyPadding(Number(v) || 3)}
          disabled={readOnly}
          w={140}
        />
      </Group>
      {example && (
        <Text size="sm">
          {t("Next key")}: <Text span ff="monospace">{example}</Text>
        </Text>
      )}

      <div>
        <Title order={5}>{t("Properties")}</Title>
        <Text size="sm" c="dimmed">
          {t(
            "Standard properties offered on every requirement. Authors can still add their own.",
          )}
        </Text>
      </div>

      <Stack gap="xs">
        {schema.map((def, index) => (
          <Group key={index} align="flex-end" wrap="nowrap">
            <TextInput
              label={index === 0 ? t("Name") : undefined}
              value={def.name}
              onChange={(e) => updateDef(index, { name: e.currentTarget.value })}
              disabled={readOnly}
              w={160}
            />
            <Select
              label={index === 0 ? t("Type") : undefined}
              data={[
                { value: "text", label: t("Text") },
                { value: "select", label: t("Select") },
              ]}
              value={def.type}
              onChange={(v) =>
                updateDef(index, { type: (v as "text" | "select") ?? "text" })
              }
              disabled={readOnly}
              w={110}
              allowDeselect={false}
            />
            {def.type === "select" ? (
              <TagsInput
                label={index === 0 ? t("Options") : undefined}
                value={def.options ?? []}
                onChange={(options) => updateDef(index, { options })}
                disabled={readOnly}
                style={{ flex: 1 }}
                comboboxProps={{ withinPortal: false }}
              />
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {!readOnly && (
              <ActionIcon
                variant="subtle"
                color="gray"
                mb={4}
                onClick={() =>
                  setSchema((prev) => prev.filter((_, i) => i !== index))
                }
                aria-label={t("Remove")}
              >
                <IconTrash size={16} />
              </ActionIcon>
            )}
          </Group>
        ))}
        {!readOnly && (
          <Group>
            <Button
              variant="default"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                setSchema((prev) => [...prev, { name: "", type: "text" }])
              }
            >
              {t("Add property")}
            </Button>
          </Group>
        )}
      </Stack>

      {!readOnly && (
        <Group justify="flex-end">
          <Button
            onClick={save}
            loading={mutation.isPending}
            disabled={!prefixValid}
          >
            {t("Save")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
