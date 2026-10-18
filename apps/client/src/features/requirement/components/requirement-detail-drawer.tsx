import { useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  CopyButton,
  Drawer,
  Group,
  Loader,
  Stack,
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
import {
  useRequirementInfoQuery,
  useRequirementTypesQuery,
} from "../queries/requirement-query";
import { matchRequirementType } from "./insert-requirement-dialog";
import { TypeLozenge } from "./requirement-types-panel";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { buildRequirementUrl } from "../utils/requirement-url";
import RequirementPropertyBadge from "./requirement-property-badge";

/** The search query for "property = value", escaping spaces and quotes. */
export function propertyQuery(name: string, value: string) {
  const escapedName = name.replace(/([\\\s])/g, "\\$1");
  return `@${escapedName} = '${value.replace(/'/g, "''")}'`;
}

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
  const { data: typeList } = useRequirementTypesQuery(data?.page?.spaceId);
  const requirementType = requirement
    ? matchRequirementType(requirement.key, typeList?.types ?? [])
    : null;
  const validationMessages = requirement?.validationMessages ?? [];
  const [expanded, setExpanded] = useState(false);

  // "See also": what this requirement references (its parents), what
  // references it (its children), and pages that link to it
  type SeeAlso = {
    id: string;
    kind: "parent" | "child" | "link";
    key?: string;
    spaceId?: string;
    relation?: string | null;
    label: string | null;
    pageSlugId?: string;
    missing?: boolean;
  };
  const seeAlso: SeeAlso[] = data
    ? [
        ...data.dependsOn.map((d) => ({
          id: `p:${d.targetSpaceId}:${d.targetKey}:${d.relation ?? ""}`,
          kind: "parent" as const,
          key: d.targetKey,
          spaceId: d.targetSpaceId,
          relation: d.relation,
          label: d.targetTitle,
          missing: !d.targetId,
        })),
        ...data.referencedByRequirements.map((l) => ({
          id: `c:${l.sourcePageId}:${l.sourceKey}:${l.relation ?? ""}`,
          kind: "child" as const,
          key: l.sourceKey ?? undefined,
          spaceId: l.sourceSpaceId,
          relation: l.relation,
          label: l.pageTitle,
          pageSlugId: l.pageSlugId,
        })),
        ...data.referencedByPages.map((l) => ({
          id: `l:${l.sourcePageId}`,
          kind: "link" as const,
          label: l.pageTitle,
          pageSlugId: l.pageSlugId,
        })),
      ]
    : [];
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
          {requirementType && <TypeLozenge type={requirementType} />}
          {requirement && !requirement.isConflict && (
            <Badge color="green" variant="light" radius="sm" size="sm">
              {t("Origin definition")}
            </Badge>
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
            <div>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }} lineClamp={expanded ? undefined : 2}>
                {requirement.description}
              </Text>
              {requirement.description.length > 160 && (
                <Anchor size="xs" component="button" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? t("Show less") : t("Click to expand...")}
                </Anchor>
              )}
            </div>
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

          {validationMessages.length > 0 && (
            <Stack gap={4}>
              {validationMessages.map((m, i) => (
                <Text
                  key={i}
                  size="sm"
                  c={m.level === "error" ? "red.7" : "yellow.8"}
                >
                  {m.level === "error" ? "✕ " : "⚠ "}
                  {m.message}
                </Text>
              ))}
            </Stack>
          )}

          {properties.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {properties.map(([name, value]) => (
                <li key={name} style={{ marginBottom: 4 }}>
                  {/* the name builds a search for this value, as long as the value is short */}
                  {space && value.length < 80 ? (
                    <Tooltip label={t("Find requirements with this value")}>
                      <Anchor
                        size="sm"
                        component={Link}
                        onClick={onClose}
                        to={`/s/${space.slug}/requirements?tab=list&query=${encodeURIComponent(
                          propertyQuery(name, value),
                        )}`}
                      >
                        {name}
                      </Anchor>
                    </Tooltip>
                  ) : (
                    <Text span size="sm" fw={500}>
                      {name}
                    </Text>
                  )}
                  <Text span size="sm">
                    :{" "}
                  </Text>
                  {value.length < 30 ? (
                    <RequirementPropertyBadge value={value} />
                  ) : (
                    <Text span size="sm" style={{ whiteSpace: "pre-wrap" }}>
                      {value}
                    </Text>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div>
            <Text size="sm" fw={600} mb={4}>
              {t("See also:")}
            </Text>
            {seeAlso.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t("Nothing links to or from this requirement yet.")}
              </Text>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {seeAlso.map((entry) => (
                  <li key={entry.id} style={{ marginBottom: 4 }}>
                    <Group gap={6} wrap="nowrap">
                      <Badge
                        size="sm"
                        radius="sm"
                        color={entry.kind === "link" ? "orange" : "dark"}
                        variant="filled"
                        w={78}
                      >
                        {entry.kind === "parent"
                          ? t("Parent ↗")
                          : entry.kind === "child"
                            ? t("Child ↘")
                            : t("Link")}
                      </Badge>
                      {entry.relation && (
                        <Text size="sm" c="dimmed">
                          ({entry.relation})
                        </Text>
                      )}
                      {entry.key ? (
                        <Anchor
                          size="sm"
                          ff="monospace"
                          c={entry.missing ? "red" : undefined}
                          td={entry.missing ? "line-through" : undefined}
                          onClick={() =>
                            !entry.missing &&
                            setTrail((cur) => [
                              ...cur,
                              { spaceId: entry.spaceId!, key: entry.key! },
                            ])
                          }
                        >
                          {entry.key}
                        </Anchor>
                      ) : null}
                      <Anchor
                        size="sm"
                        truncate
                        component={entry.pageSlugId ? Link : undefined}
                        to={entry.pageSlugId ? pageUrl(entry.pageSlugId, entry.label) : undefined}
                        onClick={entry.pageSlugId ? onClose : undefined}
                        c={entry.pageSlugId ? undefined : "dimmed"}
                      >
                        {entry.label || (entry.missing ? t("Missing requirement") : "")}
                      </Anchor>
                    </Group>
                  </li>
                ))}
              </ul>
            )}
            {space && (
              <Anchor
                size="xs"
                component={Link}
                mt={6}
                display="inline-block"
                onClick={onClose}
                to={`/s/${space.slug}/requirements?tab=baselines`}
              >
                {t("See history")}
              </Anchor>
            )}
          </div>

          <Group gap="xs">
            <CopyButton
              value={
                space ? buildRequirementUrl(space.slug, requirement.key) : window.location.href
              }
            >
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
