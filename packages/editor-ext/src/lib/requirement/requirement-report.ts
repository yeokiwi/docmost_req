import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface RequirementReportOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export type RequirementCoverage = "any" | "covered" | "uncovered";

export interface RequirementReportFilter {
  text?: string;
  keyPrefix?: string;
  properties?: Record<string, string>;
  pageId?: string;
  coverage?: RequirementCoverage;
}

export interface RequirementReportAttributes {
  spaceId: string;
  filter?: RequirementReportFilter;
  columns?: string[];
  limit?: number;
}

export type RequirementReportStorage = {
  autoOpen: boolean;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    requirementReport: {
      setRequirementReport: (
        attributes: RequirementReportAttributes,
      ) => ReturnType;
    };
  }

  interface Storage {
    requirementReport: RequirementReportStorage;
  }
}

function parseJsonAttr<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

export const RequirementReport = Node.create<
  RequirementReportOptions,
  RequirementReportStorage
>({
  name: "requirementReport",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addStorage() {
    return {
      autoOpen: false,
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-id": attrs.id } : {}),
      },
      spaceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-space-id"),
        renderHTML: (attrs) =>
          attrs.spaceId ? { "data-space-id": attrs.spaceId } : {},
      },
      filter: {
        default: {},
        parseHTML: (el) => parseJsonAttr(el.getAttribute("data-filter"), {}),
        renderHTML: (attrs) => ({
          "data-filter": JSON.stringify(attrs.filter ?? {}),
        }),
      },
      columns: {
        default: [],
        parseHTML: (el) => parseJsonAttr(el.getAttribute("data-columns"), []),
        renderHTML: (attrs) => ({
          "data-columns": JSON.stringify(attrs.columns ?? []),
        }),
      },
      limit: {
        default: 50,
        parseHTML: (el) => Number(el.getAttribute("data-limit")) || 50,
        renderHTML: (attrs) => ({ "data-limit": String(attrs.limit ?? 50) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      // text keeps the atom visible to HTML/Markdown exporters
      "Requirements report",
    ];
  },

  addNodeView() {
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },

  addCommands() {
    return {
      setRequirementReport:
        (attributes) =>
        ({ commands }) => {
          this.storage.autoOpen = true;
          return commands.insertContent({
            type: this.name,
            attrs: {
              spaceId: attributes.spaceId,
              filter: attributes.filter ?? {},
              columns: attributes.columns ?? [],
              limit: attributes.limit ?? 50,
            },
          });
        },
    };
  },
});
