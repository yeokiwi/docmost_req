import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface RequirementPropertyOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

/**
 * Inline "property" marker, after Requirement Yogi's property macro:
 * - in a table heading, `name` renames the column's property or relationship,
 *   and the ignore flags drop the column from properties or dependencies;
 * - elsewhere, `name` + `value` add a property to the enclosing requirement,
 *   or to every requirement of the page when `wholeDocument` is set.
 */
export interface RequirementPropertyAttributes {
  name: string;
  value?: string;
  wholeDocument?: boolean;
  ignoreProperties?: boolean;
  ignoreDependencies?: boolean;
  // in a heading: the column holds the requirement's headline
  title?: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    requirementProperty: {
      setRequirementProperty: (
        attributes: RequirementPropertyAttributes,
      ) => ReturnType;
    };
  }
}

const boolAttr = (name: string) => ({
  default: false,
  parseHTML: (el: HTMLElement) => el.getAttribute(name) === "true",
  renderHTML: (attrs: Record<string, any>) => ({
    [name]: String(!!attrs[camel(name)]),
  }),
});

function camel(dataName: string): string {
  return dataName
    .replace(/^data-/, "")
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export const RequirementProperty = Node.create<RequirementPropertyOptions>({
  name: "requirementProperty",
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

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") || "",
        renderHTML: (attrs) => ({ "data-name": attrs.name }),
      },
      value: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-value") || "",
        renderHTML: (attrs) => ({ "data-value": attrs.value }),
      },
      wholeDocument: boolAttr("data-whole-document"),
      ignoreProperties: boolAttr("data-ignore-properties"),
      ignoreDependencies: boolAttr("data-ignore-dependencies"),
      title: boolAttr("data-title"),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="requirement-property"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = node.attrs.value
      ? `${node.attrs.name}: ${node.attrs.value}`
      : node.attrs.name;
    return [
      "span",
      { "data-type": "requirement-property", ...HTMLAttributes },
      label,
    ];
  },

  renderText() {
    // markers configure properties; they are not part of the text
    return "";
  },

  addNodeView() {
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },

  addCommands() {
    return {
      setRequirementProperty:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              name: attributes.name,
              value: attributes.value ?? "",
              wholeDocument: !!attributes.wholeDocument,
              ignoreProperties: !!attributes.ignoreProperties,
              ignoreDependencies: !!attributes.ignoreDependencies,
              title: !!attributes.title,
            },
          }),
    };
  },
});
