import {
  Anchor,
  Badge,
  Divider,
  Drawer,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRequirementInfoQuery } from "../queries/requirement-query";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";

type RequirementDetailDrawerProps = {
  opened: boolean;
  onClose: () => void;
  requirementId?: string;
  spaceId?: string;
  requirementKey?: string;
};

export default function RequirementDetailDrawer({
  opened,
  onClose,
  requirementId,
  spaceId,
  requirementKey,
}: RequirementDetailDrawerProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useRequirementInfoQuery({
    requirementId,
    spaceId,
    key: requirementKey,
    enabled: opened,
  });
  const { data: space } = useSpaceQuery(data?.page?.spaceId);

  const pageUrl = (slugId: string, title?: string | null) =>
    buildPageUrl(space?.slug, slugId, title ?? undefined);

  const requirement = data?.requirement;
  const properties = Object.entries(requirement?.properties ?? {});

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Group gap="xs">
          <Badge variant="light" radius="sm" ff="monospace">
            {requirement?.key ?? requirementKey}
          </Badge>
          {requirement?.isConflict && (
            <Badge color="red" variant="light" radius="sm">
              {t("Duplicate key")}
            </Badge>
          )}
        </Group>
      }
    >
      {isLoading && <Loader size="sm" />}
      {isError && (
        <Text c="dimmed" size="sm">
          {t("Requirement not found or you do not have access to it.")}
        </Text>
      )}

      {requirement && (
        <Stack gap="md">
          <div>
            <Title order={4}>{requirement.title || t("Untitled")}</Title>
            {data.page && (
              <Text size="sm" c="dimmed">
                {t("Defined in")}{" "}
                <Anchor
                  component={Link}
                  to={pageUrl(data.page.slugId, data.page.title)}
                  onClick={onClose}
                >
                  {data.page.title || t("Untitled")}
                </Anchor>
              </Text>
            )}
          </div>

          {requirement.description && (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {requirement.description}
            </Text>
          )}

          {properties.length > 0 && (
            <Table withTableBorder withColumnBorders>
              <Table.Tbody>
                {properties.map(([name, value]) => (
                  <Table.Tr key={name}>
                    <Table.Td w="40%">
                      <Text size="sm" fw={500}>
                        {name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{value}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          <Divider label={t("Depends on")} labelPosition="left" />
          {data.dependsOn.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("None")}
            </Text>
          ) : (
            <Stack gap={4}>
              {data.dependsOn.map((dep) => (
                <Group key={`${dep.targetSpaceId}:${dep.targetKey}`} gap="xs">
                  <Badge
                    variant="light"
                    radius="sm"
                    ff="monospace"
                    color={dep.targetId ? "blue" : "red"}
                  >
                    {dep.targetKey}
                  </Badge>
                  <Text size="sm" c={dep.targetId ? undefined : "dimmed"}>
                    {dep.targetTitle ?? t("Missing requirement")}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}

          <Divider label={t("Referenced by requirements")} labelPosition="left" />
          {data.referencedByRequirements.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("None")}
            </Text>
          ) : (
            <Stack gap={4}>
              {data.referencedByRequirements.map((l) => (
                <Group key={`${l.sourcePageId}:${l.sourceKey}`} gap="xs">
                  <Badge variant="light" radius="sm" ff="monospace">
                    {l.sourceKey}
                  </Badge>
                  <Anchor
                    size="sm"
                    component={Link}
                    to={pageUrl(l.pageSlugId, l.pageTitle)}
                    onClick={onClose}
                  >
                    {l.pageTitle || t("Untitled")}
                  </Anchor>
                </Group>
              ))}
            </Stack>
          )}

          <Divider label={t("Referenced by pages")} labelPosition="left" />
          {data.referencedByPages.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t("Not covered by any page")}
            </Text>
          ) : (
            <Stack gap={4}>
              {data.referencedByPages.map((l) => (
                <Anchor
                  key={l.sourcePageId}
                  size="sm"
                  component={Link}
                  to={pageUrl(l.pageSlugId, l.pageTitle)}
                  onClick={onClose}
                >
                  {l.pageTitle || t("Untitled")}
                </Anchor>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
