import { Anchor, Badge, Group, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buildPageUrl } from "@/features/page/page.utils";
import { useBrokenLinksQuery } from "../queries/requirement-query";

/** Pages of the space that link to requirements which no longer exist. */
export default function BrokenLinksPanel({
  spaceId,
  spaceSlug,
}: {
  spaceId: string;
  spaceSlug: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useBrokenLinksQuery(spaceId);

  return (
    <Stack gap="xs" mt="xl">
      <div>
        <Title order={5}>{t("Broken links")}</Title>
        <Text size="sm" c="dimmed">
          {t("Pages of this space with links to deleted or undefined requirements.")}
        </Text>
      </div>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Page")}</Table.Th>
            <Table.Th>{t("Deleted requirements")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(data ?? []).map((row) => (
            <Table.Tr key={row.pageId}>
              <Table.Td>
                <Anchor size="sm" component={Link} to={buildPageUrl(spaceSlug, row.slugId, row.title)}>
                  {row.title || t("Untitled")}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Group gap={4}>
                  {row.keys.map((key) => (
                    <Badge key={key} color="red" variant="filled" radius="sm" ff="monospace" tt="none">
                      {key}
                    </Badge>
                  ))}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {!isLoading && !data?.length && (
            <Table.Tr>
              <Table.Td colSpan={2}>
                <Text size="sm" c="dimmed" ta="center">
                  {t("No broken links.")}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
