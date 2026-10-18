import { useEffect, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Button,
  Checkbox,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconTag } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./requirement.module.css";

type Attrs = {
  name: string;
  value: string;
  wholeDocument: boolean;
  ignoreProperties: boolean;
  ignoreDependencies: boolean;
};

/**
 * Property marker: renames or ignores a table column when placed in a
 * heading, or adds a property to a requirement (or the whole page).
 */
export default function RequirementPropertyView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor } = props;
  const { t } = useTranslation();
  const attrs = node.attrs as Attrs;
  const isEditable = editor.isEditable;
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<Attrs>(attrs);

  useEffect(() => {
    // a freshly inserted, empty marker opens its settings straight away
    if (isEditable && !attrs.name && !attrs.ignoreProperties && !attrs.ignoreDependencies) {
      setOpened(true);
    }
  }, []);

  useEffect(() => {
    if (opened) setDraft(attrs);
  }, [opened]);

  const flags = [
    attrs.wholeDocument && t("whole page"),
    attrs.ignoreProperties && t("not a property"),
    attrs.ignoreDependencies && t("not a dependency"),
  ].filter(Boolean);

  const label = attrs.name
    ? attrs.value
      ? `${attrs.name}: ${attrs.value}`
      : attrs.name
    : flags.length
      ? t("Ignored column")
      : t("Property");

  return (
    <NodeViewWrapper style={{ display: "inline" }} data-drag-handle>
      <Popover
        opened={opened}
        onChange={setOpened}
        width={300}
        position="bottom-start"
        shadow="md"
        trapFocus
        withinPortal
      >
        <Popover.Target>
          <span
            className={classes.propertyMarker}
            role="button"
            tabIndex={0}
            title={flags.join(", ") || undefined}
            onClick={() => isEditable && setOpened((o) => !o)}
          >
            <IconTag size={12} />
            {label}
            {flags.length > 0 && (
              <Text span size="xs" c="dimmed">
                {" "}
                ({flags.join(", ")})
              </Text>
            )}
          </span>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <TextInput
              size="xs"
              label={t("Name")}
              description={t(
                "In a table heading, replaces the column title as the property or relationship name.",
              )}
              value={draft.name}
              onChange={(e) =>
                setDraft({ ...draft, name: e.currentTarget.value })
              }
              data-autofocus
            />
            <TextInput
              size="xs"
              label={t("Value")}
              description={t(
                "Set a value to add this property to the requirement around it.",
              )}
              value={draft.value}
              onChange={(e) =>
                setDraft({ ...draft, value: e.currentTarget.value })
              }
            />
            <Checkbox
              size="xs"
              label={t("Whole page: apply to every requirement on this page")}
              checked={draft.wholeDocument}
              onChange={(e) =>
                setDraft({ ...draft, wholeDocument: e.currentTarget.checked })
              }
            />
            <Checkbox
              size="xs"
              label={t("Ignore this column for properties")}
              checked={draft.ignoreProperties}
              onChange={(e) =>
                setDraft({ ...draft, ignoreProperties: e.currentTarget.checked })
              }
            />
            <Checkbox
              size="xs"
              label={t("Ignore this column for dependencies")}
              checked={draft.ignoreDependencies}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  ignoreDependencies: e.currentTarget.checked,
                })
              }
            />
            <Group justify="space-between">
              <Button
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => deleteNode()}
              >
                {t("Remove")}
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  updateAttributes({
                    ...draft,
                    name: draft.name.trim(),
                    value: draft.value.trim(),
                  });
                  setOpened(false);
                }}
              >
                {t("Save")}
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </NodeViewWrapper>
  );
}
