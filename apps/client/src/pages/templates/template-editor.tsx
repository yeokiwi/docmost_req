import { useEffect, useRef, useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Select,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconArrowLeft, IconTemplate } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import EmojiPicker from "@/components/ui/emoji-picker.tsx";
import {
  useTemplateQuery,
  useUpdateTemplateMutation,
} from "@/features/template/queries/template-query.ts";
import { TemplateContentEditor } from "@/features/template/components/template-content-editor.tsx";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { createPageFromTemplate } from "@/features/template/services/template-service.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { invalidateOnCreatePage } from "@/features/page/queries/page-query.ts";

export default function TemplateEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { data: template, isError } = useTemplateQuery(templateId);
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const updateMutation = useUpdateTemplateMutation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [useSpaceId, setUseSpaceId] = useState<string | null>(null);
  const contentRef = useRef<any>(null);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (template && loadedId.current !== template.id) {
      loadedId.current = template.id;
      setTitle(template.title ?? "");
      setDescription(template.description ?? "");
      setIcon(template.icon);
      contentRef.current = template.content;
      setDirty(false);
    }
  }, [template]);

  if (isError) {
    return (
      <Container pt="xl">
        <Text>{t("Template not found")}</Text>
      </Container>
    );
  }
  if (!template) return null;

  const canEdit = template.permissions?.canEdit ?? false;
  const spaceOptions = (spaces?.items ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      templateId: template.id,
      title: title.trim() || t("Untitled template"),
      description,
      icon: icon ?? "",
      content: contentRef.current,
    });
    setDirty(false);
    notifications.show({ message: t("Template saved") });
  };

  const handleCreatePage = async (spaceId: string) => {
    const space = spaces?.items?.find((s) => s.id === spaceId);
    const page = await createPageFromTemplate({
      template: { ...template, title, icon, content: contentRef.current },
      spaceId,
    });
    invalidateOnCreatePage(page);
    if (space) navigate(buildPageUrl(space.slug, page.slugId, page.title));
  };

  return (
    <>
      <DocumentTitle title={title || t("Template")} />
      <Container size={900} pt="md" pb="xl">
        <Group justify="space-between" mb="md">
          <Anchor component={Link} to="/templates" size="sm">
            <Group gap={4}>
              <IconArrowLeft size={14} />
              {t("Templates")}
            </Group>
          </Anchor>
          <Group gap="xs">
            <Badge variant="light" color={template.spaceId ? "blue" : "gray"}>
              {template.spaceId
                ? spaceOptions.find((o) => o.value === template.spaceId)?.label ??
                  t("Space template")
                : t("Workspace template")}
            </Badge>
            <Select
              size="xs"
              w={200}
              placeholder={t("Create page in…")}
              data={spaceOptions}
              value={useSpaceId}
              onChange={(v) => {
                setUseSpaceId(null);
                if (v) handleCreatePage(v);
              }}
              searchable
              aria-label={t("Create page from template")}
            />
            {canEdit && (
              <Button
                size="xs"
                onClick={handleSave}
                disabled={!dirty}
                loading={updateMutation.isPending}
              >
                {t("Save")}
              </Button>
            )}
          </Group>
        </Group>

        <Group gap="xs" align="center" wrap="nowrap">
          <EmojiPicker
            onEmojiSelect={(emoji) => {
              setIcon(emoji.native);
              setDirty(true);
            }}
            icon={icon || <IconTemplate size={20} />}
            removeEmojiAction={() => {
              setIcon(null);
              setDirty(true);
            }}
            readOnly={!canEdit}
          />
          <TextInput
            variant="unstyled"
            size="xl"
            styles={{ input: { fontSize: 32, fontWeight: 700 } }}
            placeholder={t("Untitled template")}
            value={title}
            readOnly={!canEdit}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
              setDirty(true);
            }}
            style={{ flex: 1 }}
          />
        </Group>
        <Textarea
          variant="unstyled"
          placeholder={t("Add a description")}
          value={description}
          readOnly={!canEdit}
          autosize
          minRows={1}
          onChange={(e) => {
            setDescription(e.currentTarget.value);
            setDirty(true);
          }}
          mb="md"
        />

        <TemplateContentEditor
          key={template.id}
          content={template.content}
          editable={canEdit}
          onChange={(json) => {
            contentRef.current = json;
            setDirty(true);
          }}
        />
      </Container>
    </>
  );
}
