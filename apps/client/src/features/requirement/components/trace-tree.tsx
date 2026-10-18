import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Menu,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleX,
  IconDownload,
  IconPencil,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { buildPageUrl } from "@/features/page/page.utils";
import { ISpace } from "@/features/space/types/space.types";
import {
  useRequirementSettingsQuery,
  useRequirementTypesQuery,
  useRequirementsQuery,
  useTraceabilityQuery,
} from "../queries/requirement-query";
import { exportRequirements } from "../services/requirement-service";
import { IRequirement } from "../types/requirement.types";
import {
  BuiltinField,
  buildGraph,
  defaultColumns,
  dependencyEdges,
  dependencyLabel,
  newColumnId,
  NewTraceColumn,
  relationsInUse,
  toStartQuery,
  TraceColumn,
} from "../utils/trace-columns";
import RequirementKey, { StatusLozenge } from "./requirement-key";
import RequirementPropertyBadge from "./requirement-property-badge";
import RequirementDetailDrawer from "./requirement-detail-drawer";
import { matchRequirementType } from "./insert-requirement-dialog";
import { TypeLozenge } from "./requirement-types-panel";

const MAX_DEPTH = 5;

function loadColumns(spaceId: string): TraceColumn[] {
  try {
    const raw = localStorage.getItem(`trace-columns:${spaceId}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // storage unavailable or malformed: use the defaults
  }
  return defaultColumns();
}

function saveColumns(spaceId: string, columns: TraceColumn[]) {
  try {
    localStorage.setItem(`trace-columns:${spaceId}`, JSON.stringify(columns));
  } catch {
    // not saved; the layout still works for this visit
  }
}

/**
 * Traceability tree: start from a search, drill down through the
 * requirements each one references, and choose the columns from built-in
 * fields, properties and dependencies by direction and relationship.
 */
export default function TraceTree({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [start, setStart] = useState(searchParams.get("start") ?? "");
  const [dStart] = useDebouncedValue(start, 400);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlightEmpty, setHighlightEmpty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [columns, setColumns] = useState<TraceColumn[]>(() => loadColumns(space.id));
  const [editingTitle, setEditingTitle] = useState<{ id: string; value: string } | null>(
    null,
  );

  useEffect(() => saveColumns(space.id, columns), [space.id, columns]);

  const startQuery = toStartQuery(dStart);
  const { data: settings } = useRequirementSettingsQuery(space.id);
  const { data: typeList } = useRequirementTypesQuery(space.id);
  const { data: matrix, isLoading } = useTraceabilityQuery({ spaceId: space.id });
  const { data: list } = useRequirementsQuery({ spaceId: space.id, limit: 500, offset: 0 });
  const {
    data: started,
    error: startError,
    isFetching: startFetching,
  } = useRequirementsQuery({
    spaceId: space.id,
    filter: { query: startQuery },
    limit: 500,
    offset: 0,
    enabled: !!startQuery,
  });

  const model = useMemo(() => {
    const info = new Map((list?.items ?? []).map((r) => [r.key, r]));
    const graph = buildGraph(matrix?.cells ?? [], matrix?.cellRelations ?? []);
    const pageRefs = new Map<string, NonNullable<typeof matrix>["pageRefs"]>();
    for (const ref of matrix?.pageRefs ?? []) {
      pageRefs.set(ref.key, [...(pageRefs.get(ref.key) ?? []), ref]);
    }
    // without a search, start from requirements nothing references
    const roots: IRequirement[] = startQuery
      ? (started?.items ?? [])
      : (list?.items ?? []).filter((r) => !graph.children.has(r.key));
    return { info, graph, pageRefs, roots };
  }, [matrix, list, started, startQuery]);

  const propertyNames = useMemo(() => {
    const names = new Set((settings?.propertySchema ?? []).map((d) => d.name));
    for (const r of list?.items ?? []) {
      for (const n of Object.keys(r.properties ?? {})) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [settings, list]);
  const relations = useMemo(() => relationsInUse(model.graph), [model.graph]);

  const updateColumn = (id: string, patch: Partial<TraceColumn>) =>
    setColumns((cols) =>
      cols.map((c) => (c.id === id ? ({ ...c, ...patch } as TraceColumn) : c)),
    );
  const addColumnAfter = (afterId: string | null, column: NewTraceColumn) =>
    setColumns((cols) => {
      const next = [...cols];
      const at = afterId ? cols.findIndex((c) => c.id === afterId) + 1 : cols.length;
      next.splice(at, 0, { ...column, id: newColumnId() } as TraceColumn);
      return next;
    });

  const builtinLabel = (field: BuiltinField) =>
    ({
      title: t("Title"),
      page: t("Page"),
      status: t("Status"),
      type: t("Type"),
      referencedIn: t("Referenced in pages"),
    })[field];

  const columnLabel = (c: TraceColumn) =>
    c.title ||
    (c.kind === "builtin"
      ? builtinLabel(c.field)
      : c.kind === "property"
        ? c.name
        : dependencyLabel(c.direction, c.relation, t("all links")));

  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const referencesOf = (key: string) => model.graph.parents.get(key) ?? [];

  const expandAll = () => {
    const all = new Set<string>();
    const walk = (key: string, path: string, depth: number) => {
      const kids = referencesOf(key);
      if (!kids.length || depth >= MAX_DEPTH) return;
      all.add(path);
      for (const k of kids) {
        if (!path.split("/").includes(k.key)) walk(k.key, `${path}/${k.key}`, depth + 1);
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

  /** The cog menu of a column (or of the tree column, to add the first one). */
  const columnMenu = (column: TraceColumn | null) => (
    <Menu position="bottom-start" withinPortal shadow="md" width={240}>
      <Menu.Target>
        <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("Column options")}>
          <IconSettings size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {column && (
          <>
            <Menu.Item
              leftSection={<IconPencil size={14} />}
              onClick={() => setEditingTitle({ id: column.id, value: columnLabel(column) })}
            >
              {t("Edit title")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCircleX size={14} />}
              onClick={() => setColumns((cols) => cols.filter((c) => c.id !== column.id))}
            >
              {t("Delete column")}
            </Menu.Item>
            {column.kind === "dependency" && (
              <>
                <Menu.Divider />
                <Menu.Label>{t("Options")}</Menu.Label>
                <Menu.Item
                  leftSection={column.oneCell ? <IconCheck size={14} /> : <span style={{ width: 14 }} />}
                  onClick={() => updateColumn(column.id, { oneCell: !column.oneCell })}
                >
                  {t("Display dependencies in one cell")}
                </Menu.Item>
              </>
            )}
            <Menu.Divider />
          </>
        )}
        <Menu.Label>{t("New column")}</Menu.Label>
        <Menu.Sub>
          <Menu.Sub.Target>
            <Menu.Sub.Item>{t("Built-in fields")}</Menu.Sub.Item>
          </Menu.Sub.Target>
          <Menu.Sub.Dropdown>
            {(["title", "page", "status", "type", "referencedIn"] as BuiltinField[]).map((f) => (
              <Menu.Item
                key={f}
                onClick={() => addColumnAfter(column?.id ?? null, { kind: "builtin", field: f })}
              >
                {builtinLabel(f)}
              </Menu.Item>
            ))}
          </Menu.Sub.Dropdown>
        </Menu.Sub>
        <Menu.Sub>
          <Menu.Sub.Target>
            <Menu.Sub.Item>{t("Properties")}</Menu.Sub.Item>
          </Menu.Sub.Target>
          <Menu.Sub.Dropdown>
            {propertyNames.length === 0 && <Menu.Label>{t("No properties yet")}</Menu.Label>}
            {propertyNames.map((name) => (
              <Menu.Item
                key={name}
                onClick={() => addColumnAfter(column?.id ?? null, { kind: "property", name })}
              >
                {name}
              </Menu.Item>
            ))}
          </Menu.Sub.Dropdown>
        </Menu.Sub>
        <Menu.Sub>
          <Menu.Sub.Target>
            <Menu.Sub.Item>{t("Dependencies")}</Menu.Sub.Item>
          </Menu.Sub.Target>
          <Menu.Sub.Dropdown>
            {(["parents", "children"] as const).flatMap((direction) =>
              [null, ...relations].map((relation) => (
                <Menu.Item
                  key={`${direction}:${relation ?? ""}`}
                  onClick={() =>
                    addColumnAfter(column?.id ?? null, {
                      kind: "dependency",
                      direction,
                      relation,
                      oneCell: true,
                    })
                  }
                >
                  {dependencyLabel(direction, relation, t("all links"))}
                </Menu.Item>
              )),
            )}
          </Menu.Sub.Dropdown>
        </Menu.Sub>
      </Menu.Dropdown>
    </Menu>
  );

  const renderCell = (column: TraceColumn, key: string) => {
    const info = model.info.get(key);
    if (column.kind === "property") {
      return <RequirementPropertyBadge value={info?.properties?.[column.name]} />;
    }
    if (column.kind === "builtin") {
      switch (column.field) {
        case "title":
          return <Text size="sm">{info?.title}</Text>;
        case "page":
          return info ? (
            <Anchor
              size="sm"
              component={Link}
              to={buildPageUrl(space.slug, info.pageSlugId, info.pageTitle)}
            >
              {info.pageTitle || t("Untitled")}
            </Anchor>
          ) : null;
        case "status":
          return info ? (
            <Group gap={4}>
              <StatusLozenge
                kind={info.isConflict ? "duplicate" : info.referenceCount ? "covered" : "uncovered"}
                label={
                  info.isConflict
                    ? t("Duplicate")
                    : info.referenceCount
                      ? t("Covered")
                      : t("Not covered")
                }
              />
              {(info.validationStatus === "error" || info.validationStatus === "warning") && (
                <Badge
                  size="sm"
                  radius="sm"
                  variant="light"
                  color={info.validationStatus === "error" ? "red" : "yellow"}
                >
                  {info.validationStatus === "error" ? t("Invalid") : t("Warning")}
                </Badge>
              )}
            </Group>
          ) : null;
        case "type": {
          const type = matchRequirementType(key, typeList?.types ?? []);
          return type ? <TypeLozenge type={type} /> : null;
        }
        case "referencedIn": {
          const refs = model.pageRefs.get(key) ?? [];
          return refs.length ? (
            <Group gap={4}>
              {refs.slice(0, 3).map((r) => (
                <Anchor
                  key={r.pageId}
                  size="sm"
                  component={Link}
                  to={buildPageUrl(space.slug, r.pageSlugId, r.pageTitle)}
                >
                  {r.pageTitle || t("Untitled")}
                </Anchor>
              ))}
              {refs.length > 3 && (
                <Text size="xs" c="dimmed">
                  +{refs.length - 3}
                </Text>
              )}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          );
        }
      }
    }
    const edges = dependencyEdges(model.graph, key, column);
    if (!edges.length) {
      return (
        <Text size="sm" c={highlightEmpty ? "red.7" : "dimmed"}>
          — {t("none")} —
        </Text>
      );
    }
    const chips = edges.map((e) => (
      <Group key={`${e.key}:${e.relation ?? ""}`} gap={4} wrap="nowrap">
        {!column.relation && e.relation && (
          <Text size="xs" c="dimmed" fs="italic">
            {e.relation}
          </Text>
        )}
        <RequirementKey value={e.key} size="sm" onClick={() => setSelected(e.key)} />
      </Group>
    ));
    return column.oneCell ? <Group gap={6}>{chips}</Group> : <Stack gap={4}>{chips}</Stack>;
  };

  const renderRows = (
    key: string,
    path: string,
    depth: number,
    relation?: string | null,
  ): React.ReactNode[] => {
    const info = model.info.get(key);
    const kids = referencesOf(key);
    const open = expanded.has(path);
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
                {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
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
        {columns.map((c) => {
          const empty =
            highlightEmpty &&
            c.kind === "dependency" &&
            dependencyEdges(model.graph, key, c).length === 0;
          return (
            <Table.Td key={c.id} bg={empty ? "var(--mantine-color-red-light)" : undefined}>
              {renderCell(c, key)}
            </Table.Td>
          );
        })}
      </Table.Tr>,
    ];
    if (open && depth < MAX_DEPTH) {
      for (const k of kids) {
        if (path.split("/").includes(k.key)) continue; // cycle guard
        rows.push(...renderRows(k.key, `${path}/${k.key}`, depth + 1, k.relation));
      }
    }
    return rows;
  };

  return (
    <Stack gap="sm">
      <Group align="flex-end" justify="space-between">
        <Group align="flex-end">
          <TextInput
            label={t("Search")}
            description={t("A key prefix, or a search such as key ~ 'BR-%' AND @Priority = 'High'")}
            placeholder="key ~ 'BR-%'"
            ff="monospace"
            leftSection={<IconSearch size={14} />}
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
            error={startQuery ? ((startError as any)?.response?.data?.message ?? undefined) : undefined}
            w={420}
          />
          <Button variant="default" onClick={expandAll}>
            {t("Expand all")}
          </Button>
          <Button variant="default" onClick={() => setExpanded(new Set())}>
            {t("Collapse all")}
          </Button>
          <Switch
            mb={8}
            label={t("Highlight empty cells")}
            checked={highlightEmpty}
            onChange={(e) => setHighlightEmpty(e.currentTarget.checked)}
          />
        </Group>
        <Group gap="xs">
          <Tooltip label={t("Restore the default columns")}>
            <Button variant="subtle" color="gray" onClick={() => setColumns(defaultColumns())}>
              {t("Reset columns")}
            </Button>
          </Tooltip>
          <Button variant="default" leftSection={<IconDownload size={16} />} onClick={handleExport}>
            {t("Export")}
          </Button>
        </Group>
      </Group>

      {matrix?.truncated && (
        <Text size="xs" c="dimmed">
          {t("The matrix is limited to 300 rows and columns.")}
        </Text>
      )}

      {isLoading || (startQuery && startFetching && !started) ? (
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
                <Table.Th>
                  <Group gap={4} justify="space-between" wrap="nowrap">
                    <span>
                      {t("Requirement")}{" "}
                      <Badge size="xs" variant="light" color="gray">
                        {model.roots.length}
                      </Badge>
                    </span>
                    {columnMenu(null)}
                  </Group>
                </Table.Th>
                {columns.map((c) => (
                  <Table.Th key={c.id}>
                    <Group gap={4} justify="space-between" wrap="nowrap">
                      {editingTitle?.id === c.id ? (
                        <TextInput
                          size="xs"
                          autoFocus
                          value={editingTitle.value}
                          onChange={(e) =>
                            setEditingTitle({ id: c.id, value: e.currentTarget.value })
                          }
                          onBlur={() => setEditingTitle(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              updateColumn(c.id, { title: editingTitle.value.trim() || undefined });
                              setEditingTitle(null);
                            } else if (e.key === "Escape") {
                              setEditingTitle(null);
                            }
                          }}
                        />
                      ) : (
                        <span>{columnLabel(c)}</span>
                      )}
                      {columnMenu(c)}
                    </Group>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{model.roots.flatMap((r) => renderRows(r.key, r.key, 1))}</Table.Tbody>
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
