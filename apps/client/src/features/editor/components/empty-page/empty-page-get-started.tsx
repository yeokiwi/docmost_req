type EmptyPageGetStartedProps = {
  pageId: string;
  spaceId: string;
  editable: boolean;
};

// Placeholder for the "Get started with" chips shown on empty pages. The
// chips (bases, kanban, templates) belong to features that are not part of
// this edition yet, so nothing is rendered.
export function EmptyPageGetStarted(_props: EmptyPageGetStartedProps) {
  return null;
}
