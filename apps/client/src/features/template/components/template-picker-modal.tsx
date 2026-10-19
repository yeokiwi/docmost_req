import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch, IconTemplate } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import {
  useTemplateQuery,
  useTemplatesQuery,
} from "@/features/template/queries/template-query.ts";
import { ITemplate } from "@/features/template/types.ts";
import { createPageFromTemplate } from "@/features/template/services/template-service.ts";
import { TemplatePreview } from "./template-preview.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { invalidateOnCreatePage } from "@/features/page/queries/page-query.ts";
import { useSpaceQuery } from "@/features/space/queries/space-query.ts";
import classes from "./template.module.css";

interface TemplatePickerModalProps {
  opened: boolean;
  onClose: () => void;
  /** space the picker is opened from; its templates are listed too */
  spaceId?: string;
  parentPageId?: string;
  /**
   * Called with the full template (including content). When omitted, a new
   * page is created from the template in `spaceId`.
   */
  onUse?: (template: ITemplate) => void | Promise<void>;
  useLabel?: string;
}

export default function TemplatePickerModal({
  opened,
  onClose,
  spaceId,
  parentPageId,
  onUse,
  useLabel,
}: TemplatePickerModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [scope, setScope] = useState<"all" | "space">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: space } = useSpaceQuery(spaceId ?? "");

  const { data, isLoading } = useTemplatesQuery({
    query: debouncedSearch || undefined,
    spaceId: scope === "space" ? spaceId : undefined,
  });
  const templates = data?.items ?? [];
  const { data: selected, isFetching: loadingSelected } =
    useTemplateQuery(selectedId ?? undefined);

  useEffect(() => {
    if (!opened) {
      setSelectedId(null);
      setSearch("");
    }
  }, [opened]);

  useEffect(() => {
    if (opened && !selectedId && templates.length > 0) {
      setSelectedId(templates[0].id);
    }
  }, [opened, templates, selectedId]);

  const handleUse = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      if (onUse) {
        await onUse(selected);
      } else if (spaceId) {
        const page = await createPageFromTemplate({
          template: selected,
          spaceId,
          parentPageId,
        });
        invalidateOnCreatePage(page);
        if (space) {
          navigate(buildPageUrl(space.slug, page.slugId, page.title));
        }
      }
      onClose();
    } catch (err: any) {
      notifications.show({
        message:
          err?.response?.data?.message ?? t("Failed to create page"),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="80rem"
      title={t("Templates")}
      padding="md"
    >
      <Group align="stretch" gap="md" wrap="nowrap" h={560}>
        <Stack w={300} gap="xs" style={{ flexShrink: 0 }}>
          <TextInput
            placeholder={t("Search templates")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            data-autofocus
          />
          {spaceId && (
            <SegmentedControl
              size="xs"
              value={scope}
              onChange={(v) => {
                setScope(v as any);
                setSelectedId(null);
              }}
              data={[
                { value: "all", label: t("All") },
                { value: "space", label: t("This space") },
              ]}
            />
          )}
          <ScrollArea style={{ flex: 1 }}>
            {isLoading && <Loader size="sm" m="md" />}
            {!isLoading && templates.length === 0 && (
              <Text c="dimmed" size="sm" p="sm">
                {t("No templates found")}
              </Text>
            )}
            {templates.map((tpl) => (
              <UnstyledButton
                key={tpl.id}
                className={classes.item}
                data-active={tpl.id === selectedId || undefined}
                onClick={() => setSelectedId(tpl.id)}
              >
                <Group gap="xs" wrap="nowrap">
                  <Box w={20} ta="center">
                    {tpl.icon || <IconTemplate size={16} />}
                  </Box>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {tpl.title || t("Untitled")}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {tpl.description ||
                        (tpl.spaceId ? t("Space template") : t("Workspace template"))}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
            ))}
          </ScrollArea>
        </Stack>

        <Stack style={{ flex: 1, minWidth: 0 }} gap="xs">
          <Box className={classes.preview} style={{ flex: 1 }}>
            <ScrollArea h="100%">
              {selected ? (
                <Box p="lg">
                  <Text fz={28} fw={700} mb="sm">
                    {selected.icon ? `${selected.icon} ` : ""}
                    {selected.title || t("Untitled")}
                  </Text>
                  <TemplatePreview content={selected.content} />
                </Box>
              ) : (
                <Text c="dimmed" p="lg">
                  {loadingSelected ? t("Loading...") : t("Select a template")}
                </Text>
              )}
            </ScrollArea>
          </Box>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button
              onClick={handleUse}
              disabled={!selected || (!onUse && !spaceId)}
              loading={busy}
            >
              {useLabel ?? t("Use template")}
            </Button>
          </Group>
        </Stack>
      </Group>
    </Modal>
  );
}
