import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  HoverCard,
  Loader,
  Popover,
  ScrollArea,
  Select,
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
  useBaselineItemQuery,
  useBaselinesQuery,
  useRequirementInfoQuery,
  useRequirementsQuery,
} from "@/features/requirement/queries/requirement-query";
import { usePageQuery } from "@/features/page/queries/page-query";
import { getEditorPageId } from "@/features/requirement/utils/editor-space";
import RequirementDetailDrawer from "@/features/requirement/components/requirement-detail-drawer";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { buildRequirementPath } from "@/features/requirement/utils/requirement-url";
import { getRequirementInfo } from "@/features/requirement/services/requirement-service";
import { getSpaceById } from "@/features/space/services/space-service";
import { buildPageUrl } from "@/features/page/page.utils";
import { IRequirement } from "@/features/requirement/types/requirement.types";

export default function RequirementRefView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor, getPos } = props;
  const { t } = useTranslation();
  const { key, requirementId, baselineId, baselineLabel } = node.attrs as {
    key: string;
    requirementId: string | null;
    spaceId: string | null;
    baselineId: string | null;
    baselineLabel: string | null;
  };
  const displayProperties = (node.attrs.displayProperties ?? []) as string[];

  const pageId = getEditorPageId(editor);
  const { data: page } = usePageQuery({ pageId });
  const spaceId = (node.attrs.spaceId as string | null) ?? page?.spaceId;

  const { data: refSpace } = useSpaceQuery(spaceId ?? "");
  const href =
    key && refSpace?.slug ? buildRequirementPath(refSpace.slug, key) : undefined;

  const [pickerOpened, setPickerOpened] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [configOpened, setConfigOpened] = useState(false);
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
    // shown properties update live, so fetch whenever some are chosen
    enabled:
      !!key &&
      (hovered || drawerOpened || configOpened || displayProperties.length > 0),
  });
  // a link to a baseline shows the requirement as it was then
  const { data: versioned, isError: versionMissing } = useBaselineItemQuery(
    baselineId,
    key,
  );
  const { data: baselines } = useBaselinesQuery(
    isEditable && configOpened ? (spaceId ?? undefined) : undefined,
  );
  const shownProperties: Record<string, string> =
    (baselineId ? versioned?.item.properties : info?.requirement.properties) ?? {};

  const toggleProperty = (name: string) =>
    updateAttributes({
      displayProperties: displayProperties.includes(name)
        ? displayProperties.filter((n) => n !== name)
        : [...displayProperties, name],
    });

  // the link becomes the requirement's definition, in a block of its own
  const transformToDefinition = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const { state, view } = editor;
    const $pos = state.doc.resolve(pos);
    const parent = $pos.parent;
    const requirement = state.schema.nodes.requirement.create(
      { key, title: "", properties: {} },
      state.schema.nodes.paragraph.create(),
    );
    const tr = state.tr;
    const onlyThisLink =
      parent.type.name === "paragraph" &&
      parent.textContent.replace(key, "").trim() === "" &&
      parent.childCount <= 2;
    if (onlyThisLink) {
      tr.replaceWith($pos.before(), $pos.after(), requirement);
    } else {
      tr.insert($pos.after(), requirement);
      tr.delete(pos, pos + node.nodeSize);
    }
    view.dispatch(tr);
    setConfigOpened(false);
  };

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

  const navigate = useNavigate();

  // a reference leads to its definition: open that page, scrolled to and
  // highlighting the requirement; fall back to the details panel
  const goToDefinition = async () => {
    try {
      const detail = await getRequirementInfo({ spaceId: spaceId ?? undefined, key });
      const target = detail.page;
      const targetSpace =
        target.spaceId === refSpace?.id ? refSpace : await getSpaceById(target.spaceId);
      const url = buildPageUrl(targetSpace.slug, target.slugId, target.title ?? undefined);
      navigate(`${url}?requirement=${encodeURIComponent(detail.requirement.key)}`);
    } catch {
      setDrawerOpened(true);
    }
  };

  const open = () => {
    if (!key && isEditable) setPickerOpened(true);
    // while editing, a click configures the link; when reading, it follows it
    else if (key && isEditable) setConfigOpened((o) => !o);
    else if (key) void goToDefinition();
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
      {baselineLabel && (
        <span className={classes.refVersion}> @ {baselineLabel}</span>
      )}
    </a>
  );

  // chosen properties of the target, next to the link
  const propertySuffix =
    displayProperties.length > 0 ? (
      <span className={classes.refProperties}>
        {" ("}
        {displayProperties
          .map((name) => `${name}: ${shownProperties[name] ?? "—"}`)
          .join(", ")}
        {")"}
      </span>
    ) : null;

  const configPanel = (
    <Stack gap="xs">
      <Group gap={4}>
        <Button size="compact-xs" variant="default" onClick={transformToDefinition}>
          {t("Transform to definition")}
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          onClick={() => {
            setConfigOpened(false);
            setDrawerOpened(true);
          }}
        >
          {t("View detail of {{key}}", { key })}
        </Button>
        <Select
          size="xs"
          w={170}
          allowDeselect={false}
          comboboxProps={{ withinPortal: false }}
          aria-label={t("Version")}
          value={baselineId ?? "current"}
          data={[
            { value: "current", label: t("Version: Current") },
            ...(baselines ?? []).map((b) => ({
              value: b.id,
              label: `${t("Version")}: BL-${b.version} · ${b.name}`,
            })),
          ]}
          onChange={(v) => {
            const b = (baselines ?? []).find((x) => x.id === v);
            updateAttributes({
              baselineId: b ? b.id : null,
              baselineLabel: b ? `BL-${b.version}` : null,
            });
          }}
        />
        <Button size="compact-xs" variant="default" color="red" onClick={() => deleteNode()}>
          {t("Remove")}
        </Button>
      </Group>
      {versionMissing && (
        <Text size="xs" c="red">
          {t("{{key}} is not in this baseline", { key })}
        </Text>
      )}
      <Text size="sm" fw={600}>
        {t("Properties:")}
      </Text>
      <Text size="xs" c="dimmed" mt={-6}>
        {t("Ticked properties are shown next to the link and stay up to date.")}
      </Text>
      {Object.keys(shownProperties).length === 0 ? (
        <Text size="xs" c="dimmed">
          {info || versioned ? t("This requirement has no properties.") : <Loader size="xs" />}
        </Text>
      ) : (
        <ScrollArea.Autosize mah={260}>
          <Stack gap={6}>
            {Object.entries(shownProperties).map(([name, value]) => (
              <Checkbox
                key={name}
                size="xs"
                checked={displayProperties.includes(name)}
                onChange={() => toggleProperty(name)}
                label={
                  <Text size="xs" lineClamp={3}>
                    <Text span fw={600} size="xs">
                      {name}:
                    </Text>{" "}
                    {value}
                  </Text>
                }
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Stack>
  );

  return (
    <NodeViewWrapper style={{ display: "inline" }} data-drag-handle>
      {key && isEditable ? (
        <>
          <Popover
            opened={configOpened}
            onChange={setConfigOpened}
            width={460}
            position="bottom-start"
            shadow="md"
            withinPortal
          >
            <Popover.Target>{chip}</Popover.Target>
            <Popover.Dropdown>{configPanel}</Popover.Dropdown>
          </Popover>
          {propertySuffix}
        </>
      ) : key && baselineId ? (
        <>
          <HoverCard width={320} shadow="md" openDelay={300} withinPortal>
            <HoverCard.Target>{chip}</HoverCard.Target>
            <HoverCard.Dropdown>
              {versionMissing ? (
                <Text size="sm" c="dimmed">
                  {t("{{key}} is not in this baseline", { key })}
                </Text>
              ) : !versioned ? (
                <Loader size="xs" />
              ) : (
                <Stack gap={4}>
                  <Group gap="xs">
                    <Badge variant="light" radius="sm" ff="monospace">
                      {versioned.item.key}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm">
                      BL-{versioned.baseline.version} · {versioned.baseline.name}
                    </Badge>
                  </Group>
                  <Text size="sm" fw={600}>
                    {versioned.item.title || t("Untitled")}
                  </Text>
                  {versioned.item.description && (
                    <Text size="xs" c="dimmed" lineClamp={5}>
                      {versioned.item.description}
                    </Text>
                  )}
                  <Button size="compact-xs" variant="light" onClick={() => void goToDefinition()}>
                    {t("Go to current definition")}
                  </Button>
                </Stack>
              )}
            </HoverCard.Dropdown>
          </HoverCard>
          {propertySuffix}
        </>
      ) : key ? (
        <>
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
                <Group gap="xs" mt={4}>
                  <Button size="compact-xs" variant="light" onClick={() => void goToDefinition()}>
                    {t("Go to definition")}
                  </Button>
                  <Button size="compact-xs" variant="default" onClick={() => setDrawerOpened(true)}>
                    {t("Details")}
                  </Button>
                </Group>
              </Stack>
            )}
          </HoverCard.Dropdown>
        </HoverCard>
        {propertySuffix}
        </>
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
