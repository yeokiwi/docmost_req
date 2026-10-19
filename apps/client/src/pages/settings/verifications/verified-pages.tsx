import { useState } from "react";
import { Anchor, Badge, Group, Select, Table, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { useVerificationListQuery } from "@/features/page-verification/queries.ts";
import { STATE_META } from "@/features/page-verification/state.ts";
import { VerificationType } from "@/features/page-verification/types.ts";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { formattedDate } from "@/lib/time.ts";

export default function VerifiedPages() {
  const { t } = useTranslation();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const { data, isLoading } = useVerificationListQuery({
    spaceId: spaceId ?? undefined,
    type: (type as VerificationType) ?? undefined,
    state: state ?? undefined,
  });
  const items = data?.items ?? [];

  return (
    <>
      <DocumentTitle title={t("Verified pages")} />
      <SettingsTitle title={t("Verified pages")} />

      <Group mb="md" gap="sm">
        <Select
          placeholder={t("All spaces")}
          data={(spaces?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={spaceId}
          onChange={(v) => setSpaceId((v as string) ?? null)}
          clearable
          searchable
          w={200}
        />
        <Select
          placeholder={t("All workflows")}
          data={[
            { value: "expiring", label: t("Verification") },
            { value: "qms", label: t("Approval workflow") },
          ]}
          value={type}
          onChange={(v) => setType((v as string) ?? null)}
          clearable
          w={180}
        />
        <Select
          placeholder={t("Any status")}
          data={Object.entries(STATE_META).map(([value, m]) => ({
            value,
            label: t(m.label),
          }))}
          value={state}
          onChange={(v) => setState((v as string) ?? null)}
          clearable
          w={200}
        />
      </Group>

      <Table.ScrollContainer minWidth={700}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Page")}</Table.Th>
              <Table.Th>{t("Space")}</Table.Th>
              <Table.Th>{t("Status")}</Table.Th>
              <Table.Th>{t("Verified")}</Table.Th>
              <Table.Th>{t("Expires")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Anchor
                    component={Link}
                    to={buildPageUrl(item.spaceSlug, item.pageSlugId, item.pageTitle)}
                    size="sm"
                  >
                    {item.pageIcon ? `${item.pageIcon} ` : ""}
                    {item.pageTitle || t("Untitled")}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{item.spaceName}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={STATE_META[item.state].color}>
                    {t(STATE_META[item.state].label)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {item.verifiedAt
                      ? `${formattedDate(new Date(item.verifiedAt))}${
                          item.verifiedByName ? ` · ${item.verifiedByName}` : ""
                        }`
                      : "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {item.expiresAt ? formattedDate(new Date(item.expiresAt)) : "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!isLoading && items.length === 0 && (
        <Text c="dimmed" size="sm" mt="md">
          {t("No pages have verification set up yet.")}
        </Text>
      )}
    </>
  );
}
