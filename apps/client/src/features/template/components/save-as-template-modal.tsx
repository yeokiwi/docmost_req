import { useEffect, useState } from "react";
import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  useCreateTemplateMutation,
  useTemplatePermissionsQuery,
} from "@/features/template/queries/template-query.ts";

interface SaveAsTemplateModalProps {
  opened: boolean;
  onClose: () => void;
  pageId: string;
  spaceId: string;
  defaultTitle?: string;
  defaultIcon?: string;
}

export default function SaveAsTemplateModal({
  opened,
  onClose,
  pageId,
  spaceId,
  defaultTitle,
  defaultIcon,
}: SaveAsTemplateModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<string>("space");
  const { data: perms } = useTemplatePermissionsQuery(opened ? spaceId : undefined);
  const createMutation = useCreateTemplateMutation();

  useEffect(() => {
    if (opened) {
      setTitle(defaultTitle ?? "");
      setDescription("");
    }
  }, [opened, defaultTitle]);

  useEffect(() => {
    if (!perms) return;
    if (!perms.canManageSpace && perms.canManageWorkspace) setScope("workspace");
    else setScope("space");
  }, [perms]);

  const scopeOptions = [
    ...(perms?.canManageSpace ? [{ value: "space", label: t("This space") }] : []),
    ...(perms?.canManageWorkspace
      ? [{ value: "workspace", label: t("Whole workspace") }]
      : []),
  ];

  const handleSave = async () => {
    await createMutation.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      icon: defaultIcon || undefined,
      spaceId: scope === "space" ? spaceId : null,
      pageId,
    });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Save as template")}>
      <Stack>
        <TextInput
          label={t("Template name")}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          required
          data-autofocus
        />
        <Textarea
          label={t("Description")}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Select
          label={t("Available in")}
          data={scopeOptions}
          value={scope}
          onChange={(v) => v && setScope(v)}
          allowDeselect={false}
          disabled={scopeOptions.length === 0}
          description={
            perms && scopeOptions.length === 0
              ? t("You do not have permission to create templates here")
              : undefined
          }
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={handleSave}
            loading={createMutation.isPending}
            disabled={!title.trim() || scopeOptions.length === 0}
          >
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
