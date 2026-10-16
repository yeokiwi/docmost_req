import { mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface RequirementOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export type RequirementProperties = Record<string, string>;

export interface RequirementAttributes {
  key: string;
  title?: string;
  properties?: RequirementProperties;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    requirement: {
      setRequirement: (attributes: RequirementAttributes) => ReturnType;
      updateRequirementKey: (key: string) => ReturnType;
    };
  }
}

export function parseRequirementProperties(
  value: string | null | undefined,
): RequirementProperties {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore malformed attribute
  }
  return {};
}

export const Requirement = Node.create<RequirementOptions>({
  name: "requirement",

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  content: "block+",
  group: "block",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-id": attrs.id } : {}),
      },
      key: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-key") || "",
        renderHTML: (attrs) => ({ "data-key": attrs.key }),
      },
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") || "",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      properties: {
        default: {},
        parseHTML: (el) =>
          parseRequirementProperties(el.getAttribute("data-properties")),
        renderHTML: (attrs) => ({
          "data-properties": JSON.stringify(attrs.properties ?? {}),
        }),
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
      0,
    ];
  },

  addCommands() {
    return {
      setRequirement:
        (attributes) =>
        ({ state, chain }) => {
          const node = {
            type: this.name,
            attrs: {
              key: attributes.key,
              title: attributes.title ?? "",
              properties: attributes.properties ?? {},
            },
            content: [{ type: "paragraph" }],
          };

          // requirements don't nest: inside one, insert after it instead
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === this.name) {
              return chain().insertContentAt($from.after(depth), node).run();
            }
          }

          return chain().insertContent(node).run();
        },

      updateRequirementKey:
        (key: string) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { key }),
    };
  },

  addNodeView() {
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },

  addKeyboardShortcuts() {
    return {
      // Delete an empty requirement on Backspace; isolating blocks joining.
      Backspace: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const { $from } = selection;
        if ($from.parentOffset !== 0) return false;

        const depth = $from.depth - 1;
        if (depth < 0) return false;

        const node = $from.node(depth);
        if (
          node.type === this.type &&
          node.childCount === 1 &&
          node.firstChild?.content.size === 0
        ) {
          const pos = $from.before(depth);
          const { tr } = state;
          tr.delete(pos, pos + node.nodeSize);
          tr.setSelection(TextSelection.near(tr.doc.resolve(pos), -1));
          view.dispatch(tr);
          return true;
        }
        return false;
      },
    };
  },
});
