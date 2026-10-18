import { useMemo, useState } from "react";
import {
  Anchor,
  Badge,
  Card,
  Group,
  Loader,
  Paper,
  Progress,
  RingProgress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types";
import { buildPageUrl } from "@/features/page/page.utils";
import { formattedDate } from "@/lib/time";
import RequirementKey from "./requirement-key";
import {
  useBaselinesQuery,
  useRequirementSettingsQuery,
  useRequirementsQuery,
} from "../queries/requirement-query";
import { propertyColor } from "../utils/requirement-style";
import RequirementDetailDrawer from "./requirement-detail-drawer";

const FETCH_LIMIT = 500;

export default function RequirementOverview({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: settings } = useRequirementSettingsQuery(space.id);
  const { data: baselines } = useBaselinesQuery(space.id);
  const lastBaseline = baselines?.[0];
  const { data, isLoading } = useRequirementsQuery({
    spaceId: space.id,
    limit: FETCH_LIMIT,
    offset: 0,
  });

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    const covered = items.filter((r) => r.referenceCount > 0);
    const uncovered = items.filter((r) => r.referenceCount === 0);
    const duplicates = items.filter((r) => r.isConflict);
    const invalid = items.filter((r) => r.validationStatus === "error");
    const warnings = items.filter((r) => r.validationStatus === "warning");
    const withDeps = items.filter((r) => (r.dependsOn?.length ?? 0) > 0);

    const byPage = new Map<
      string,
      { slugId: string; title: string | null; count: number }
    >();
    for (const r of items) {
      const entry = byPage.get(r.pageId) ?? {
        slugId: r.pageSlugId,
        title: r.pageTitle,
        count: 0,
      };
      entry.count++;
      byPage.set(r.pageId, entry);
    }

    const breakdowns = (settings?.propertySchema ?? [])
      .filter((d) => d.type === "select")
      .map((d) => {
        const counts = new Map<string, number>();
        for (const r of items) {
          const v = r.properties?.[d.name]?.trim() || "";
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        const order = [...(d.options ?? []), ""];
        const rows = [...counts.entries()].sort((a, b) => {
          const ia = order.indexOf(a[0]);
          const ib = order.indexOf(b[0]);
          return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || b[1] - a[1];
        });
        return { name: d.name, rows };
      });

    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const recent = [...items]
      .sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt))
      .slice(0, 5);
    return {
      recent,
      thisWeek: items.filter((r) => +new Date(r.createdAt) > weekAgo).length,
      total: items.length,
      covered: covered.length,
      uncovered,
      duplicates,
      invalid,
      warnings,
      withDeps: withDeps.length,
      pages: [...byPage.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      breakdowns,
    };
  }, [data, settings]);

  if (isLoading) return <Loader size="sm" />;

  if (!stats.total) {
    return (
      <Paper withBorder p="xl" radius="md" ta="center">
        <Text fw={600}>{t("No requirements found")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Insert a requirement block into a page with the slash menu to get started.",
          )}
        </Text>
      </Paper>
    );
  }

  const coveragePct = Math.round((stats.covered / stats.total) * 100);

  return (
    <Stack gap="md">
      {data?.total && data.total > FETCH_LIMIT && (
        <Text size="xs" c="dimmed">
          {t("Statistics are based on the first {{count}} requirements.", {
            count: FETCH_LIMIT,
          })}
        </Text>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Paper withBorder p="md" radius="md">
          <Text size="sm" c="dimmed">
            {t("Requirements")}
          </Text>
          <Text fz={28} fw={700} lh={1.2}>
            {stats.total}
          </Text>
          <Text size="sm" c="dimmed">
            {t("+{{count}} this week", { count: stats.thisWeek })}
          </Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="sm" c="dimmed">
            {t("Covered")}
          </Text>
          <Text fz={28} fw={700} lh={1.2}>
            {coveragePct}%
          </Text>
          <Progress value={coveragePct} color="green" size="sm" mt={4} />
        </Paper>
        <Paper
          withBorder
          p="md"
          radius="md"
          component={Link}
          to={`/s/${space.slug}/requirements?tab=list&val=issues`}
          style={{
            textDecoration: "none",
            color: "inherit",
            ...(stats.invalid.length || stats.duplicates.length
              ? { borderColor: "var(--mantine-color-red-6)" }
              : {}),
          }}
        >
          <Text size="sm" c="dimmed">
            {t("Validation issues")}
          </Text>
          <Text
            fz={28}
            fw={700}
            lh={1.2}
            c={stats.invalid.length || stats.duplicates.length ? "red.7" : undefined}
          >
            {stats.invalid.length + stats.duplicates.length}
          </Text>
          <Text size="sm" c="dimmed">
            {t("{{warnings}} warnings · {{duplicates}} duplicate keys", {
              warnings: stats.warnings.length,
              duplicates: stats.duplicates.length,
            })}
          </Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="sm" c="dimmed">
            {t("Last baseline")}
          </Text>
          {lastBaseline ? (
            <>
              <Text fz={22} fw={700} lh={1.4}>
                BL-{lastBaseline.version} · {lastBaseline.name}
              </Text>
              <Text size="sm" c="dimmed">
                {formattedDate(new Date(lastBaseline.createdAt))}
              </Text>
            </>
          ) : (
            <Text fz={22} fw={700} lh={1.4} c="dimmed">
              {t("None yet")}
            </Text>
          )}
        </Paper>
      </SimpleGrid>

      <Card withBorder radius="md" padding="md">
        <Text fw={600} fz="lg" mb="xs">
          {t("Recently updated requirements")}
        </Text>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={150}>{t("Key")}</Table.Th>
              <Table.Th>{t("Title")}</Table.Th>
              <Table.Th>{t("Page")}</Table.Th>
              <Table.Th w={140}>{t("Updated")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {stats.recent.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <RequirementKey
                    value={r.key}
                    conflict={r.isConflict}
                    onClick={() => setSelected(r.key)}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1}>
                    {r.title || t("Untitled")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Anchor
                    size="sm"
                    component={Link}
                    to={buildPageUrl(space.slug, r.pageSlugId, r.pageTitle)}
                  >
                    {r.pageTitle || t("Untitled")}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formattedDate(new Date(r.updatedAt))}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder radius="md" padding="md">
          <Text fw={600} mb="xs">
            {t("Coverage")}
          </Text>
          <Group justify="center">
            <RingProgress
              size={160}
              thickness={16}
              roundCaps
              label={
                <Text ta="center" fw={700} fz={26}>
                  {coveragePct}%
                </Text>
              }
              sections={[
                { value: coveragePct, color: "green", tooltip: t("Covered") },
                {
                  value: 100 - coveragePct,
                  color: "orange",
                  tooltip: t("Not covered"),
                },
              ]}
            />
          </Group>
        </Card>

        {stats.breakdowns.map((b) => (
          <Card key={b.name} withBorder radius="md" padding="md">
            <Text fw={600} mb="xs">
              {t("By {{property}}", { property: b.name })}
            </Text>
            <Progress.Root size={14} radius="xl" mb="sm">
              {b.rows.map(([value, count]) => (
                <Tooltip
                  key={value || "none"}
                  label={`${value || t("Not set")}: ${count}`}
                >
                  <Progress.Section
                    value={(count / stats.total) * 100}
                    color={value ? propertyColor(value) : "gray.3"}
                  />
                </Tooltip>
              ))}
            </Progress.Root>
            <Stack gap={4}>
              {b.rows.map(([value, count]) => (
                <Group key={value || "none"} justify="space-between">
                  <Badge
                    variant="light"
                    size="sm"
                    radius="sm"
                    color={value ? propertyColor(value) : "gray"}
                  >
                    {value || t("Not set")}
                  </Badge>
                  <Text size="sm">{count}</Text>
                </Group>
              ))}
            </Stack>
          </Card>
        ))}

        <Card withBorder radius="md" padding="md">
          <Text fw={600} mb="xs">
            {t("Top pages")}
          </Text>
          <Stack gap={6}>
            {stats.pages.map((p) => (
              <Group key={p.slugId} justify="space-between" wrap="nowrap">
                <Anchor
                  size="sm"
                  component={Link}
                  to={buildPageUrl(space.slug, p.slugId, p.title)}
                  truncate
                >
                  {p.title || t("Untitled")}
                </Anchor>
                <Badge variant="light" color="gray" size="sm">
                  {p.count}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Card>
      </SimpleGrid>

      {(stats.uncovered.length > 0 || stats.duplicates.length > 0) && (
        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="xs">
            <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
            <Text fw={600}>{t("Needs attention")}</Text>
          </Group>
          <Stack gap={6}>
            {stats.duplicates.map((r) => (
              <Group key={`d-${r.id}`} gap="xs" wrap="nowrap">
                <Badge color="red" variant="light" radius="sm" ff="monospace">
                  {r.key}
                </Badge>
                <Anchor size="sm" truncate onClick={() => setSelected(r.key)}>
                  {r.title || t("Untitled")}
                </Anchor>
                <Text size="xs" c="dimmed">
                  {t("Duplicate key")}
                </Text>
              </Group>
            ))}
            {stats.uncovered.slice(0, 10).map((r) => (
              <Group key={`u-${r.id}`} gap="xs" wrap="nowrap">
                <Badge color="orange" variant="light" radius="sm" ff="monospace">
                  {r.key}
                </Badge>
                <Anchor size="sm" truncate onClick={() => setSelected(r.key)}>
                  {r.title || t("Untitled")}
                </Anchor>
                <Text size="xs" c="dimmed">
                  {t("Not covered")}
                </Text>
              </Group>
            ))}
            {stats.uncovered.length > 10 && (
              <Text size="xs" c="dimmed">
                {t("and {{count}} more", { count: stats.uncovered.length - 10 })}
              </Text>
            )}
          </Stack>
        </Card>
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
