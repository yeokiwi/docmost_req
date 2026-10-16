import type { Editor } from "@tiptap/core";
import { getPageById } from "@/features/page/services/page-service";
import { IPage } from "@/features/page/types/page.types";

export function getEditorPageId(editor: Editor | null): string | undefined {
  // @ts-ignore - editor.storage.pageId is set by the host editor
  return editor?.storage?.pageId as string | undefined;
}

/**
 * Resolves the space of the page hosting the editor, from cache when possible.
 */
export async function resolveEditorSpaceId(
  editor: Editor,
): Promise<string | undefined> {
  const pageId = getEditorPageId(editor);
  if (!pageId) return undefined;

  // loaded lazily: importing main.tsx at module scope mounts the app
  const { queryClient } = await import("@/main.tsx");

  const cached = queryClient.getQueryData<IPage>(["pages", pageId]);
  if (cached?.spaceId) return cached.spaceId;

  const page = await queryClient.fetchQuery({
    queryKey: ["pages", pageId],
    queryFn: () => getPageById({ pageId }),
    staleTime: 5 * 60 * 1000,
  });
  return page?.spaceId;
}

export function formatRequirementCount(count: number | undefined): string {
  if (!count) return "0";
  return count > 999 ? "999+" : String(count);
}
