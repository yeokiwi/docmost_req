import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Switch,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconArrowsExchange, IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types";
import { useTraceabilityQuery } from "../queries/requirement-query";
import { IRequirementFilter } from "../types/requirement.types";
import RequirementDetailDrawer from "./requirement-detail-drawer";

function toFilter(prefix: string): IRequirementFilter | undefined {
  const value = prefix.trim();
  return value ? { keyPrefix: value } : undefined;
}

export default function TraceabilityMatrix({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const [rowPrefix, setRowPrefix] = useState("");
  const [colPrefix, setColPrefix] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [hover, setHover] = useState<{ row?: string; col?: string }>({});
  const [debouncedRow] = useDebouncedValue(rowPrefix, 300);
  const [debouncedCol] = useDebouncedValue(colPrefix, 300);

  const { data, isLoading } = useTraceabilityQuery({
    spaceId: space.id,
    rowFilter: toFilter(debouncedRow),
    columnFilter: toFilter(debouncedCol),
  });

  // by default only show columns that something depends on, to keep the matrix readable
  const view = useMemo(() => {
    const cells = (data?.cells ?? []).map(([r, c]) =>
      swapped ? ([c, r] as [string, string]) : ([r, c] as [string, string]),
    );
    const rows = (swapped ? data?.columns : data?.rows) ?? [];
    const allColumns = (swapped ? data?.rows : data?.columns) ?? [];
    const used = new Set(cells.map(([, c]) => c));
    const columns = showAll ? allColumns : allColumns.filter((c) => used.has(c.key));
    const set = new Set(cells.map(([r, c]) => `${r}|${c}`));
    const rowHits = new Map<string, number>();
    for (const [r] of cells) rowHits.set(r, (rowHits.get(r) ?? 0) + 1);
    return { rows, columns, set, rowHits, links: cells.length };
  }, [data, showAll, swapped]);

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t(
          "Rows are requirements, columns are the requirements they reference. A requirement references another by containing a requirement reference inside its block.",
        )}
      </Text>
      <Group>
        <TextInput
          size="sm"
          label={t("Row key prefix")}
          placeholder="SYS-1"
          value={rowPrefix}
          onChange={(e) => setRowPrefix(e.currentTarget.value)}
        />
        <TextInput
          size="sm"
          label={t("Column key prefix")}
          placeholder="SYS"
          value={colPrefix}
          onChange={(e) => setColPrefix(e.currentTarget.value)}
        />
        <Button
          variant="default"
          size="sm"
          mt={24}
          leftSection={<IconArrowsExchange size={16} />}
          onClick={() => setSwapped((v) => !v)}
        >
          {t("Swap axes")}
        </Button>
        <Switch
          mt={30}
          label={t("Show all columns")}
          checked={showAll}
          onChange={(e) => setShowAll(e.currentTarget.checked)}
        />
        {data && data.rows.length > 0 && (
          <Group gap="xs" mt={26}>
            <Badge variant="light" color="gray">
              {t("{{count}} rows", { count: view.rows.length })}
            </Badge>
            <Badge variant="light" color="blue">
              {t("{{count}} links", { count: view.links })}
            </Badge>
          </Group>
        )}
      </Group>

      {data?.truncated && (
        <Text size="xs" c="dimmed">
          {t("The matrix is limited to 300 rows and columns.")}
        </Text>
      )}

      {isLoading ? (
        <Text size="sm" c="dimmed">
          {t("Loading...")}
        </Text>
      ) : !data || view.rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No requirements found")}
        </Text>
      ) : (
        <ScrollArea type="auto" offsetScrollbars>
          <Table withTableBorder withColumnBorders verticalSpacing={2}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th
                  miw={220}
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    background: "var(--mantine-color-body)",
                  }}
                >
                  {swapped ? t("Referenced requirement") : t("Requirement")}
                </Table.Th>
                <Table.Th ta="center" w={90}>
                  {t("Links")}
                </Table.Th>
                {view.columns.map((c) => (
                  <Table.Th
                    key={c.key}
                    ta="center"
                    bg={
                      hover.col === c.key
                        ? "var(--mantine-color-blue-light)"
                        : undefined
                    }
                  >
                    <Tooltip label={c.title || c.key} withinPortal>
                      <Text
                        size="xs"
                        ff="monospace"
                        style={{
                          writingMode: "vertical-rl",
                          transform: "rotate(180deg)",
                          cursor: "pointer",
                        }}
                        onClick={() => setSelected(c.key)}
                      >
                        {c.key}
                      </Text>
                    </Tooltip>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {view.rows.map((row) => (
                <Table.Tr
                  key={row.key}
                  bg={
                    hover.row === row.key
                      ? "var(--mantine-color-blue-light)"
                      : undefined
                  }
                >
                  <Table.Td
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background:
                        hover.row === row.key
                          ? "var(--mantine-color-blue-light)"
                          : "var(--mantine-color-body)",
                    }}
                  >
                    <Text
                      size="sm"
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelected(row.key)}
                      truncate
                    >
                      <Text span ff="monospace" fw={600} size="sm">
                        {row.key}
                      </Text>{" "}
                      {row.title}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Text
                      size="sm"
                      c={view.rowHits.get(row.key) ? undefined : "orange"}
                    >
                      {view.rowHits.get(row.key) ?? 0}
                    </Text>
                  </Table.Td>
                  {view.columns.map((c) => (
                    <Table.Td
                      key={c.key}
                      ta="center"
                      bg={
                        hover.col === c.key
                          ? "var(--mantine-color-blue-light)"
                          : undefined
                      }
                      onMouseEnter={() => setHover({ row: row.key, col: c.key })}
                      onMouseLeave={() => setHover({})}
                    >
                      {view.set.has(`${row.key}|${c.key}`) && (
                        <Tooltip
                          label={`${row.key} → ${c.key}`}
                          withinPortal
                        >
                          <IconCheck
                            size={16}
                            color="var(--mantine-color-green-6)"
                          />
                        </Tooltip>
                      )}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}

      {selected && (
        <RequirementDetailDrawer
          opened={!!selected}
          onClose={() => setSelected(null)}
          spaceId={space.id}
          requirementKey={selected}
        />
      )}
    </Stack>
  );
}
