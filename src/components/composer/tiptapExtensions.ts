import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontFamily: {
      setFontFamily: (fontFamily: string) => ReturnType;
    };
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
    };
  }
}

export const FontFamily = Extension.create({
  name: "fontFamily",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el: HTMLElement) =>
              el.style.fontFamily?.replace(/['"]/g, "") ?? null,
            renderHTML: (attrs: Record<string, unknown>) => {
              if (!attrs["fontFamily"]) return {};
              return { style: `font-family: ${attrs["fontFamily"]}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontFamily: (fontFamily: string) => ({ chain }: any) =>
        chain().setMark("textStyle", { fontFamily }).run(),
    };
  },
});

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, unknown>) => {
              if (!attrs["fontSize"]) return {};
              return { style: `font-size: ${attrs["fontSize"]}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontSize: (fontSize: string) => ({ chain }: any) =>
        chain().setMark("textStyle", { fontSize }).run(),
    };
  },
});
