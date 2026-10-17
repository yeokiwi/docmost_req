import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  ActionIcon,
  Alert,
  Card,
  LoadingOverlay,
  Modal,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile } from "@/features/page/services/page-service.ts";
import { useDisclosure } from "@mantine/hooks";
import { getDrawioUrl } from "@/lib/config.ts";
import {
  DrawIoEmbed,
  DrawIoEmbedRef,
  EventExit,
  EventExport,
  EventSave,
} from "react-drawio";
import { IAttachment } from "@/features/attachments/types/attachment.types";
import { decodeBase64ToSvgString, svgStringToFile } from "@/lib/utils";
import clsx from "clsx";
import { IconEdit } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { modals } from "@mantine/modals";

export default function DrawioView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, editor, selected } = props;
  const { attachmentId } = node.attrs;
  const drawioRef = useRef<DrawIoEmbedRef>(null);
  const [initialXML, setInitialXML] = useState<string>("");
  const [opened, { open, close }] = useDisclosure(false);
  const computedColorScheme = useComputedColorScheme();
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadedRef = useRef(false);

  const handleOpen = async () => {
    if (!editor.isEditable) {
      return;
    }
    isDirtyRef.current = false;
    loadedRef.current = false;
    setLoadFailed(false);
    open();
  };

  const saveData = async (svgXml: string, updateSrc = true) => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const svgString = decodeBase64ToSvgString(svgXml);
      const fileName = "diagram.drawio.svg";
      const drawioSVGFile = await svgStringToFile(svgString, fileName);

      //@ts-ignore
      const pageId = editor.storage?.pageId;

      let attachment: IAttachment = null;
      if (attachmentId) {
        attachment = await uploadFile(drawioSVGFile, pageId, attachmentId);
      } else {
        attachment = await uploadFile(drawioSVGFile, pageId);
      }

      if (updateSrc) {
        updateAttributes({
          src: `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`,
          title: attachment.fileName,
          size: attachment.fileSize,
          attachmentId: attachment.id,
        });
      } else {
        updateAttributes({
          attachmentId: attachment.id,
        });
      }

      isDirtyRef.current = false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    if (!isDirtyRef.current) {
      close();
      return;
    }

    modals.openConfirmModal({
      title: t("Unsaved changes"),
      children: (
        <Text size="sm">
          {t("You have unsaved changes that will be lost.")}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Discard"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        isDirtyRef.current = false;
        close();
      },
    });
  }, [close, t]);

  // the editor is served by an external site; when it can't be reached the
  // iframe stays blank, so tell the user what to check instead
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => {
      if (!loadedRef.current) setLoadFailed(true);
    }, 15_000);
    return () => clearTimeout(timer);
  }, [opened]);

  useEffect(() => {
    if (!opened) return;

    const interval = setInterval(() => {
      if (isDirtyRef.current && !isSavingRef.current && drawioRef.current) {
        drawioRef.current.exportDiagram({ format: "xmlsvg" });
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [opened]);

  useEffect(() => {
    if (!opened) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [opened, handleClose]);

  return (
    <NodeViewWrapper data-drag-handle>
      <Modal.Root
        opened={opened}
        onClose={handleClose}
        fullScreen
        closeOnEscape={false}
        aria-label={t("Diagram editor")}
      >
        <Modal.Overlay />
        <Modal.Content style={{ overflow: "hidden" }}>
          <Modal.Body pos="relative">
            <LoadingOverlay visible={isSaving} />
            {loadFailed && (
              <Alert
                color="red"
                pos="absolute"
                top={12}
                left="50%"
                style={{ transform: "translateX(-50%)", zIndex: 10 }}
                withCloseButton
                onClose={() => setLoadFailed(false)}
                title={t("The diagram editor could not be loaded")}
              >
                {t(
                  "Check that {{url}} is reachable from your browser. Administrators can host draw.io internally and set DRAWIO_URL.",
                  { url: getDrawioUrl() },
                )}
              </Alert>
            )}
            <div style={{ height: "100vh" }}>
              <DrawIoEmbed
                ref={drawioRef}
                xml={initialXML}
                baseUrl={getDrawioUrl()}
                autosave
                onLoad={() => {
                  loadedRef.current = true;
                  setLoadFailed(false);
                }}
                urlParameters={{
                  ui: computedColorScheme === "light" ? "kennedy" : "dark",
                  spin: true,
                  libraries: true,
                  saveAndExit: true,
                  noSaveBtn: true,
                }}
                onSave={(data: EventSave) => {
                  if (data.parentEvent !== "save") {
                    return;
                  }
                  saveData(data.xml, true).then(() => close()).catch(() => {});
                }}
                onClose={(data: EventExit) => {
                  if (data.parentEvent) {
                    return;
                  }
                  handleClose();
                }}
                onAutoSave={() => {
                  isDirtyRef.current = true;
                }}
                onExport={(data: EventExport) => {
                  saveData(data.data, false).catch(() => {});
                }}
              />
            </div>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      <Card
        radius="md"
        onClick={(e) => e.detail === 2 && handleOpen()}
        p="xs"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        withBorder
        className={clsx(selected ? "ProseMirror-selectednode" : "")}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <ActionIcon
            variant="transparent"
            color="gray"
            aria-label={t("Edit diagram")}
          >
            <IconEdit size={18} />
          </ActionIcon>

          <Text component="span" size="lg" c="dimmed">
            {t("Double-click to edit Draw.io diagram")}
          </Text>
        </div>
      </Card>
    </NodeViewWrapper>
  );
}
