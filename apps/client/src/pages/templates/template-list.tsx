import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Menu,
  SegmentedControl,
  SimpleGrid,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconDots,
  IconPlus,
  IconSearch,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import {
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  useTemplatePermissionsQuery,
  useTemplatesQuery,
} from "@/features/template/queries/template-query.ts";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { ITemplate } from "@/features/template/types.ts";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import classes from "@/features/template/components/template.module.css";

function TemplateCard({
  template,
  spaceName,
  onOpen,
  onDelete,
}: {
  template: ITemplate;
  spaceName?: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const updatedAgo = useTimeAgo(template.updatedAt);

  return (
    <div className={classes.card}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <UnstyledButton onClick={onOpen} style={{ minWidth: 0, flex: 1 }}>
          <Group gap="xs" wrap="nowrap">
            <Text fz="lg">{template.icon || <IconTemplate size={18} />}</Text>
            <Text fw={600} truncate>
              {template.title || t("Untitled")}
            </Text>
          </Group>
        </UnstyledButton>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={t("Template menu")}>
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onOpen}>{t("Open")}</Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={onDelete}
            >
              {t("Delete")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Text size="sm" c="dimmed" lineClamp={2} style={{ flex: 1 }}>
        {template.description || t("No description")}
      </Text>
      <Group gap={6}>
        <Badge size="xs" variant="light" color={template.spaceId ? "blue" : "gray"}>
          {template.spaceId ? spaceName ?? t("Space") : t("Workspace")}
        </Badge>
        <Text size="xs" c="dimmed">
          {template.creator?.name ? `${template.creator.name} · ` : ""}
          {updatedAgo}
        </Text>
      </Group>
    </div>
  );
}

export default function TemplateList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [scope, setScope] = useState("all");
  const { data } = useTemplatesQuery({ query: debouncedSearch || undefined });
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const { data: perms } = useTemplatePermissionsQuery();
  const createMutation = useCreateTemplateMutation();
  const deleteMutation = useDeleteTemplateMutation();

  const spaceNames = new Map(
    (spaces?.items ?? []).map((s) => [s.id, s.name] as const),
  );
  const templates = (data?.items ?? []).filter((tpl) =>
    scope === "all"
      ? true
      : scope === "workspace"
        ? !tpl.spaceId
        : !!tpl.spaceId,
  );

  const handleCreate = async () => {
    const template = await createMutation.mutateAsync({
      title: t("Untitled template"),
      spaceId: null,
    });
    navigate(`/templates/${template.id}`);
  };

  const confirmDelete = (template: ITemplate) =>
    modals.openConfirmModal({
      title: t("Delete template"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to delete this template?")}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(template.id),
    });

  return (
    <>
      <DocumentTitle title={t("Templates")} />
      <Container size={1100} pt="xl" pb="xl">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={2}>{t("Templates")}</Title>
            <Text c="dimmed" size="sm">
              {t(
                "Reusable page layouts. Use one from an empty page, the space menu, or save any page as a template.",
              )}
            </Text>
          </div>
          {perms?.canManageWorkspace && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={handleCreate}
              loading={createMutation.isPending}
            >
              {t("New template")}
            </Button>
          )}
        </Group>

        <Group mb="lg" gap="sm">
          <TextInput
            placeholder={t("Search templates")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 360 }}
          />
          <SegmentedControl
            value={scope}
            onChange={(v) => setScope(String(v))}
            data={[
              { value: "all", label: t("All") },
              { value: "workspace", label: t("Workspace") },
              { value: "space", label: t("Spaces") },
            ]}
          />
        </Group>

        {templates.length === 0 ? (
          <Text c="dimmed">{t("No templates found")}</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                spaceName={tpl.spaceId ? spaceNames.get(tpl.spaceId) : undefined}
                onOpen={() => navigate(`/templates/${tpl.id}`)}
                onDelete={() => confirmDelete(tpl)}
              />
            ))}
          </SimpleGrid>
        )}
      </Container>
    </>
  );
}
