import { useEffect, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Popover,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconFilter, IconListDetails } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { RequirementReportFilter } from "@docmost/editor-ext";
import classes from "./requirement.module.css";
import {
  useRequirementSettingsQuery,
  useRequirementsQuery,
} from "@/features/requirement/queries/requirement-query";
import RequirementDetailDrawer from "@/features/requirement/components/requirement-detail-drawer";
import {
  propertiesToText,
  textToProperties,
} from "@/features/requirement/utils/requirement-filter";

export default function RequirementReportView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const { t } = useTranslation();
  const { spaceId, filter, columns, limit } = node.attrs as {
    spaceId: string | null;
    filter: RequirementReportFilter;
    columns: string[];
    limit: number;
  };

  const [filterOpened, setFilterOpened] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const isEditable = editor.isEditable;

  useEffect(() => {
    const storage = editor.storage?.requirementReport;
    if (storage?.autoOpen) {
      storage.autoOpen = false;
      setFilterOpened(true);
    }
  }, []);

  const { data, isError, isLoading } = useRequirementsQuery({
    spaceId: spaceId ?? undefined,
    filter,
    limit: limit || 50,
  });
  const { data: settings } = useRequirementSettingsQuery(
    spaceId ?? undefined,
  );

  const propertyOptions = Array.from(
    new Set([
      ...(settings?.propertySchema ?? []).map((d) => d.name),
      ...(data?.items ?? []).flatMap((r) => Object.keys(r.properties ?? {})),
    ]),
  );

  const summary = describeFilter(filter, t);

  return (
    <NodeViewWrapper
      className={classes.report}
      data-drag-handle
      style={{
        outline: selected ? "2px solid var(--mantine-color-blue-5)" : undefined,
      }}
    >
      <Group justify="space-between" mb="xs" contentEditable={false}>
        <Group gap="xs">
          <IconListDetails size={18} />
          <Text fw={600} size="sm">
            {t("Requirements report")}
          </Text>
          {summary && (
            <Text size="xs" c="dimmed">
              {summary}
            </Text>
          )}
        </Group>
        <Group gap="xs">
          {data && (
            <Text size="xs" c="dimmed">
              {t("{{shown}} of {{total}}", {
                shown: data.items.length,
                total: data.total,
              })}
            </Text>
          )}
          {isEditable && (
            <ReportFilterPopover
              opened={filterOpened}
              setOpened={setFilterOpened}
              filter={filter ?? {}}
              columns={columns ?? []}
              limit={limit || 50}
              propertyOptions={propertyOptions}
              onSave={(next) => updateAttributes(next)}
            />
          )}
        </Group>
      </Group>

      <div contentEditable={false}>
        {!spaceId || isError ? (
          <Text size="sm" c="dimmed">
            {t("This report is not available.")}
          </Text>
        ) : isLoading ? (
          <Text size="sm" c="dimmed">
            {t("Loading...")}
          </Text>
        ) : data?.items.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("No requirements match this report.")}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={500}>
            <Table striped withTableBorder verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={110}>{t("Key")}</Table.Th>
                  <Table.Th>{t("Title")}</Table.Th>
                  {(columns ?? []).map((c) => (
                    <Table.Th key={c}>{c}</Table.Th>
                  ))}
                  <Table.Th w={90}>{t("References")}</Table.Th>
                  <Table.Th>{t("Page")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.items.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Badge
                        variant="light"
                        radius="sm"
                        ff="monospace"
                        color={r.isConflict ? "red" : "blue"}
                        style={{ cursor: "pointer" }}
                        onClick={() => setDetailKey(r.key)}
                      >
                        {r.key}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{r.title}</Text>
                    </Table.Td>
                    {(columns ?? []).map((c) => (
                      <Table.Td key={c}>
                        <Text size="sm">{r.properties?.[c] ?? ""}</Text>
                      </Table.Td>
                    ))}
                    <Table.Td>
                      <Text size="sm" c={r.referenceCount ? undefined : "red"}>
                        {r.referenceCount}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" truncate>
                        {r.pageTitle || t("Untitled")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>

      {detailKey && (
        <RequirementDetailDrawer
          opened={!!detailKey}
          onClose={() => setDetailKey(null)}
          spaceId={spaceId ?? undefined}
          requirementKey={detailKey}
        />
      )}
    </NodeViewWrapper>
  );
}

function describeFilter(
  filter: RequirementReportFilter | undefined,
  t: (key: string, opts?: any) => string,
): string {
  if (!filter) return "";
  const parts: string[] = [];
  if (filter.text) parts.push(`"${filter.text}"`);
  if (filter.keyPrefix) parts.push(`${filter.keyPrefix}*`);
  for (const [k, v] of Object.entries(filter.properties ?? {})) {
    parts.push(`${k}=${v}`);
  }
  if (filter.coverage === "covered") parts.push(t("covered"));
  if (filter.coverage === "uncovered") parts.push(t("not covered"));
  return parts.join(" · ");
}

function ReportFilterPopover({
  opened,
  setOpened,
  filter,
  columns,
  limit,
  propertyOptions,
  onSave,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
  filter: RequirementReportFilter;
  columns: string[];
  limit: number;
  propertyOptions: string[];
  onSave: (attrs: {
    filter: RequirementReportFilter;
    columns: string[];
    limit: number;
  }) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [keyPrefix, setKeyPrefix] = useState("");
  const [propertiesText, setPropertiesText] = useState("");
  const [coverage, setCoverage] = useState<string>("any");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [maxRows, setMaxRows] = useState<number>(50);

  useEffect(() => {
    if (!opened) return;
    setText(filter.text ?? "");
    setKeyPrefix(filter.keyPrefix ?? "");
    setPropertiesText(propertiesToText(filter.properties));
    setCoverage(filter.coverage ?? "any");
    setSelectedColumns(columns);
    setMaxRows(limit);
  }, [opened]);

  const save = () => {
    const properties = textToProperties(propertiesText);
    onSave({
      filter: {
        text: text.trim() || undefined,
        keyPrefix: keyPrefix.trim().toUpperCase() || undefined,
        properties: Object.keys(properties).length ? properties : undefined,
        coverage: coverage as RequirementReportFilter["coverage"],
      },
      columns: selectedColumns,
      limit: maxRows,
    });
    setOpened(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={340}
      position="bottom-end"
      withArrow
      shadow="md"
      trapFocus
    >
      <Popover.Target>
        <Tooltip label={t("Configure report")} withinPortal>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => setOpened(!opened)}
            aria-label={t("Configure report")}
          >
            <IconFilter size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            label={t("Text")}
            size="xs"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
          />
          <TextInput
            label={t("Key prefix")}
            size="xs"
            placeholder="SYS-1"
            value={keyPrefix}
            onChange={(e) => setKeyPrefix(e.currentTarget.value)}
          />
          <TextInput
            label={t("Properties")}
            description={t("Comma-separated name=value pairs")}
            size="xs"
            placeholder="Priority=High, Status=Approved"
            value={propertiesText}
            onChange={(e) => setPropertiesText(e.currentTarget.value)}
          />
          <div>
            <Text size="xs" fw={500} mb={4}>
              {t("Coverage")}
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              value={coverage}
              onChange={(v) => setCoverage(String(v))}
              data={[
                { value: "any", label: t("All") },
                { value: "covered", label: t("Covered") },
                { value: "uncovered", label: t("Not covered") },
              ]}
            />
          </div>
          <MultiSelect
            label={t("Property columns")}
            size="xs"
            data={propertyOptions}
            value={selectedColumns}
            onChange={setSelectedColumns}
            searchable
            comboboxProps={{ withinPortal: false }}
          />
          <NumberInput
            label={t("Maximum rows")}
            size="xs"
            min={1}
            max={500}
            value={maxRows}
            onChange={(v) => setMaxRows(Math.min(500, Math.max(1, Number(v) || 50)))}
          />
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setOpened(false)}>
              {t("Cancel")}
            </Button>
            <Button size="xs" onClick={save}>
              {t("Apply")}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
