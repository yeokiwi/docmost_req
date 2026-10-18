import { Container, Tabs, Text, Title } from "@mantine/core";
import {
  IconChartDonut,
  IconGitBranch,
  IconHistory,
  IconListDetails,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import RequirementOverview from "@/features/requirement/components/requirement-overview.tsx";
import RequirementDetailDrawer from "@/features/requirement/components/requirement-detail-drawer.tsx";
import RequirementList from "@/features/requirement/components/requirement-list.tsx";
import TraceTree from "@/features/requirement/components/trace-tree.tsx";
import CoveragePanel from "@/features/requirement/components/coverage-panel.tsx";
import BaselinePanel from "@/features/requirement/components/baseline-panel.tsx";

const TABS = ["overview", "list", "traceability", "coverage", "baselines"];

export default function SpaceRequirements() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const spaceAbility = useSpaceAbility(space?.membership?.permissions);

  const tabParam = searchParams.get("tab");
  const activeTab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";

  if (!space) {
    return <></>;
  }

  const canEdit = spaceAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
  const canManage = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Settings,
  );

  const reqParam = searchParams.get("req");

  return (
    <>
      {reqParam && (
        <RequirementDetailDrawer
          opened
          onClose={() =>
            setSearchParams(
              (cur) => {
                const next = new URLSearchParams(cur);
                next.delete("req");
                return next;
              },
              { replace: true },
            )
          }
          spaceId={space.id}
          requirementKey={reqParam}
        />
      )}
      <DocumentTitle title={`${t("Requirements")} - ${space.name}`} />
      <Container size="xl" pt="xl" pb="xl">
        <Title order={3}>{t("Requirements")}</Title>
        <Text size="sm" c="dimmed" mb="md">
          {space.name}
        </Text>

        <Tabs
          color="dark"
          value={activeTab}
          onChange={(value) => {
            if (value) setSearchParams({ tab: value }, { replace: true });
          }}
          keepMounted={false}
        >
          <Tabs.List mb="md">
            <Tabs.Tab
              value="overview"
              leftSection={<IconChartDonut size={16} />}
            >
              {t("Overview")}
            </Tabs.Tab>
            <Tabs.Tab value="list" leftSection={<IconListDetails size={16} />}>
              {t("Requirements")}
            </Tabs.Tab>
            <Tabs.Tab
              value="traceability"
              leftSection={<IconGitBranch size={16} />}
            >
              {t("Traceability")}
            </Tabs.Tab>
            <Tabs.Tab value="coverage" leftSection={<IconTargetArrow size={16} />}>
              {t("Coverage")}
            </Tabs.Tab>
            <Tabs.Tab value="baselines" leftSection={<IconHistory size={16} />}>
              {t("Baselines")}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview">
            <RequirementOverview space={space} />
          </Tabs.Panel>
          <Tabs.Panel value="list">
            <RequirementList space={space} canEdit={canEdit} />
          </Tabs.Panel>
          <Tabs.Panel value="traceability">
            <TraceTree space={space} />
          </Tabs.Panel>
          <Tabs.Panel value="coverage">
            <CoveragePanel space={space} />
          </Tabs.Panel>
          <Tabs.Panel value="baselines">
            <BaselinePanel
              space={space}
              canEdit={canEdit}
              canManage={canManage}
            />
          </Tabs.Panel>
        </Tabs>
      </Container>
    </>
  );
}
