import { useMemo, useState } from "react";
import {
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconCheck } from "@tabler/icons-react";
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
  const [debouncedRow] = useDebouncedValue(rowPrefix, 300);
  const [debouncedCol] = useDebouncedValue(colPrefix, 300);

  const { data, isLoading } = useTraceabilityQuery({
    spaceId: space.id,
    rowFilter: toFilter(debouncedRow),
    columnFilter: toFilter(debouncedCol),
  });

  const cellSet = useMemo(
    () => new Set((data?.cells ?? []).map(([r, c]) => `${r}|${c}`)),
    [data],
  );

  // only show columns that something depends on, to keep the matrix readable
  const usedColumns = useMemo(() => {
    const used = new Set((data?.cells ?? []).map(([, c]) => c));
    return (data?.columns ?? []).filter((c) => used.has(c.key));
  }, [data]);

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
      ) : !data || data.rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No requirements found")}
        </Text>
      ) : (
        <ScrollArea type="auto" offsetScrollbars>
          <Table withTableBorder withColumnBorders verticalSpacing={2}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th miw={220}>{t("Requirement")}</Table.Th>
                <Table.Th ta="center" w={100}>
                  {t("References")}
                </Table.Th>
                {usedColumns.map((c) => (
                  <Table.Th key={c.key} ta="center">
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
              {data.rows.map((row) => (
                <Table.Tr key={row.key}>
                  <Table.Td>
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
                      c={row.referenceCount ? undefined : "red"}
                    >
                      {row.referenceCount}
                    </Text>
                  </Table.Td>
                  {usedColumns.map((c) => (
                    <Table.Td key={c.key} ta="center">
                      {cellSet.has(`${row.key}|${c.key}`) && (
                        <IconCheck
                          size={14}
                          color="var(--mantine-color-green-6)"
                        />
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
