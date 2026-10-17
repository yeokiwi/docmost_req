import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Select,
  Pagination,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconCircleCheck,
  IconCircleDashed,
  IconColumns,
  IconDownload,
  IconFileSpreadsheet,
  IconFilterOff,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconUpload,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { ISpace } from "@/features/space/types/space.types";
import { buildPageUrl } from "@/features/page/page.utils";
import NoTableResults from "@/components/common/no-table-results";
import {
  useRequirementSettingsQuery,
  useRequirementsQuery,
} from "../queries/requirement-query";
import { exportRequirements } from "../services/requirement-service";
import {
  IRequirementFilter,
  RequirementCoverage,
} from "../types/requirement.types";
import RequirementPropertyBadge from "./requirement-property-badge";
import RequirementDetailDrawer from "./requirement-detail-drawer";
import ImportRequirementsModal from "./import-requirements-modal";

const PAGE_SIZE = 50;

export default function RequirementList({
  space,
  canEdit,
}: {
  space: ISpace;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [propertyFilters, setPropertyFilters] = useState<
    Record<string, string>
  >({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [sort, setSort] = useState<{
    field: string;
    dir: "asc" | "desc";
  } | null>(null);
  const [coverage, setCoverage] = useState<RequirementCoverage>("any");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [importOpened, setImportOpened] = useState(false);
  const [debouncedText] = useDebouncedValue(text, 300);

  const [debouncedProps] = useDebouncedValue(propertyFilters, 300);
  const properties = debouncedProps;
  const filter: IRequirementFilter = {
    text: debouncedText.trim() || undefined,
    properties: Object.keys(properties).length ? properties : undefined,
    coverage,
  };

  const { data: settings } = useRequirementSettingsQuery(space.id);
  const { data, isLoading } = useRequirementsQuery({
    spaceId: space.id,
    filter,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const schema = settings?.propertySchema ?? [];
  const columns = schema.map((d) => d.name).filter((n) => !hiddenColumns.includes(n));
  const activeFilterCount =
    Object.keys(propertyFilters).length +
    (text ? 1 : 0) +
    (coverage !== "any" ? 1 : 0);

  const items = useMemo(() => {
    const list = [...(data?.items ?? [])];
    if (!sort) return list;
    const value = (r: (typeof list)[number]) =>
      sort.field === "title"
        ? r.title
        : sort.field === "references"
          ? r.referenceCount
          : sort.field === "key"
            ? r.key
            : (r.properties?.[sort.field] ?? "");
    list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data, sort]);

  const toggleSort = (field: string) =>
    setSort((cur) =>
      cur?.field !== field
        ? { field, dir: "asc" }
        : cur.dir === "asc"
          ? { field, dir: "desc" }
          : null,
    );

  const sortIcon = (field: string) =>
    sort?.field !== field ? (
      <IconArrowsSort size={14} opacity={0.4} />
    ) : sort.dir === "asc" ? (
      <IconSortAscending size={14} />
    ) : (
      <IconSortDescending size={14} />
    );

  const sortableHead = (field: string, label: string, width?: number) => (
    <Table.Th w={width}>
      <Group
        gap={4}
        wrap="nowrap"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => toggleSort(field)}
      >
        {label}
        {sortIcon(field)}
      </Group>
    </Table.Th>
  );

  const resetFilters = () => {
    setText("");
    setPropertyFilters({});
    setCoverage("any");
    setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const handleExport = async (format: "xlsx" | "csv") => {
    try {
      await exportRequirements({ spaceId: space.id, format, filter });
    } catch (err) {
      notifications.show({
        message: t("Export failed"),
        color: "red",
      });
    }
  };

  return (
    <Stack gap="sm">
      {!settings && (
        <Alert color="blue" variant="light">
          {t(
            "Set a requirement key prefix in space settings to start defining requirements.",
          )}
        </Alert>
      )}

      <Group justify="space-between" align="flex-end">
        <Group align="flex-end">
          <TextInput
            size="sm"
            leftSection={<IconSearch size={16} />}
            placeholder={t("Search by key or text")}
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              setPage(1);
            }}
          />
          {schema.map((d) => {
            const setValue = (v: string | null) => {
              setPropertyFilters((cur) => {
                const next = { ...cur };
                if (v) next[d.name] = v;
                else delete next[d.name];
                return next;
              });
              setPage(1);
            };
            return d.type === "select" ? (
              <Select
                key={d.name}
                size="sm"
                w={150}
                clearable
                placeholder={d.name}
                aria-label={d.name}
                data={d.options ?? []}
                value={propertyFilters[d.name] ?? null}
                onChange={setValue}
              />
            ) : (
              <TextInput
                key={d.name}
                size="sm"
                w={150}
                placeholder={d.name}
                aria-label={d.name}
                value={propertyFilters[d.name] ?? ""}
                onChange={(e) => setValue(e.currentTarget.value || null)}
              />
            );
          })}
          <SegmentedControl
            size="sm"
            value={coverage}
            onChange={(v) => {
              setCoverage(v as RequirementCoverage);
              setPage(1);
            }}
            data={[
              { value: "any", label: t("All") },
              { value: "covered", label: t("Covered") },
              { value: "uncovered", label: t("Not covered") },
            ]}
          />
          {activeFilterCount > 0 && (
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconFilterOff size={16} />}
              onClick={resetFilters}
            >
              {t("Clear filters")}
            </Button>
          )}
        </Group>

        <Group gap="xs">
          {schema.length > 0 && (
            <Menu position="bottom-end" withinPortal closeOnItemClick={false}>
              <Menu.Target>
                <Button
                  variant="default"
                  size="sm"
                  leftSection={<IconColumns size={16} />}
                >
                  {t("Columns")}
                </Button>
              </Menu.Target>
              <Menu.Dropdown p="xs">
                <Stack gap="xs">
                  {schema.map((d) => (
                    <Checkbox
                      key={d.name}
                      size="xs"
                      label={d.name}
                      checked={!hiddenColumns.includes(d.name)}
                      onChange={(e) =>
                        setHiddenColumns((cur) =>
                          e.currentTarget.checked
                            ? cur.filter((n) => n !== d.name)
                            : [...cur, d.name],
                        )
                      }
                    />
                  ))}
                </Stack>
              </Menu.Dropdown>
            </Menu>
          )}
          {canEdit && settings && (
            <Button
              variant="default"
              size="sm"
              leftSection={<IconUpload size={16} />}
              onClick={() => setImportOpened(true)}
            >
              {t("Import")}
            </Button>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconDownload size={16} />}
              >
                {t("Export")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconFileSpreadsheet size={16} />}
                onClick={() => handleExport("xlsx")}
              >
                {t("Excel (.xlsx)")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileSpreadsheet size={16} />}
                onClick={() => handleExport("csv")}
              >
                {t("CSV (.csv)")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {data && (
        <Text size="xs" c="dimmed">
          {t("{{count}} requirements", { count: data.total })}
          {activeFilterCount > 0 && ` · ${t("filtered")}`}
        </Text>
      )}

      {data?.truncated && (
        <Text size="xs" c="dimmed">
          {t("Showing the first {{count}} matches. Refine the filter.", {
            count: data.total,
          })}
        </Text>
      )}

      <Table.ScrollContainer minWidth={700}>
        <Table highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={28} />
              {sortableHead("key", t("Key"), 130)}
              {sortableHead("title", t("Title"))}
              {columns.map((c) => sortableHead(c, c))}
              <Table.Th w={120}>{t("Depends on")}</Table.Th>
              {sortableHead("references", t("References"), 110)}
              <Table.Th>{t("Page")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.length ? (
              items.map((r) => (
                <Table.Tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(r.key)}
                >
                  <Table.Td>
                    <Tooltip
                      label={
                        r.isConflict
                          ? t("Duplicate key")
                          : r.referenceCount
                            ? t("Covered")
                            : t("Not covered")
                      }
                      withinPortal
                    >
                      {r.isConflict ? (
                        <IconAlertTriangle
                          size={16}
                          color="var(--mantine-color-red-6)"
                        />
                      ) : r.referenceCount ? (
                        <IconCircleCheck
                          size={16}
                          color="var(--mantine-color-green-6)"
                        />
                      ) : (
                        <IconCircleDashed
                          size={16}
                          color="var(--mantine-color-orange-6)"
                        />
                      )}
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      radius="sm"
                      ff="monospace"
                      color={r.isConflict ? "red" : "blue"}
                    >
                      {r.key}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2}>
                      {r.title || t("Untitled")}
                    </Text>
                  </Table.Td>
                  {columns.map((c) => (
                    <Table.Td key={c}>
                      <RequirementPropertyBadge value={r.properties?.[c]} />
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <Group gap={4}>
                      {r.dependsOn?.slice(0, 3).map((k) => (
                        <Badge
                          key={k}
                          variant="outline"
                          color="gray"
                          size="xs"
                          radius="sm"
                          ff="monospace"
                        >
                          {k}
                        </Badge>
                      ))}
                      {(r.dependsOn?.length ?? 0) > 3 && (
                        <Text size="xs" c="dimmed">
                          +{r.dependsOn.length - 3}
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant={r.referenceCount ? "light" : "outline"}
                      color={r.referenceCount ? "green" : "orange"}
                      size="sm"
                      circle
                    >
                      {r.referenceCount}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text
                      size="sm"
                      component={Link}
                      to={buildPageUrl(space.slug, r.pageSlugId, r.pageTitle)}
                      onClick={(e) => e.stopPropagation()}
                      c="dimmed"
                      td="underline"
                    >
                      {r.pageTitle || t("Untitled")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={6 + columns.length} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {!isLoading && totalPages > 1 && (
        <Group justify="flex-end">
          <Pagination
            size="sm"
            total={totalPages}
            value={page}
            onChange={setPage}
          />
        </Group>
      )}

      {selected && (
        <RequirementDetailDrawer
          opened={!!selected}
          onClose={() => setSelected(null)}
          spaceId={space.id}
          requirementKey={selected}
        />
      )}

      {importOpened && (
        <ImportRequirementsModal
          opened={importOpened}
          onClose={() => setImportOpened(false)}
          space={space}
        />
      )}
    </Stack>
  );
}
