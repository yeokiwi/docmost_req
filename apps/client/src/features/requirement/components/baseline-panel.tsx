import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconDots,
  IconDownload,
  IconGitCompare,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types";
import { formattedDate } from "@/lib/time";
import NoTableResults from "@/components/common/no-table-results";
import {
  useBaselinesQuery,
  useCompareBaselinesQuery,
  useCreateBaselineMutation,
  useDeleteBaselineMutation,
} from "../queries/requirement-query";
import { exportRequirements } from "../services/requirement-service";
import { IBaselineComparison } from "../types/requirement.types";

const CURRENT = "current";

export default function BaselinePanel({
  space,
  canEdit,
  canManage,
}: {
  space: ISpace;
  canEdit: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const { data: baselines } = useBaselinesQuery(space.id);
  const deleteMutation = useDeleteBaselineMutation(space.id);
  const [createOpened, setCreateOpened] = useState(false);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string>(CURRENT);

  const options = (baselines ?? []).map((b) => ({
    value: b.id,
    label: `v${b.version} · ${b.name}`,
  }));

  const handleExport = async (baselineId: string) => {
    try {
      await exportRequirements({
        spaceId: space.id,
        format: "xlsx",
        baselineId,
      });
    } catch {
      notifications.show({ message: t("Export failed"), color: "red" });
    }
  };

  const confirmDelete = (baselineId: string, name: string) =>
    modals.openConfirmModal({
      title: t("Delete baseline"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to delete baseline {{name}}?", { name })}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        if (fromId === baselineId) setFromId(null);
        if (toId === baselineId) setToId(CURRENT);
        deleteMutation.mutate(baselineId);
      },
    });

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t(
              "A baseline is a frozen snapshot of every requirement in this space.",
            )}
          </Text>
          {canEdit && (
            <Button
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateOpened(true)}
            >
              {t("Create baseline")}
            </Button>
          )}
        </Group>

        <Table highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={80}>{t("Version")}</Table.Th>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th w={110}>{t("Requirements")}</Table.Th>
              <Table.Th>{t("Created by")}</Table.Th>
              <Table.Th>{t("Created at")}</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {baselines?.length ? (
              baselines.map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td>
                    <Badge variant="light" radius="sm">
                      v{b.version}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {b.name}
                    </Text>
                    {b.description && (
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {b.description}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{b.itemCount ?? ""}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{b.creator?.name ?? ""}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {formattedDate(new Date(b.createdAt))}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconGitCompare size={16} />}
                          onClick={() => {
                            setFromId(b.id);
                            setToId(CURRENT);
                          }}
                        >
                          {t("Compare with current")}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconDownload size={16} />}
                          onClick={() => handleExport(b.id)}
                        >
                          {t("Export to Excel")}
                        </Menu.Item>
                        {canManage && (
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={() => confirmDelete(b.id, b.name)}
                          >
                            {t("Delete")}
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={6} text={t("No baselines yet")} />
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      {options.length > 0 && (
        <Stack gap="sm">
          <Title order={5}>{t("Compare")}</Title>
          <Group align="flex-end">
            <Select
              label={t("From")}
              data={options}
              value={fromId}
              onChange={(v) => setFromId(v == null ? null : String(v))}
              placeholder={t("Select baseline")}
              w={260}
            />
            <Select
              label={t("To")}
              data={[
                { value: CURRENT, label: t("Current requirements") },
                ...options.filter((o) => o.value !== fromId),
              ]}
              value={toId}
              onChange={(v) => setToId(v ?? CURRENT)}
              w={260}
            />
          </Group>
          {fromId && (
            <BaselineComparison
              fromBaselineId={fromId}
              toBaselineId={toId === CURRENT ? undefined : toId}
            />
          )}
        </Stack>
      )}

      {createOpened && (
        <CreateBaselineModal
          spaceId={space.id}
          onClose={() => setCreateOpened(false)}
        />
      )}
    </Stack>
  );
}

function CreateBaselineModal({
  spaceId,
  onClose,
}: {
  spaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const mutation = useCreateBaselineMutation();

  const submit = async () => {
    if (!name.trim()) return;
    await mutation.mutateAsync({
      spaceId,
      name: name.trim(),
      description: description.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal opened onClose={onClose} title={t("Create baseline")}>
      <Stack gap="sm">
        <TextInput
          label={t("Name")}
          placeholder={t("e.g. Release 1.0")}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
          required
        />
        <Textarea
          label={t("Description")}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={submit}
            loading={mutation.isPending}
            disabled={!name.trim()}
          >
            {t("Create")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function fieldLabel(field: string, t: (k: string) => string) {
  if (field.startsWith("property:")) return field.slice("property:".length);
  switch (field) {
    case "title":
      return t("Title");
    case "description":
      return t("Description");
    case "page":
      return t("Page");
    case "dependsOn":
      return t("Depends on");
    default:
      return field;
  }
}

function BaselineComparison({
  fromBaselineId,
  toBaselineId,
}: {
  fromBaselineId: string;
  toBaselineId?: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useCompareBaselinesQuery({
    fromBaselineId,
    toBaselineId,
  });

  if (isLoading || !data) {
    return (
      <Text size="sm" c="dimmed">
        {t("Loading...")}
      </Text>
    );
  }

  const { diff } = data as IBaselineComparison;

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge color="green" variant="light">
          {t("{{count}} added", { count: diff.added.length })}
        </Badge>
        <Badge color="red" variant="light">
          {t("{{count}} removed", { count: diff.removed.length })}
        </Badge>
        <Badge color="yellow" variant="light">
          {t("{{count}} modified", { count: diff.modified.length })}
        </Badge>
        <Badge color="gray" variant="light">
          {t("{{count}} unchanged", { count: diff.unchangedCount })}
        </Badge>
      </Group>

      <Table withTableBorder verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={100}>{t("Change")}</Table.Th>
            <Table.Th w={120}>{t("Key")}</Table.Th>
            <Table.Th>{t("Details")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {diff.added.map((i) => (
            <Table.Tr key={`a-${i.key}`}>
              <Table.Td>
                <Badge color="green" variant="light" size="sm">
                  {t("Added")}
                </Badge>
              </Table.Td>
              <Table.Td ff="monospace">{i.key}</Table.Td>
              <Table.Td>
                <Text size="sm">{i.title}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
          {diff.removed.map((i) => (
            <Table.Tr key={`r-${i.key}`}>
              <Table.Td>
                <Badge color="red" variant="light" size="sm">
                  {t("Removed")}
                </Badge>
              </Table.Td>
              <Table.Td ff="monospace">{i.key}</Table.Td>
              <Table.Td>
                <Text size="sm" td="line-through">
                  {i.title}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
          {diff.modified.map((m) => (
            <Table.Tr key={`m-${m.key}`}>
              <Table.Td>
                <Badge color="yellow" variant="light" size="sm">
                  {t("Modified")}
                </Badge>
              </Table.Td>
              <Table.Td ff="monospace">{m.key}</Table.Td>
              <Table.Td>
                <Stack gap={2}>
                  {m.changes.map((c) => (
                    <Text size="sm" key={c.field}>
                      <Text span fw={600} size="sm">
                        {fieldLabel(c.field, t)}:
                      </Text>{" "}
                      <Text span c="red" td="line-through" size="sm">
                        {c.before ?? "—"}
                      </Text>{" "}
                      →{" "}
                      <Text span c="green" size="sm">
                        {c.after ?? "—"}
                      </Text>
                    </Text>
                  ))}
                </Stack>
              </Table.Td>
            </Table.Tr>
          ))}
          {diff.added.length + diff.removed.length + diff.modified.length ===
            0 && <NoTableResults colSpan={3} text={t("No differences")} />}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
