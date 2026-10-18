import { useMemo, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Popover,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronRight,
  IconColumns,
  IconDownload,
} from "@tabler/icons-react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { buildPageUrl } from "@/features/page/page.utils";
import { ISpace } from "@/features/space/types/space.types";
import {
  useRequirementSettingsQuery,
  useRequirementsQuery,
  useTraceabilityQuery,
} from "../queries/requirement-query";
import { exportRequirements } from "../services/requirement-service";
import RequirementKey from "./requirement-key";
import RequirementPropertyBadge from "./requirement-property-badge";
import RequirementDetailDrawer from "./requirement-detail-drawer";

const MAX_DEPTH = 5;

/**
 * Hierarchical traceability view (UI-TRM): start from a key prefix and drill
 * down through the requirements that depend on each requirement.
 */
export default function TraceTree({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [start, setStart] = useState(searchParams.get("start") ?? "");
  const [dStart] = useDebouncedValue(start, 300);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlightEmpty, setHighlightEmpty] = useState(true);
  const [hiddenProps, setHiddenProps] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: settings } = useRequirementSettingsQuery(space.id);
  const { data: matrix, isLoading } = useTraceabilityQuery({
    spaceId: space.id,
  });
  const { data: list } = useRequirementsQuery({
    spaceId: space.id,
    limit: 500,
    offset: 0,
  });

  const propNames = (settings?.propertySchema ?? [])
    .map((d) => d.name)
    .filter((n) => !hiddenProps.includes(n));

  const model = useMemo(() => {
    const info = new Map((list?.items ?? []).map((r) => [r.key, r]));
    const children = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const [row, col] of matrix?.cells ?? []) {
      // row depends on col: row is downstream of col
      children.set(col, [...(children.get(col) ?? []), row]);
      hasParent.add(row);
    }
    // relationship name per [child, parent] edge
    const relations = new Map<string, string>();
    for (const [row, col, relation] of matrix?.cellRelations ?? []) {
      relations.set(`${row}|${col}`, relation);
    }
    const pageRefs = new Map<string, NonNullable<typeof matrix>["pageRefs"]>();
    for (const ref of matrix?.pageRefs ?? []) {
      pageRefs.set(ref.key, [...(pageRefs.get(ref.key) ?? []), ref]);
    }
    const prefix = dStart.trim().toLowerCase();
    const unique = (list?.items ?? []).filter((r) =>
      prefix ? r.key.toLowerCase().startsWith(prefix) : !hasParent.has(r.key),
    );
    return { info, children, relations, pageRefs, roots: unique };
  }, [matrix, list, dStart]);

  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => {
    const all = new Set<string>();
    const walk = (key: string, path: string, depth: number) => {
      const kids = model.children.get(key) ?? [];
      if (!kids.length || depth >= MAX_DEPTH) return;
      all.add(path);
      for (const k of kids) {
        if (!path.split("/").includes(k)) walk(k, `${path}/${k}`, depth + 1);
      }
    };
    for (const r of model.roots) walk(r.key, r.key, 1);
    setExpanded(all);
  };

  const handleExport = async () => {
    try {
      await exportRequirements({
        spaceId: space.id,
        format: "xlsx",
        filter: { keys: model.roots.map((r) => r.key) },
      });
    } catch {
      notifications.show({ message: t("Export failed"), color: "red" });
    }
  };

  const renderRows = (
    key: string,
    path: string,
    depth: number,
    parentKey?: string,
  ): React.ReactNode[] => {
    const relation = parentKey
      ? model.relations.get(`${key}|${parentKey}`)
      : undefined;
    const info = model.info.get(key);
    const kids = model.children.get(key) ?? [];
    const open = expanded.has(path);
    const gap = highlightEmpty && kids.length === 0;
    const rows: React.ReactNode[] = [
      <Table.Tr key={path}>
        <Table.Td>
          <Group gap={4} wrap="nowrap" pl={(depth - 1) * 24}>
            {kids.length > 0 && depth < MAX_DEPTH ? (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={open ? t("Collapse") : t("Expand")}
                aria-expanded={open}
                onClick={() => toggle(path)}
              >
                {open ? (
                  <IconChevronDown size={14} />
                ) : (
                  <IconChevronRight size={14} />
                )}
              </ActionIcon>
            ) : (
              <span style={{ width: 22, display: "inline-block" }} />
            )}
            {relation && (
              <Text size="xs" c="dimmed" fs="italic">
                {relation}
              </Text>
            )}
            <RequirementKey value={key} onClick={() => setSelected(key)} />
            <Text size="sm" truncate maw={320}>
              {info?.title}
            </Text>
          </Group>
        </Table.Td>
        {propNames.map((p) => (
          <Table.Td key={p}>
            <RequirementPropertyBadge value={info?.properties?.[p]} />
          </Table.Td>
        ))}
        <Table.Td
          bg={gap ? "var(--mantine-color-red-light)" : undefined}
          title={gap ? t("Not covered") : undefined}
        >
          {kids.length ? (
            <Group gap={4}>
              {kids.slice(0, 4).map((k) => (
                <RequirementKey
                  key={k}
                  value={k}
                  size="sm"
                  onClick={() => setSelected(k)}
                />
              ))}
              {kids.length > 4 && (
                <Text size="xs" c="dimmed">
                  +{kids.length - 4}
                </Text>
              )}
            </Group>
          ) : (
            <Text size="sm" c={gap ? "red.7" : "dimmed"}>
              — {t("none")} —
            </Text>
          )}
        </Table.Td>
        <Table.Td>
          {(model.pageRefs.get(key) ?? []).length ? (
            <Group gap={4}>
              {(model.pageRefs.get(key) ?? []).slice(0, 3).map((r) => (
                <Anchor
                  key={r.pageId}
                  size="sm"
                  component={Link}
                  to={buildPageUrl(space.slug, r.pageSlugId, r.pageTitle)}
                >
                  {r.pageTitle || t("Untitled")}
                </Anchor>
              ))}
              {(model.pageRefs.get(key) ?? []).length > 3 && (
                <Text size="xs" c="dimmed">
                  +{(model.pageRefs.get(key) ?? []).length - 3}
                </Text>
              )}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          )}
        </Table.Td>
      </Table.Tr>,
    ];
    if (open && depth < MAX_DEPTH) {
      for (const k of kids) {
        if (path.split("/").includes(k)) continue; // cycle guard
        rows.push(...renderRows(k, `${path}/${k}`, depth + 1, key));
      }
    }
    return rows;
  };

  return (
    <Stack gap="sm">
      <Group align="flex-end" justify="space-between">
        <Group align="flex-end">
          <TextInput
            label={t("Start from (key prefix)")}
            placeholder="SYS"
            ff="monospace"
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
            w={220}
          />
          <Button variant="default" onClick={expandAll}>
            {t("Expand all")}
          </Button>
          <Button variant="default" onClick={() => setExpanded(new Set())}>
            {t("Collapse all")}
          </Button>
          <Popover position="bottom-start" withinPortal>
            <Popover.Target>
              <Button
                variant="default"
                leftSection={<IconColumns size={16} />}
              >
                {t("Columns")}
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                {(settings?.propertySchema ?? []).map((d) => (
                  <Checkbox
                    key={d.name}
                    size="xs"
                    label={d.name}
                    checked={!hiddenProps.includes(d.name)}
                    onChange={(e) =>
                      setHiddenProps((cur) =>
                        e.currentTarget.checked
                          ? cur.filter((n) => n !== d.name)
                          : [...cur, d.name],
                      )
                    }
                  />
                ))}
                <Switch
                  size="xs"
                  label={t("Highlight empty cells")}
                  checked={highlightEmpty}
                  onChange={(e) => setHighlightEmpty(e.currentTarget.checked)}
                />
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </Group>
        <Button
          variant="default"
          leftSection={<IconDownload size={16} />}
          onClick={handleExport}
        >
          {t("Export")}
        </Button>
      </Group>

      {matrix?.truncated && (
        <Text size="xs" c="dimmed">
          {t("The matrix is limited to 300 rows and columns.")}
        </Text>
      )}

      {isLoading ? (
        <Text size="sm" c="dimmed">
          {t("Loading...")}
        </Text>
      ) : model.roots.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No requirements found")}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={700}>
          <Table withTableBorder withColumnBorders verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Requirement tree")}</Table.Th>
                {propNames.map((p) => (
                  <Table.Th key={p}>{p}</Table.Th>
                ))}
                <Table.Th>
                  <Group gap={6}>
                    {t("Downstream")}
                    <Badge size="xs" variant="light" color="gray">
                      {model.roots.length}
                    </Badge>
                  </Group>
                </Table.Th>
                <Table.Th>{t("Referenced in pages")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {model.roots.flatMap((r) => renderRows(r.key, r.key, 1))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {selected && (
        <RequirementDetailDrawer
          opened
          onClose={() => setSelected(null)}
          spaceId={space.id}
          requirementKey={selected}
        />
      )}
    </Stack>
  );
}
