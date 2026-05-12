import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { useAccountStore } from "@/stores/accountStore";
import { getTemplatesForAccount, incrementTemplateUsage, type DbTemplate } from "@/services/db/templates";

const pluginKey = new PluginKey("template-slash");

export const TemplateSlashExtension = Extension.create({
  name: "templateSlash",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return { open: false, query: "", templates: [] as DbTemplate[], selectedIndex: 0 };
          },
          apply(tr, prev) {
            const meta = tr.getMeta(pluginKey);
            if (meta) return { ...prev, ...meta };
            return prev;
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = pluginKey.getState(view.state);
            if (!state) return false;

            if (state.open) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                const next = (state.selectedIndex + 1) % state.templates.length;
                view.dispatch(view.state.tr.setMeta(pluginKey, { selectedIndex: next }));
                return true;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                const prev = (state.selectedIndex - 1 + state.templates.length) % state.templates.length;
                view.dispatch(view.state.tr.setMeta(pluginKey, { selectedIndex: prev }));
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const tmpl = state.templates[state.selectedIndex];
                if (tmpl) {
                  insertTemplate(view, tmpl);
                  view.dispatch(view.state.tr.setMeta(pluginKey, { open: false, query: "", templates: [], selectedIndex: 0 }));
                }
                return true;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                view.dispatch(view.state.tr.setMeta(pluginKey, { open: false, query: "", templates: [], selectedIndex: 0 }));
                return true;
              }
            }

            if (event.key === "/") {
              setTimeout(async () => {
                const { from } = view.state.selection;
                const text = view.state.doc.textBetween(Math.max(0, from - 100), from);
                const slashMatch = text.match(/\/(\w*)$/);
                if (!slashMatch) {
                  view.dispatch(view.state.tr.setMeta(pluginKey, { open: false, query: "", templates: [], selectedIndex: 0 }));
                  return;
                }
                const query = slashMatch[1] ?? "";
                const accountId = useAccountStore.getState().activeAccountId;
                if (!accountId) return;
                const all = await getTemplatesForAccount(accountId);
                const filtered = all.filter(
                  (t) =>
                    t.name.toLowerCase().includes(query.toLowerCase()) ||
                    (t.subject ?? "").toLowerCase().includes(query.toLowerCase()),
                );
                view.dispatch(
                  view.state.tr.setMeta(pluginKey, {
                    open: filtered.length > 0,
                    query,
                    templates: filtered,
                    selectedIndex: 0,
                  }),
                );
              }, 50);
              return false;
            }

            return false;
          },
          decorations(state) {
            const ps = pluginKey.getState(state);
            if (!ps?.open) return null;
            return null;
          },
        },
      }),
    ];
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertTemplate(view: any, tmpl: DbTemplate) {
  const { from } = view.state.selection;
  const textBefore = view.state.doc.textBetween(Math.max(0, from - 100), from);
  const slashMatch = textBefore.match(/\/(\w*)$/);
  if (slashMatch) {
    const deleteFrom = from - slashMatch[0].length;
    const tr = view.state.tr.deleteRange(deleteFrom, from).insertText(tmpl.body_html);
    view.dispatch(tr);
    incrementTemplateUsage(tmpl.id).catch(() => {});
  }
}
