import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  NodeViewContent,
  NodeViewProps,
  NodeViewWrapper,
} from "@tiptap/react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  IconAdjustmentsHorizontal,
  IconExternalLink,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { RequirementProperties } from "@docmost/editor-ext";
import classes from "./requirement.module.css";
import {
  usePageRequirementConflictsQuery,
  useRequirementSettingsQuery,
} from "@/features/requirement/queries/requirement-query";
import { usePageQuery } from "@/features/page/queries/page-query";
import { getEditorPageId } from "@/features/requirement/utils/editor-space";
import { reassignRequirementKey } from "@/features/requirement/utils/insert-requirement";
import RequirementDetailDrawer from "@/features/requirement/components/requirement-detail-drawer";
import { IRequirementPropertyDefinition } from "@/features/requirement/types/requirement.types";

export default function RequirementView(props: NodeViewProps) {
  const { node, updateAttributes, editor, getPos } = props;
  const { t } = useTranslation();
  const { key, title, properties } = node.attrs as {
    id: string | null;
    key: string;
    title: string;
    properties: RequirementProperties;
  };
  const nodeId = node.attrs.id as string | null;

  const pageId = getEditorPageId(editor);
  const { data: page } = usePageQuery({ pageId });
  const { data: settings } = useRequirementSettingsQuery(page?.spaceId);
  const isEditable = editor.isEditable;
  // conflicts only matter to people who can fix them
  const { data: conflictNodeIds } = usePageRequirementConflictsQuery(
    isEditable ? pageId : undefined,
  );
  const isConflict = !!nodeId && !!conflictNodeIds?.includes(nodeId);

  const [searchParams] = useSearchParams();
  const [highlighted, setHighlighted] = useState(false);
  const targetKey = searchParams.get("requirement");

  useEffect(() => {
    if (!key || !targetKey || targetKey.toUpperCase() !== key.toUpperCase()) return;
    // wait for layout so the scroll lands on the block
    const timer = setTimeout(() => {
      const el = document.querySelector(
        `[data-requirement-key="${CSS.escape(key)}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(true);
    }, 300);
    const clear = setTimeout(() => setHighlighted(false), 4300);
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [key, targetKey]);

  const [titleValue, setTitleValue] = useState(title ?? "");
  const [drawerOpened, setDrawerOpened] = useState(false);

  useEffect(() => {
    setTitleValue(title ?? "");
  }, [title]);

  const debouncedTitle = useDebouncedCallback(
    (value: string) => updateAttributes({ title: value }),
    300,
  );

  const propertyEntries = Object.entries(properties ?? {}).filter(
    ([, value]) => value,
  );

  return (
    <NodeViewWrapper
      className={clsx(
        classes.block,
        isConflict && classes.blockConflict,
        highlighted && classes.blockHighlight,
      )}
      data-requirement-key={key}
    >
      <div className={classes.header} contentEditable={false}>
        <Tooltip
          label={
            isConflict
              ? t("This key is already defined elsewhere in the space")
              : t("Show requirement details")
          }
          withinPortal
        >
          <Badge
            variant="light"
            color={isConflict ? "red" : "blue"}
            radius="sm"
            ff="monospace"
            style={{ cursor: "pointer" }}
            onClick={() => setDrawerOpened(true)}
          >
            {key || "—"}
          </Badge>
        </Tooltip>

        {isEditable ? (
          <TextInput
            className={classes.titleInput}
            value={titleValue}
            placeholder={t("Requirement title")}
            size="sm"
            variant="unstyled"
            onChange={(e) => {
              setTitleValue(e.currentTarget.value);
              debouncedTitle(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const pos = getPos();
                if (typeof pos === "number") {
                  // jump into the description; focus synchronously so fast
                  // typing doesn't land in the title input
                  editor.commands.setTextSelection(pos + 2);
                  editor.view.focus();
                }
              }
            }}
          />
        ) : (
          <Text className={classes.titleText} size="sm">
            {title || t("Untitled requirement")}
          </Text>
        )}

        <div className={classes.properties}>
          {propertyEntries.map(([name, value]) => (
            <Badge key={name} variant="default" radius="sm" size="sm">
              {name}: {value}
            </Badge>
          ))}
        </div>

        {isConflict && isEditable && (
          <Tooltip label={t("Assign a new key")} withinPortal>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => reassignRequirementKey(editor, getPos)}
              aria-label={t("Assign a new key")}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        )}

        {isEditable && (
          <PropertiesPopover
            properties={properties ?? {}}
            schema={
              (settings?.propertySchema ??
                []) as IRequirementPropertyDefinition[]
            }
            onChange={(next) => updateAttributes({ properties: next })}
          />
        )}

        <Tooltip label={t("Show requirement details")} withinPortal>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => setDrawerOpened(true)}
            aria-label={t("Show requirement details")}
          >
            <IconExternalLink size={16} />
          </ActionIcon>
        </Tooltip>
      </div>

      <NodeViewContent className={classes.content} />

      {drawerOpened && (
        <RequirementDetailDrawer
          opened={drawerOpened}
          onClose={() => setDrawerOpened(false)}
          spaceId={page?.spaceId}
          requirementKey={key}
        />
      )}
    </NodeViewWrapper>
  );
}

function PropertiesPopover({
  properties,
  schema,
  onChange,
}: {
  properties: RequirementProperties;
  schema: IRequirementPropertyDefinition[];
  onChange: (properties: RequirementProperties) => void;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<RequirementProperties>(properties);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (opened) setDraft(properties);
  }, [opened]);

  const schemaNames = new Set(schema.map((d) => d.name));
  const customEntries = Object.entries(draft).filter(
    ([name]) => !schemaNames.has(name),
  );

  const setValue = (name: string, value: string) =>
    setDraft((prev) => ({ ...prev, [name]: value }));

  const removeValue = (name: string) =>
    setDraft((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const save = () => {
    const cleaned: RequirementProperties = {};
    for (const [name, value] of Object.entries(draft)) {
      const v = (value ?? "").trim();
      if (name.trim() && v) cleaned[name.trim()] = v;
    }
    onChange(cleaned);
    setOpened(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={320}
      position="bottom-end"
      withArrow
      shadow="md"
      trapFocus
    >
      <Popover.Target>
        <Tooltip label={t("Edit properties")} withinPortal>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => setOpened((o) => !o)}
            aria-label={t("Edit properties")}
          >
            <IconAdjustmentsHorizontal size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          {schema.map((def) =>
            def.type === "select" ? (
              <Select
                key={def.name}
                label={def.name}
                size="xs"
                data={def.options ?? []}
                value={draft[def.name] ?? null}
                onChange={(v) => setValue(def.name, v ?? "")}
                clearable
                comboboxProps={{ withinPortal: false }}
              />
            ) : (
              <TextInput
                key={def.name}
                label={def.name}
                size="xs"
                value={draft[def.name] ?? ""}
                onChange={(e) => setValue(def.name, e.currentTarget.value)}
              />
            ),
          )}

          {customEntries.map(([name, value]) => (
            <Group key={name} gap={4} align="flex-end" wrap="nowrap">
              <TextInput
                label={name}
                size="xs"
                style={{ flex: 1 }}
                value={value}
                onChange={(e) => setValue(name, e.currentTarget.value)}
              />
              <ActionIcon
                variant="subtle"
                color="gray"
                mb={2}
                onClick={() => removeValue(name)}
                aria-label={t("Remove")}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}

          <Group gap={4} align="flex-end" wrap="nowrap">
            <TextInput
              label={t("Add property")}
              placeholder={t("Name")}
              size="xs"
              style={{ flex: 1 }}
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  e.preventDefault();
                  setValue(newName.trim(), draft[newName.trim()] ?? "");
                  setNewName("");
                }
              }}
            />
            <ActionIcon
              variant="default"
              mb={2}
              disabled={!newName.trim()}
              onClick={() => {
                setValue(newName.trim(), draft[newName.trim()] ?? "");
                setNewName("");
              }}
              aria-label={t("Add property")}
            >
              <IconPlus size={14} />
            </ActionIcon>
          </Group>

          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setOpened(false)}>
              {t("Cancel")}
            </Button>
            <Button size="xs" onClick={save}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
