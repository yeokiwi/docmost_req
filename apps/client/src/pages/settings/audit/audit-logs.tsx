import { Fragment, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Group,
  NumberInput,
  Select,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconChevronRight, IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query.ts";

interface IAuditEntry {
  id: string;
  event: string;
  resourceType: string;
  resourceId: string | null;
  spaceId: string | null;
  actorId: string | null;
  actorType: string;
  changes: any;
  metadata: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  actorAvatarUrl: string | null;
  spaceName: string | null;
}

const CATEGORIES = [
  "page",
  "space",
  "space_member",
  "comment",
  "user",
  "workspace",
  "workspace_invitation",
  "group",
  "share",
  "attachment",
  "template",
  "api_key",
  "requirement",
  "integration",
];

type Filters = {
  event?: string;
  actorId?: string;
  from?: string;
  to?: string;
};

function toCsv(rows: IAuditEntry[]): string {
  const cols = ["createdAt", "event", "actorName", "actorEmail", "actorType", "resourceType", "resourceId", "spaceName", "ipAddress", "changes", "metadata"];
  const esc = (v: any) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(","))].join("\n");
}

function RetentionSetting() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["audit-settings"],
    queryFn: async () => (await api.post<{ retentionDays: number }>("/audit/settings")).data,
  });
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    if (data) setDays(data.retentionDays);
  }, [data]);

  const save = async () => {
    try {
      await api.post("/audit/retention", { retentionDays: days });
      queryClient.invalidateQueries({ queryKey: ["audit-settings"] });
      notifications.show({ message: t("Retention updated") });
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    }
  };

  return (
    <Group align="flex-end" gap="xs" mb="lg">
      <NumberInput
        label={t("Keep audit events for (days)")}
        min={7}
        max={3650}
        w={220}
        value={days ?? undefined}
        onChange={(v) => setDays(Number(v) || null)}
      />
      <Button variant="default" onClick={save} disabled={!days || days === data?.retentionDays}>
        {t("Save")}
      </Button>
    </Group>
  );
}

export default function AuditLogs() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: members } = useWorkspaceMembersQuery({ limit: 100, query: "" });

  const query = useInfiniteQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async ({ pageParam }) =>
      (
        await api.post<{ items: IAuditEntry[]; meta: { hasNextPage: boolean; nextCursor: string | null } }>(
          "/audit",
          {
            limit: 50,
            cursor: pageParam,
            event: filters.event,
            actorId: filters.actorId,
            from: filters.from ? new Date(filters.from).toISOString() : undefined,
            to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
          },
        )
      ).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.nextCursor : undefined),
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <DocumentTitle title={t("Audit logs")} />
      <SettingsTitle title={t("Audit logs")} />

      <RetentionSetting />

      <Group mb="md" gap="sm" align="flex-end">
        <Select
          label={t("Event")}
          placeholder={t("All events")}
          data={CATEGORIES.map((c) => ({ value: `${c}.`, label: c.replace(/_/g, " ") }))}
          value={filters.event ?? null}
          onChange={(v) => setFilters((f) => ({ ...f, event: (v as string) ?? undefined }))}
          clearable
          w={180}
        />
        <Select
          label={t("Actor")}
          placeholder={t("Anyone")}
          data={(members?.items ?? []).map((m) => ({ value: m.id, label: m.name }))}
          value={filters.actorId ?? null}
          onChange={(v) => setFilters((f) => ({ ...f, actorId: (v as string) ?? undefined }))}
          clearable
          searchable
          w={200}
        />
        <TextInput
          type="date"
          label={t("From")}
          value={filters.from ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.currentTarget.value || undefined }))}
          w={160}
        />
        <TextInput
          type="date"
          label={t("To")}
          value={filters.to ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.currentTarget.value || undefined }))}
          w={160}
        />
        <Button
          variant="default"
          leftSection={<IconDownload size={16} />}
          onClick={exportCsv}
          disabled={rows.length === 0}
          ml="auto"
        >
          {t("Export CSV")}
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={800}>
        <Table verticalSpacing="xs" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={28} />
              <Table.Th>{t("Time")}</Table.Th>
              <Table.Th>{t("Actor")}</Table.Th>
              <Table.Th>{t("Event")}</Table.Th>
              <Table.Th>{t("Space")}</Table.Th>
              <Table.Th>{t("IP address")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => {
              const open = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <Table.Tr style={{ cursor: "pointer" }} onClick={() => setExpanded(open ? null : r.id)}>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t("Details")}>
                        {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      </ActionIcon>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {r.actorName ? (
                        <Group gap={6} wrap="nowrap">
                          <CustomAvatar avatarUrl={r.actorAvatarUrl} name={r.actorName} size={20} />
                          <Text size="sm">{r.actorName}</Text>
                          {r.actorType === "api_key" && (
                            <Tooltip label={t("Performed with an API key")} withArrow>
                              <Badge size="xs" variant="light">API</Badge>
                            </Tooltip>
                          )}
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">
                          {t("System")}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Code>{r.event}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{r.spaceName ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {r.ipAddress ?? "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  {open && (
                    <Table.Tr>
                      <Table.Td />
                      <Table.Td colSpan={5}>
                        <Code block style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {JSON.stringify(
                            {
                              resourceType: r.resourceType,
                              resourceId: r.resourceId,
                              changes: r.changes ?? undefined,
                              metadata: r.metadata ?? undefined,
                              userAgent: r.userAgent ?? undefined,
                            },
                            null,
                            2,
                          )}
                        </Code>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {!query.isLoading && rows.length === 0 && (
        <Text c="dimmed" size="sm" mt="md">
          {t("No audit events match these filters.")}
        </Text>
      )}
      {query.hasNextPage && (
        <Group justify="center" mt="md">
          <Button variant="default" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
            {t("Load more")}
          </Button>
        </Group>
      )}
    </>
  );
}
