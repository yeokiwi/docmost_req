import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface RequirementRefOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface RequirementRefAttributes {
  requirementId?: string | null;
  key: string;
  spaceId?: string | null;
}

export type RequirementRefStorage = {
  autoOpen: boolean;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    requirementRef: {
      setRequirementRef: (attributes: RequirementRefAttributes) => ReturnType;
    };
  }

  interface Storage {
    requirementRef: RequirementRefStorage;
  }
}

export const RequirementRef = Node.create<
  RequirementRefOptions,
  RequirementRefStorage
>({
  name: "requirementRef",
  group: "inline",
  inline: true,
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
      requirementId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-requirement-id"),
        renderHTML: (attrs) =>
          attrs.requirementId
            ? { "data-requirement-id": attrs.requirementId }
            : {},
      },
      key: {
        default: "",
        parseHTML: (el) =>
          el.getAttribute("data-key") || el.textContent || "",
        renderHTML: (attrs) => ({ "data-key": attrs.key }),
      },
      spaceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-space-id"),
        renderHTML: (attrs) =>
          attrs.spaceId ? { "data-space-id": attrs.spaceId } : {},
      },
      // properties of the target shown next to the link in view mode
      displayProperties: {
        default: [],
        parseHTML: (el) => {
          try {
            const v = JSON.parse(el.getAttribute("data-display-properties") || "[]");
            return Array.isArray(v) ? v : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) =>
          attrs.displayProperties?.length
            ? { "data-display-properties": JSON.stringify(attrs.displayProperties) }
            : {},
      },
      // link to the requirement as captured in a baseline instead of its current version
      baselineId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-baseline-id"),
        renderHTML: (attrs) =>
          attrs.baselineId ? { "data-baseline-id": attrs.baselineId } : {},
      },
      baselineLabel: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-baseline-label"),
        renderHTML: (attrs) =>
          attrs.baselineLabel ? { "data-baseline-label": attrs.baselineLabel } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="requirement-ref"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      { "data-type": "requirement-ref", ...HTMLAttributes },
      node.attrs.key,
    ];
  },

  renderText({ node }) {
    return node.attrs.key;
  },

  addNodeView() {
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },

  addCommands() {
    return {
      setRequirementRef:
        (attributes) =>
        ({ commands }) => {
          // an empty key opens the picker in the node view
          this.storage.autoOpen = !attributes.key;
          return commands.insertContent([
            {
              type: this.name,
              attrs: {
                requirementId: attributes.requirementId ?? null,
                key: attributes.key,
                spaceId: attributes.spaceId ?? null,
              },
            },
            { type: "text", text: " " },
          ]);
        },
    };
  },
});
