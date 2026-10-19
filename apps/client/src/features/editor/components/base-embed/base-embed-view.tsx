import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { ActionIcon, Box, Group, Menu, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconDots, IconTable, IconX } from "@tabler/icons-react";
import { usePageQuery } from "@/features/page/queries/page-query";
import classes from "./base-embed.module.css";

// Bases are not part of this edition. Existing embeds stay in the document
// (so no content is lost) and render as a placeholder that can be removed.
export function BaseEmbedView({ node, editor, deleteNode }: NodeViewProps) {
  const { t } = useTranslation();
  const pageId = node.attrs.pageId as string | null;
  const { data: page } = usePageQuery({ pageId: pageId ?? undefined });

  return (
    <NodeViewWrapper className={classes.handleGutter}>
      {editor.isEditable && (
        <div
          className={classes.controls}
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label={t("Base options")}
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconX size={14} />}
                onClick={() => deleteNode()}
              >
                {t("Remove from page")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      )}
      <Box p="md" bg="var(--mantine-color-default-hover)" style={{ borderRadius: 8 }}>
        <Group gap="xs">
          <IconTable size={16} />
          <Text c="dimmed" size="sm">
            {page?.title?.trim() || t("Untitled base")} —{" "}
            {t("Bases are not available in this edition")}
          </Text>
        </Group>
      </Box>
    </NodeViewWrapper>
  );
}
