import { useEffect, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Badge,
  Group,
  HoverCard,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import classes from "./requirement.module.css";
import {
  useRequirementInfoQuery,
  useRequirementsQuery,
} from "@/features/requirement/queries/requirement-query";
import { usePageQuery } from "@/features/page/queries/page-query";
import { getEditorPageId } from "@/features/requirement/utils/editor-space";
import RequirementDetailDrawer from "@/features/requirement/components/requirement-detail-drawer";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildRequirementPath } from "@/features/requirement/utils/requirement-url";
import { IRequirement } from "@/features/requirement/types/requirement.types";

export default function RequirementRefView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor, getPos } = props;
  const { t } = useTranslation();
  const { key, requirementId } = node.attrs as {
    key: string;
    requirementId: string | null;
    spaceId: string | null;
  };

  const pageId = getEditorPageId(editor);
  const { data: page } = usePageQuery({ pageId });
  const spaceId = (node.attrs.spaceId as string | null) ?? page?.spaceId;

  const { data: refSpace } = useSpaceQuery(spaceId ?? "");
  const href =
    key && refSpace?.slug ? buildRequirementPath(refSpace.slug, key) : undefined;

  const [pickerOpened, setPickerOpened] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [drawerOpened, setDrawerOpened] = useState(false);
  const isEditable = editor.isEditable;

  useEffect(() => {
    const storage = editor.storage?.requirementRef;
    if (storage?.autoOpen && !key) {
      storage.autoOpen = false;
      setPickerOpened(true);
    }
  }, []);

  const { data: info, isError } = useRequirementInfoQuery({
    spaceId: spaceId ?? undefined,
    key,
    enabled: !!key && (hovered || drawerOpened),
  });

  const select = (req: PickerItem) => {
    updateAttributes({
      key: req.key,
      requirementId: req.id ?? null,
      spaceId: req.spaceId ?? spaceId ?? null,
    });
    setPickerOpened(false);
    const pos = getPos();
    if (typeof pos === "number") {
      editor.commands.focus(pos + node.nodeSize);
    }
  };

  const open = () => {
    if (!key && isEditable) setPickerOpened(true);
    else if (key) setDrawerOpened(true);
  };

  // a real link, so the reference can be opened in a new tab or copied
  const chip = (
    <a
      className={clsx(
        classes.ref,
        isError && classes.refMissing,
        !key && classes.refEmpty,
      )}
      href={href}
      onClick={(e) => {
        // plain click opens the panel; modified clicks keep normal link behaviour
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        open();
      }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      data-requirement-id={requirementId ?? undefined}
      title={key ? t("Open requirement {{key}}", { key }) : undefined}
    >
      {key || t("Select requirement")}
    </a>
  );

  return (
    <NodeViewWrapper style={{ display: "inline" }} data-drag-handle>
      {key ? (
        <HoverCard
          width={300}
          shadow="md"
          openDelay={300}
          withinPortal
          onOpen={() => setHovered(true)}
        >
          <HoverCard.Target>{chip}</HoverCard.Target>
          <HoverCard.Dropdown>
            {isError ? (
              <Text size="sm" c="dimmed">
                {t("Requirement {{key}} was not found", { key })}
              </Text>
            ) : !info ? (
              <Loader size="xs" />
            ) : (
              <Stack gap={4}>
                <Group gap="xs">
                  <Badge variant="light" radius="sm" ff="monospace">
                    {info.requirement.key}
                  </Badge>
                  <Text size="sm" fw={600} lineClamp={2}>
                    {info.requirement.title || t("Untitled")}
                  </Text>
                </Group>
                {info.requirement.description && (
                  <Text size="xs" c="dimmed" lineClamp={4}>
                    {info.requirement.description}
                  </Text>
                )}
                <Text size="xs" c="dimmed">
                  {t("Defined in {{page}}", {
                    page: info.page?.title || t("Untitled"),
                  })}
                </Text>
              </Stack>
            )}
          </HoverCard.Dropdown>
        </HoverCard>
      ) : (
        <Popover
          opened={pickerOpened}
          onChange={(open) => {
            if (!open && !key) {
              deleteNode();
              return;
            }
            setPickerOpened(open);
          }}
          width={340}
          position="bottom-start"
          shadow="md"
          trapFocus
        >
          <Popover.Target>{chip}</Popover.Target>
          <Popover.Dropdown p="xs">
            <RequirementPicker
              spaceId={spaceId}
              localRequirements={collectDocRequirements(editor, spaceId)}
              onSelect={select}
              onCancel={() => {
                setPickerOpened(false);
                deleteNode();
              }}
            />
          </Popover.Dropdown>
        </Popover>
      )}

      {drawerOpened && (
        <RequirementDetailDrawer
          opened={drawerOpened}
          onClose={() => setDrawerOpened(false)}
          spaceId={spaceId ?? undefined}
          requirementKey={key}
        />
      )}
    </NodeViewWrapper>
  );
}

type PickerItem = Pick<IRequirement, "key" | "title"> & {
  id?: string | null;
  spaceId?: string | null;
};

/**
 * Requirements defined in the open document. They are not indexed until the
 * page is saved, so the picker offers them alongside server results.
 */
function collectDocRequirements(
  editor: NodeViewProps["editor"],
  spaceId: string | null | undefined,
): PickerItem[] {
  const items: PickerItem[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "requirement" && node.attrs.key) {
      items.push({
        key: node.attrs.key,
        title: node.attrs.title ?? "",
        id: null,
        spaceId: spaceId ?? null,
      });
    }
    return true;
  });
  return items;
}

export function RequirementPicker({
  spaceId,
  localRequirements = [],
  onSelect,
  onCancel,
}: {
  spaceId: string | undefined;
  localRequirements?: PickerItem[];
  onSelect: (requirement: PickerItem) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 200);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useRequirementsQuery({
    spaceId,
    filter: debounced.trim() ? { text: debounced.trim() } : undefined,
    limit: 20,
  });
  const needle = debounced.trim().toLowerCase();
  const serverItems: PickerItem[] = (data?.items ?? []).filter(
    (r) => !r.isConflict,
  );
  const serverKeys = new Set(serverItems.map((r) => r.key));
  const localMatches = localRequirements.filter(
    (r) =>
      !serverKeys.has(r.key) &&
      (!needle ||
        r.key.toLowerCase().includes(needle) ||
        r.title.toLowerCase().includes(needle)),
  );
  const items = [...serverItems, ...localMatches];

  useEffect(() => {
    setActive(0);
  }, [debounced]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  return (
    <Stack gap={6}>
      <TextInput
        ref={inputRef}
        size="xs"
        placeholder={t("Search requirements by key or text")}
        value={query}
        rightSection={isFetching ? <Loader size={12} /> : null}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (items[active]) onSelect(items[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel?.();
          }
        }}
      />
      <ScrollArea.Autosize mah={260}>
        {items.length === 0 ? (
          <Text size="xs" c="dimmed" p="xs">
            {isFetching ? t("Searching...") : t("No requirements found")}
          </Text>
        ) : (
          items.map((req, index) => (
            <UnstyledButton
              key={req.key}
              className={clsx(
                classes.pickerItem,
                index === active && classes.pickerItemActive,
              )}
              onMouseEnter={() => setActive(index)}
              onClick={() => onSelect(req)}
            >
              <Group gap="xs" wrap="nowrap">
                <Badge variant="light" radius="sm" ff="monospace" size="sm">
                  {req.key}
                </Badge>
                <Text size="sm" truncate>
                  {req.title || t("Untitled")}
                </Text>
              </Group>
            </UnstyledButton>
          ))
        )}
      </ScrollArea.Autosize>
    </Stack>
  );
}
