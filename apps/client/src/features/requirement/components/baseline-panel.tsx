import { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Radio,
  SegmentedControl,
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
  IconAlertTriangle,
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
  useRequirementsQuery,
} from "../queries/requirement-query";
import { exportRequirements } from "../services/requirement-service";
import {
  IBaselineComparison,
  IBaselineSnapshotItem,
  IFieldChange,
} from "../types/requirement.types";
import { wordDiff } from "../utils/word-diff";
import RequirementKey from "./requirement-key";

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
  const [checked, setChecked] = useState<string[]>([]);

  const toggleChecked = (id: string) =>
    setChecked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur.slice(-1), id],
    );
  // UI-BL-008: two ticked baselines (oldest first) enable "Generate diff"
  const generateDiff = () => {
    const picked = (baselines ?? [])
      .filter((b) => checked.includes(b.id))
      .sort((a, b) => a.version - b.version);
    if (picked.length === 2) {
      setFromId(picked[0].id);
      setToId(picked[1].id);
    }
  };

  const options = (baselines ?? []).map((b) => ({
    value: b.id,
    label: `BL-${b.version} · ${b.name}`,
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
          <Group gap="xs">
            <Button
              size="sm"
              variant="default"
              leftSection={<IconGitCompare size={16} />}
              disabled={checked.length !== 2}
              onClick={generateDiff}
            >
              {t("Generate diff")}
            </Button>
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
        </Group>

        <Table highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36} />
              <Table.Th w={80}>#</Table.Th>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th w={110}>{t("Requirements")}</Table.Th>
              <Table.Th w={110}>{t("Status")}</Table.Th>
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
                    <Checkbox
                      size="xs"
                      aria-label={b.name}
                      checked={checked.includes(b.id)}
                      onChange={() => toggleChecked(b.id)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" radius="sm" ff="monospace">
                      BL-{b.version}
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
                    <Badge variant="light" color="green" size="sm" radius="sm">
                      {t("Frozen")}
                    </Badge>
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
              <NoTableResults colSpan={8} text={t("No baselines yet")} />
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
  const { data: all } = useRequirementsQuery({ spaceId, limit: 500, offset: 0 });
  const duplicates = (all?.items ?? []).filter((r) => r.isConflict).length;

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
    <Modal opened onClose={onClose} title={t("Create baseline")} radius="md">
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
        <Radio.Group
          label={t("Which requirements")}
          value="space"
          readOnly
        >
          <Radio
            mt={4}
            value="space"
            label={t("Whole space ({{count}})", { count: all?.total ?? 0 })}
          />
        </Radio.Group>
        <Radio.Group label={t("When to freeze")} value="now" readOnly>
          <Radio mt={4} value="now" label={t("Freeze now")} />
        </Radio.Group>
        {duplicates > 0 && (
          <Alert
            color="yellow"
            variant="light"
            icon={<IconAlertTriangle size={16} />}
          >
            {t(
              "{{count}} requirements have duplicate keys. Baseline them anyway?",
              { count: duplicates },
            )}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={submit}
            loading={mutation.isPending}
            disabled={!name.trim()}
          >
            {t("Create & freeze")}
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

type ChangeKind = "added" | "removed" | "modified";

interface ChangeRow {
  key: string;
  kind: ChangeKind;
  before?: IBaselineSnapshotItem;
  after?: IBaselineSnapshotItem;
  changes: IFieldChange[];
}

const KIND_COLOR: Record<ChangeKind, string> = {
  added: "green",
  removed: "red",
  modified: "yellow",
};

function DiffText({
  before,
  after,
  side,
}: {
  before: string;
  after: string;
  side: "before" | "after" | "inline";
}) {
  const parts = wordDiff(before, after).filter((p) =>
    side === "before"
      ? p.kind !== "added"
      : side === "after"
        ? p.kind !== "removed"
        : true,
  );
  return (
    <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) =>
        p.kind === "same" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <Text
            key={i}
            span
            size="sm"
            td={p.kind === "removed" ? "line-through" : undefined}
            c={p.kind === "removed" ? "red.8" : "green.8"}
            bg={
              p.kind === "removed"
                ? "var(--mantine-color-red-light)"
                : "var(--mantine-color-green-light)"
            }
          >
            {p.text}
          </Text>
        ),
      )}
    </Text>
  );
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
  const [filter, setFilter] = useState<ChangeKind | null>(null);
  const [mode, setMode] = useState("side");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const rows: ChangeRow[] = useMemo(() => {
    if (!data) return [];
    const { diff } = data as IBaselineComparison;
    return [
      ...diff.modified.map((m) => ({
        key: m.key,
        kind: "modified" as const,
        before: m.before,
        after: m.after,
        changes: m.changes,
      })),
      ...diff.added.map((i) => ({
        key: i.key,
        kind: "added" as const,
        after: i,
        changes: [],
      })),
      ...diff.removed.map((i) => ({
        key: i.key,
        kind: "removed" as const,
        before: i,
        changes: [],
      })),
    ].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [data]);

  if (isLoading || !data) {
    return (
      <Text size="sm" c="dimmed">
        {t("Loading...")}
      </Text>
    );
  }

  const { diff, from, to } = data as IBaselineComparison;
  const visible = rows.filter((r) => !filter || r.kind === filter);
  const active = visible.find((r) => r.key === activeKey) ?? visible[0];

  const chip = (kind: ChangeKind, label: string) => (
    <Badge
      key={kind}
      color={KIND_COLOR[kind]}
      variant={filter === kind ? "filled" : "light"}
      size="lg"
      style={{ cursor: "pointer" }}
      onClick={() => setFilter(filter === kind ? null : kind)}
    >
      {label}
    </Badge>
  );

  const beforeText = active?.before?.title ?? "";
  const afterText = active?.after?.title ?? "";
  const beforeDesc = active?.before?.description ?? "";
  const afterDesc = active?.after?.description ?? "";

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Group gap="xs">
          {chip("added", `+ ${t("{{count}} added", { count: diff.added.length })}`)}
          {chip("modified", `~ ${t("{{count}} modified", { count: diff.modified.length })}`)}
          {chip("removed", `− ${t("{{count}} removed", { count: diff.removed.length })}`)}
          <Badge color="gray" variant="light" size="lg">
            = {t("{{count}} unchanged", { count: diff.unchangedCount })}
          </Badge>
        </Group>
      </Group>

      {visible.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No differences")}
        </Text>
      ) : (
        <Group align="flex-start" wrap="nowrap" gap="md">
          <Paper withBorder radius="md" w={320} style={{ flexShrink: 0 }}>
            <Table highlightOnHover verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Key")}</Table.Th>
                  <Table.Th>{t("Change")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((r) => (
                  <Table.Tr
                    key={r.key}
                    style={{ cursor: "pointer" }}
                    bg={
                      r.key === active?.key
                        ? "var(--mantine-color-blue-light)"
                        : undefined
                    }
                    onClick={() => setActiveKey(r.key)}
                  >
                    <Table.Td>
                      <RequirementKey value={r.key} />
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={KIND_COLOR[r.kind]}
                        variant="light"
                        size="sm"
                        radius="sm"
                      >
                        {r.kind === "modified"
                          ? r.changes.some((c) => c.field.startsWith("property:"))
                            ? t("Property")
                            : t("Text")
                          : r.kind === "added"
                            ? t("Added")
                            : t("Removed")}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>

          {active && (
            <Paper withBorder radius="md" p="md" style={{ flex: 1, minWidth: 0 }}>
              <Group justify="space-between" mb="sm">
                <RequirementKey value={active.key} size="lg" />
                <SegmentedControl
                  size="xs"
                  value={mode}
                  onChange={(v) => setMode(String(v))}
                  data={[
                    { value: "side", label: t("Side-by-side") },
                    { value: "inline", label: t("Inline") },
                  ]}
                />
              </Group>

              {mode === "inline" ? (
                <Stack gap="xs">
                  <DiffText before={beforeText} after={afterText} side="inline" />
                  {(beforeDesc || afterDesc) && (
                    <DiffText before={beforeDesc} after={afterDesc} side="inline" />
                  )}
                </Stack>
              ) : (
                <Group align="flex-start" grow>
                  {(["before", "after"] as const).map((side) => (
                    <Stack gap={4} key={side}>
                      <Text size="xs" c="dimmed" fw={600}>
                        {side === "before"
                          ? `BL-${from.version} (${from.name})`
                          : to
                            ? `BL-${to.version} (${to.name})`
                            : t("Current requirements")}
                      </Text>
                      <Paper withBorder p="sm" radius="sm">
                        <DiffText
                          before={beforeText}
                          after={afterText}
                          side={side}
                        />
                        {(beforeDesc || afterDesc) && (
                          <Text mt="xs" component="div">
                            <DiffText
                              before={beforeDesc}
                              after={afterDesc}
                              side={side}
                            />
                          </Text>
                        )}
                      </Paper>
                    </Stack>
                  ))}
                </Group>
              )}

              {active.changes.length > 0 && (
                <Table withTableBorder withColumnBorders mt="md" verticalSpacing={4}>
                  <Table.Tbody>
                    {active.changes
                      .filter((c) => c.field !== "title" && c.field !== "description")
                      .map((c) => (
                        <Table.Tr key={c.field}>
                          <Table.Td w="25%">
                            <Text size="sm" c="dimmed">
                              {fieldLabel(c.field, t)}
                            </Text>
                          </Table.Td>
                          <Table.Td bg="var(--mantine-color-red-light)">
                            <Text size="sm" td="line-through">
                              {c.before ?? "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td bg="var(--mantine-color-green-light)">
                            <Text size="sm">{c.after ?? "—"}</Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>
          )}
        </Group>
      )}
    </Stack>
  );
}
