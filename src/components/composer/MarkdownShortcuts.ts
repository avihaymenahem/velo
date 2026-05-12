import { Extension, textblockTypeInputRule, wrappingInputRule, markInputRule } from "@tiptap/core";

export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addInputRules() {
    const { editor } = this;
    if (!editor) return [];
    const { schema } = editor;
    const rules: import("@tiptap/core").InputRule[] = [];

    rules.push(
      textblockTypeInputRule({
        find: /^(#{1,3})\s$/,
        type: schema.nodes.heading!,
        getAttributes: (match) => {
          const level = match[1]?.length ?? 1;
          return { level };
        },
      }),
    );

    rules.push(
      wrappingInputRule({
        find: /^\s*([-*])\s$/,
        type: schema.nodes.bulletList!,
      }),
    );

    rules.push(
      wrappingInputRule({
        find: /^(\d+)\.\s$/,
        type: schema.nodes.orderedList!,
        getAttributes: (match) => ({ start: Number(match[1]) }),
      }),
    );

    rules.push(
      wrappingInputRule({
        find: /^\s*>\s$/,
        type: schema.nodes.blockquote!,
      }),
    );

    if (schema.marks.bold) {
      rules.push(
        markInputRule({
          find: /\*\*([^*]+)\*\*$/,
          type: schema.marks.bold,
        }),
      );
    }

    if (schema.marks.italic) {
      rules.push(
        markInputRule({
          find: /(?:\*)([^*]+)(?:\*)$/,
          type: schema.marks.italic,
        }),
      );
    }

    if (schema.marks.code) {
      rules.push(
        markInputRule({
          find: /`([^`]+)`$/,
          type: schema.marks.code,
        }),
      );
    }

    return rules;
  },
});
