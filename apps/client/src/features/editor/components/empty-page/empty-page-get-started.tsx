import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconTemplate } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { ErrorBoundary } from "react-error-boundary";
import {
  pageEditorAtom,
  titleEditorAtom,
  yjsSyncedAtom,
} from "@/features/editor/atoms/editor-atoms";
import { useHasFeature } from "@/features/edition/entitlements";
import { Feature } from "@/features/edition/features";
import { ITemplate } from "@/features/template/types.ts";
import { applyTemplateToPage } from "@/features/template/template.utils.ts";
import classes from "./empty-page-get-started.module.css";

const TemplatePickerModal = lazy(
  () => import("@/features/template/components/template-picker-modal.tsx"),
);

type EmptyPageGetStartedProps = {
  pageId: string;
  spaceId: string;
  editable: boolean;
};

export function EmptyPageGetStarted({
  spaceId,
  editable,
}: EmptyPageGetStartedProps) {
  const { t } = useTranslation();
  const editor = useAtomValue(pageEditorAtom);
  const titleEditor = useAtomValue(titleEditorAtom);
  const isSynced = useAtomValue(yjsSyncedAtom);
  const hasTemplates = useHasFeature(Feature.TEMPLATES);
  const [
    templatePickerOpened,
    { open: openTemplatePicker, close: closeTemplatePicker },
  ] = useDisclosure(false);

  const [isEmpty, setIsEmpty] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const sync = () => setIsEmpty(editor.isEmpty);
    sync();
    editor.on("update", sync);
    editor.on("create", sync);
    return () => {
      editor.off("update", sync);
      editor.off("create", sync);
    };
  }, [editor]);

  const handleUseTemplate = (template: ITemplate) => {
    if (!editor || editor.isDestroyed) return;
    if (!applyTemplateToPage(editor, titleEditor, template)) {
      notifications.show({
        message: t("This page is no longer empty"),
        color: "red",
      });
    }
  };

  const showChips = hasTemplates && editable && !!editor && isSynced && isEmpty;

  return (
    <>
      {showChips && (
        <div className={classes.wrapper} contentEditable={false}>
          <span className={classes.label}>{t("Get started with")}</span>
          <div className={classes.chipRow}>
            <Button
              variant="default"
              size="xs"
              radius="xl"
              leftSection={<IconTemplate size={16} />}
              onClick={openTemplatePicker}
            >
              {t("Template")}
            </Button>
          </div>
        </div>
      )}

      {templatePickerOpened && (
        <ErrorBoundary fallbackRender={() => null}>
          <Suspense fallback={null}>
            <TemplatePickerModal
              opened={templatePickerOpened}
              onClose={closeTemplatePicker}
              spaceId={spaceId}
              onUse={handleUseTemplate}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
