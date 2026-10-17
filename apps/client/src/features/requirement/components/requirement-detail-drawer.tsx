import { useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  CopyButton,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCheck,
  IconCircleCheck,
  IconCircleDashed,
  IconCopy,
  IconExternalLink,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRequirementInfoQuery } from "../queries/requirement-query";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";
import RequirementPropertyBadge from "./requirement-property-badge";

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
  // dependencies can be followed inside the drawer; the stack allows going back
  const [trail, setTrail] = useState<{ spaceId: string; key: string }[]>([]);
  const current = trail[trail.length - 1];
  const { data, isLoading, isError } = useRequirementInfoQuery({
    requirementId: current ? undefined : requirementId,
    spaceId: current?.spaceId ?? spaceId,
    key: current?.key ?? requirementKey,
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
      onClose={() => {
        setTrail([]);
        onClose();
      }}
      position="right"
      size="lg"
      title={
        <Group gap="xs">
          {trail.length > 0 && (
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={t("Back")}
              onClick={() => setTrail((cur) => cur.slice(0, -1))}
            >
              <IconArrowLeft size={16} />
            </ActionIcon>
          )}
          <Badge variant="light" radius="sm" ff="monospace" size="lg">
            {requirement?.key ?? current?.key ?? requirementKey}
          </Badge>
          {requirement && (
            <CopyButton value={requirement.key}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t("Copied") : t("Copy key")}>
                  <ActionIcon variant="subtle" color="gray" onClick={copy}>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )}
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

          <Group gap="xs">
            {data.referencedByPages.length ? (
              <Badge
                color="green"
                variant="light"
                leftSection={<IconCircleCheck size={12} />}
              >
                {t("Covered by {{count}} pages", {
                  count: data.referencedByPages.length,
                })}
              </Badge>
            ) : (
              <Badge
                color="orange"
                variant="light"
                leftSection={<IconCircleDashed size={12} />}
              >
                {t("Not covered")}
              </Badge>
            )}
            {data.page && (
              <Button
                component={Link}
                to={pageUrl(data.page.slugId, data.page.title)}
                onClick={onClose}
                size="compact-xs"
                variant="default"
                leftSection={<IconExternalLink size={12} />}
              >
                {t("Open in page")}
              </Button>
            )}
          </Group>

          {properties.length > 0 && (
            <Paper withBorder radius="md" p="sm">
              <Group gap="xl" align="flex-start">
                {properties.map(([name, value]) => (
                  <div key={name}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                      {name}
                    </Text>
                    <RequirementPropertyBadge value={value} />
                  </div>
                ))}
              </Group>
            </Paper>
          )}

          <Tabs defaultValue="deps" keepMounted={false}>
            <Tabs.List mb="sm">
              <Tabs.Tab value="deps">
                {t("Dependencies")} (
                {data.dependsOn.length + data.referencedByRequirements.length})
              </Tabs.Tab>
              <Tabs.Tab value="pages">
                {t("Pages")} ({data.referencedByPages.length})
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="deps">
              <Stack gap="md">
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
                    style={{ cursor: dep.targetId ? "pointer" : undefined }}
                    onClick={() =>
                      dep.targetId &&
                      setTrail((cur) => [
                        ...cur,
                        { spaceId: dep.targetSpaceId, key: dep.targetKey },
                      ])
                    }
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
                  <Badge
                    variant="light"
                    radius="sm"
                    ff="monospace"
                    style={{ cursor: l.sourceKey ? "pointer" : undefined }}
                    onClick={() =>
                      l.sourceKey &&
                      setTrail((cur) => [
                        ...cur,
                        { spaceId: l.sourceSpaceId, key: l.sourceKey! },
                      ])
                    }
                  >
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

              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="pages">
              <Stack gap="md">
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
            </Tabs.Panel>
          </Tabs>

          <Group gap="xs">
            <CopyButton value={window.location.href}>
              {({ copied, copy }) => (
                <Button size="compact-sm" variant="default" onClick={copy}>
                  {copied ? t("Copied") : t("Copy link")}
                </Button>
              )}
            </CopyButton>
            {space && (
              <Button
                size="compact-sm"
                variant="default"
                component={Link}
                to={`/s/${space.slug}/requirements?tab=traceability&start=${encodeURIComponent(requirement.key)}`}
                onClick={onClose}
              >
                {t("Trace")}
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
