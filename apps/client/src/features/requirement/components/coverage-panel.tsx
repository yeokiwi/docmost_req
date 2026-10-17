import { useMemo, useState } from "react";
import {
  Anchor,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconDownload } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { ISpace } from "@/features/space/types/space.types";
import { buildPageUrl } from "@/features/page/page.utils";
import {
  useRequirementsQuery,
  useTraceabilityQuery,
} from "../queries/requirement-query";
import { exportRequirements } from "../services/requirement-service";
import { IRequirementFilter } from "../types/requirement.types";
import RequirementKey from "./requirement-key";
import RequirementDetailDrawer from "./requirement-detail-drawer";
import TraceabilityMatrix from "./traceability-matrix";

function toFilter(prefix: string): IRequirementFilter | undefined {
  const value = prefix.trim();
  return value ? { keyPrefix: value } : undefined;
}

function Tile({
  label,
  value,
  pct,
  color,
  danger,
  action,
}: {
  label: string;
  value: number;
  pct?: number;
  color?: string;
  danger?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      style={
        danger ? { borderColor: "var(--mantine-color-red-6)" } : undefined
      }
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Group gap="xs" align="baseline">
        <Text fz={28} fw={700} c={danger ? "red.7" : undefined}>
          {value}
        </Text>
        {pct !== undefined && (
          <Text size="sm" c="dimmed">
            {pct}%
          </Text>
        )}
      </Group>
      {pct !== undefined && <Progress value={pct} color={color} size="sm" />}
      {action}
    </Card>
  );
}

export default function CoveragePanel({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const [upstream, setUpstream] = useState("");
  const [downstream, setDownstream] = useState("");
  const [showUncovered, setShowUncovered] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dUp] = useDebouncedValue(upstream, 300);
  const [dDown] = useDebouncedValue(downstream, 300);

  const { data: upList } = useRequirementsQuery({
    spaceId: space.id,
    filter: toFilter(dUp),
    limit: 500,
    offset: 0,
  });
  const { data: matrix } = useTraceabilityQuery({
    spaceId: space.id,
    rowFilter: toFilter(dDown),
    columnFilter: toFilter(dUp),
  });

  const report = useMemo(() => {
    const items = upList?.items ?? [];
    const coveredKeys = new Set((matrix?.cells ?? []).map(([, c]) => c));
    const covered = items.filter((r) => coveredKeys.has(r.key));
    const uncovered = items.filter((r) => !coveredKeys.has(r.key));
    const byPage = new Map<
      string,
      { slugId: string; title: string | null; total: number; covered: number }
    >();
    for (const r of items) {
      const e = byPage.get(r.pageId) ?? {
        slugId: r.pageSlugId,
        title: r.pageTitle,
        total: 0,
        covered: 0,
      };
      e.total++;
      if (coveredKeys.has(r.key)) e.covered++;
      byPage.set(r.pageId, e);
    }
    return {
      total: items.length,
      covered: covered.length,
      uncovered,
      pages: [...byPage.values()].sort((a, b) => b.total - a.total),
    };
  }, [upList, matrix]);

  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  const exportUncovered = async () => {
    try {
      await exportRequirements({
        spaceId: space.id,
        format: "xlsx",
        filter: { keys: report.uncovered.map((r) => r.key) },
      });
    } catch {
      notifications.show({ message: t("Export failed"), color: "red" });
    }
  };

  return (
    <Tabs defaultValue="report" keepMounted={false} variant="default">
      <Tabs.List mb="md">
        <Tabs.Tab value="report">{t("Coverage report")}</Tabs.Tab>
        <Tabs.Tab value="matrix">{t("Dependency matrix")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="report">
        <Stack gap="md">
          <Group align="flex-end">
            <TextInput
              label={t("Upstream (key prefix)")}
              description={t("Requirements that must be covered")}
              placeholder="SYS"
              value={upstream}
              onChange={(e) => setUpstream(e.currentTarget.value)}
              ff="monospace"
            />
            <TextInput
              label={t("Downstream (key prefix)")}
              description={t("Requirements that cover them")}
              placeholder="SW"
              value={downstream}
              onChange={(e) => setDownstream(e.currentTarget.value)}
              ff="monospace"
            />
            {report.uncovered.length > 0 && (
              <Button
                variant="default"
                leftSection={<IconDownload size={16} />}
                onClick={exportUncovered}
              >
                {t("Export not covered")}
              </Button>
            )}
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            <Tile label={t("Upstream requirements")} value={report.total} />
            <Tile
              label={t("Covered")}
              value={report.covered}
              pct={pct(report.covered, report.total)}
              color="green"
            />
            <Tile
              label={t("Not covered")}
              value={report.uncovered.length}
              danger={report.uncovered.length > 0}
              action={
                report.uncovered.length > 0 && (
                  <Anchor size="sm" onClick={() => setShowUncovered((v) => !v)}>
                    {showUncovered ? t("Hide list") : t("Show list")} →
                  </Anchor>
                )
              }
            />
          </SimpleGrid>

          {showUncovered && report.uncovered.length > 0 && (
            <Card withBorder radius="md" padding="sm">
              <Text fw={600} mb="xs">
                {t("Not covered")}
              </Text>
              <Table verticalSpacing={4}>
                <Table.Tbody>
                  {report.uncovered.map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td w={140}>
                        <RequirementKey
                          value={r.key}
                          onClick={() => setSelected(r.key)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{r.title || t("Untitled")}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          )}

          <Card withBorder radius="md" padding="md">
            <Text fw={600} mb="xs">
              {t("Coverage by page")}
            </Text>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Page")}</Table.Th>
                  <Table.Th w={90}>{t("Reqs")}</Table.Th>
                  <Table.Th w={240}>{t("Covered")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.pages.map((p) => (
                  <Table.Tr key={p.slugId}>
                    <Table.Td>
                      <Anchor
                        size="sm"
                        component={Link}
                        to={buildPageUrl(space.slug, p.slugId, p.title)}
                      >
                        {p.title || t("Untitled")}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{p.total}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Progress
                          value={pct(p.covered, p.total)}
                          color={
                            pct(p.covered, p.total) < 80 ? "orange" : "green"
                          }
                          size="sm"
                          w={150}
                        />
                        <Text size="sm">{pct(p.covered, p.total)}%</Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="matrix">
        <TraceabilityMatrix space={space} />
      </Tabs.Panel>

      {selected && (
        <RequirementDetailDrawer
          opened
          onClose={() => setSelected(null)}
          spaceId={space.id}
          requirementKey={selected}
        />
      )}
    </Tabs>
  );
}
