import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  ColorSwatch,
  Group,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconEdit,
  IconPlayerPlay,
  IconPlus,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import {
  useRequirementTypeMutation,
  useRequirementTypesQuery,
} from "../queries/requirement-query";
import * as service from "../services/requirement-service";
import {
  IRequirementType,
  IRequirementTypeProperty,
} from "../types/requirement.types";

export const TYPE_COLORS = [
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "gray",
];

export function keyPattern(type: Pick<IRequirementType, "keyPrefix" | "keyPadding">) {
  return `${type.keyPrefix}${"#".repeat(type.keyPadding)}`;
}

export function nextTypeKey(
  type: Pick<IRequirementType, "keyPrefix" | "keyPadding" | "nextSeq">,
) {
  return `${type.keyPrefix}${String(type.nextSeq).padStart(type.keyPadding, "0")}`;
}

export function TypeLozenge({ type }: { type: Pick<IRequirementType, "name" | "color"> }) {
  return (
    <Badge color={type.color} variant="light" radius="sm" tt="uppercase" size="sm">
      {type.name}
    </Badge>
  );
}

/** The type's properties laid out as the table heading they produce. */
function PropertiesPreview({ properties }: { properties: IRequirementTypeProperty[] }) {
  const { t } = useTranslation();
  if (!properties.length) {
    return (
      <Text size="xs" c="dimmed">
        {t("No properties")}
      </Text>
    );
  }
  return (
    <Table withTableBorder withColumnBorders verticalSpacing={2} horizontalSpacing={6} fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t("Key")}</Table.Th>
          {properties.map((p) => (
            <Table.Th key={p.name}>
              <Tooltip
                label={
                  (p.required ? t("Required") : t("Optional")) +
                  (p.options?.length ? ` · ${p.options.join(", ")}` : "")
                }
              >
                <Text span fz="xs" fw={600} c={p.required ? "red.7" : "yellow.8"}>
                  {p.name}
                  {p.required && " *"}
                </Text>
              </Tooltip>
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
    </Table>
  );
}

type FormValue = {
  name: string;
  keyPrefix: string;
  keyPadding: number;
  nextSeq: number;
  color: string;
  properties: IRequirementTypeProperty[];
};

function TypeForm({
  initial,
  isNew,
  onSubmit,
  onCancel,
  loading,
}: {
  initial: FormValue;
  isNew: boolean;
  onSubmit: (value: FormValue) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<FormValue>(initial);
  const set = (patch: Partial<FormValue>) => setValue((v) => ({ ...v, ...patch }));
  const setProp = (i: number, patch: Partial<IRequirementTypeProperty>) =>
    set({
      properties: value.properties.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    });

  const prefixError =
    value.keyPrefix && (/[\s/\\]/.test(value.keyPrefix) || /\d$/.test(value.keyPrefix))
      ? t("Use a prefix without blanks or slashes that does not end with a digit")
      : null;
  const valid = value.name.trim() && value.keyPrefix.trim() && !prefixError;

  return (
    <Stack gap="sm">
      <Group grow align="flex-start">
        <TextInput
          label={t("Name")}
          placeholder={t("e.g. Functional requirement")}
          value={value.name}
          onChange={(e) => set({ name: e.currentTarget.value })}
          required
          data-autofocus
        />
        <TextInput
          label={t("Key prefix")}
          description={t("The key is the prefix followed by a number")}
          placeholder="FN-"
          ff="monospace"
          value={value.keyPrefix}
          onChange={(e) => set({ keyPrefix: e.currentTarget.value.toUpperCase() })}
          error={prefixError}
          required
        />
      </Group>
      <Group grow align="flex-start">
        <NumberInput
          label={t("Number of digits")}
          min={1}
          max={8}
          value={value.keyPadding}
          onChange={(v) => set({ keyPadding: Number(v) || 1 })}
        />
        <NumberInput
          label={t("Next number")}
          min={1}
          value={value.nextSeq}
          onChange={(v) => set({ nextSeq: Number(v) || 1 })}
        />
      </Group>
      <div>
        <Text size="sm" fw={500} mb={4}>
          {t("Colour")}
        </Text>
        <Group gap={6}>
          {TYPE_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              component="button"
              type="button"
              color={`var(--mantine-color-${c}-6)`}
              size={22}
              aria-label={c}
              onClick={() => set({ color: c })}
              style={{
                cursor: "pointer",
                outline: value.color === c ? "2px solid var(--mantine-color-text)" : undefined,
                outlineOffset: 2,
              }}
            />
          ))}
        </Group>
      </div>

      <div>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>
            {t("Properties")}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconPlus size={12} />}
            onClick={() =>
              set({ properties: [...value.properties, { name: "", required: true }] })
            }
          >
            {t("Add property")}
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mb="xs">
          {t(
            "Missing required properties are errors, missing optional ones warnings. Allowed values are optional.",
          )}
        </Text>
        <Stack gap={6}>
          {value.properties.map((p, i) => (
            <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
              <TextInput
                size="xs"
                placeholder={t("Property name")}
                value={p.name}
                onChange={(e) => setProp(i, { name: e.currentTarget.value })}
                w={150}
              />
              <Checkbox
                size="xs"
                mt={6}
                label={t("Required")}
                checked={p.required}
                onChange={(e) => setProp(i, { required: e.currentTarget.checked })}
              />
              <TagsInput
                size="xs"
                placeholder={t("Allowed values")}
                value={p.options ?? []}
                onChange={(options) => setProp(i, { options })}
                style={{ flex: 1 }}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                mt={2}
                aria-label={t("Remove")}
                onClick={() =>
                  set({ properties: value.properties.filter((_, j) => j !== i) })
                }
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </div>

      <div>
        <Text size="xs" c="dimmed" mb={4}>
          {t("Preview")} — <Text span ff="monospace" fz="xs">{nextTypeKey(value)}</Text>
        </Text>
        <PropertiesPreview properties={value.properties.filter((p) => p.name.trim())} />
      </div>

      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button
          disabled={!valid}
          loading={loading}
          onClick={() =>
            onSubmit({
              ...value,
              name: value.name.trim(),
              keyPrefix: value.keyPrefix.trim(),
              properties: value.properties.filter((p) => p.name.trim()),
            })
          }
        >
          {isNew ? t("Create") : t("Save")}
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Requirement types: key patterns with their own numbering, the properties
 * their requirements must have, and key locking. Viewers see them read-only;
 * editors can run validations and reset sequences; administrators edit.
 */
export default function RequirementTypesPanel({
  spaceId,
  canManage,
  canEdit,
}: {
  spaceId: string;
  canManage: boolean;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useRequirementTypesQuery(spaceId);
  const [editing, setEditing] = useState<{ type?: IRequirementType; initial: FormValue } | null>(
    null,
  );

  const create = useRequirementTypeMutation(spaceId, service.createRequirementType, () =>
    t("Requirement type created"),
  );
  const update = useRequirementTypeMutation(spaceId, service.updateRequirementType, () =>
    t("Requirement type saved"),
  );
  const remove = useRequirementTypeMutation(spaceId, service.deleteRequirementType, () =>
    t("Requirement type deleted"),
  );
  const reset = useRequirementTypeMutation(spaceId, service.resetRequirementTypeSequence, (r) =>
    t("Next key is now {{key}}", { key: nextTypeKey(r) }),
  );
  const validate = useRequirementTypeMutation(spaceId, service.validateRequirementType, (r) =>
    t("Checked {{checked}} requirements: {{error}} errors, {{warning}} warnings", r),
  );
  const lock = useRequirementTypeMutation(
    spaceId,
    (lockKeys: boolean) => service.setRequirementLockKeys(spaceId, lockKeys),
  );

  const blank: FormValue = {
    name: "",
    keyPrefix: "",
    keyPadding: 3,
    nextSeq: 1,
    color: "blue",
    properties: [],
  };

  const submit = async (value: FormValue) => {
    if (editing?.type) {
      await update.mutateAsync({ typeId: editing.type.id, ...value });
    } else {
      await create.mutateAsync({ spaceId, ...value });
    }
    setEditing(null);
  };

  const confirmDelete = (type: IRequirementType) =>
    modals.openConfirmModal({
      title: t("Delete requirement type"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Delete {{name}}? Its requirements stay; they are just no longer checked against it.",
            { name: type.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => remove.mutate(type.id),
    });

  return (
    <Stack gap="md" mt="xl">
      <div>
        <Group justify="space-between">
          <Title order={5}>{t("Requirement types")}</Title>
          {canManage && (
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setEditing({ initial: blank })}
            >
              {t("Add type")}
            </Button>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          {t(
            "A type gives a key prefix its own numbering and lists the properties its requirements must have. Inserting a key of a type into an empty table adds the type's columns.",
          )}
        </Text>
      </div>

      {!canManage && (
        <Alert variant="light" color="gray">
          {t("Only space administrators can change requirement types.")}
        </Alert>
      )}

      <Switch
        label={t("Lock keys")}
        description={t(
          "Only keys matching a requirement type, or the space's key prefix, can be inserted. Other keys are reported as errors.",
        )}
        checked={!!data?.lockKeys}
        disabled={!canManage || lock.isPending}
        onChange={(e) => lock.mutate(e.currentTarget.checked)}
      />

      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Type")}</Table.Th>
            <Table.Th>{t("Key pattern")}</Table.Th>
            <Table.Th>{t("Next key")}</Table.Th>
            <Table.Th>{t("Properties")}</Table.Th>
            <Table.Th w={130} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data?.types ?? []).map((type) => (
            <Table.Tr key={type.id}>
              <Table.Td>
                <TypeLozenge type={type} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {keyPattern(type)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {nextTypeKey(type)}
                </Text>
              </Table.Td>
              <Table.Td>
                <PropertiesPreview properties={type.properties} />
              </Table.Td>
              <Table.Td>
                <Group gap={2} justify="flex-end" wrap="nowrap">
                  {canEdit && (
                    <Tooltip label={t("Run validation for this type")}>
                      <ActionIcon
                        variant="subtle"
                        aria-label={t("Run validation for this type")}
                        loading={validate.isPending && validate.variables === type.id}
                        onClick={() => validate.mutate(type.id)}
                      >
                        <IconPlayerPlay size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {canEdit && (
                    <Tooltip label={t("Reset the sequence to the highest existing key")}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={t("Reset sequence")}
                        onClick={() => reset.mutate(type.id)}
                      >
                        <IconRestore size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {canManage && (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t("Edit")}
                      onClick={() =>
                        setEditing({
                          type,
                          initial: {
                            name: type.name,
                            keyPrefix: type.keyPrefix,
                            keyPadding: type.keyPadding,
                            nextSeq: type.nextSeq,
                            color: type.color,
                            properties: type.properties,
                          },
                        })
                      }
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                  )}
                  {canManage && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t("Delete")}
                      onClick={() => confirmDelete(type)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {!data?.types.length && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed" ta="center">
                  {t("No requirement types yet.")}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {!!data?.suggestions.length && (
        <div>
          <Text size="sm" fw={600}>
            {t("Key suggestions")}
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            {t("Prefixes already used in this space. Name one to make it a type.")}
          </Text>
          <Group gap="xs">
            {data.suggestions.map((s) => (
              <Badge
                key={s.keyPrefix}
                variant="outline"
                color="gray"
                radius="sm"
                tt="none"
                size="lg"
                rightSection={
                  canManage ? (
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      aria-label={t("Make a type")}
                      onClick={() =>
                        setEditing({
                          initial: {
                            ...blank,
                            keyPrefix: s.keyPrefix,
                            nextSeq: s.maxNumber + 1,
                          },
                        })
                      }
                    >
                      <IconPlus size={12} />
                    </ActionIcon>
                  ) : undefined
                }
              >
                <Text span ff="monospace" fz="sm">
                  {s.keyPrefix}
                </Text>{" "}
                <Text span fz="xs" c="dimmed">
                  ×{s.count}
                </Text>
              </Badge>
            ))}
          </Group>
        </div>
      )}

      {editing && (
        <Modal
          opened
          size="lg"
          onClose={() => setEditing(null)}
          title={editing.type ? t("Edit requirement type") : t("New requirement type")}
        >
          <TypeForm
            initial={editing.initial}
            isNew={!editing.type}
            loading={create.isPending || update.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={submit}
          />
        </Modal>
      )}
    </Stack>
  );
}
