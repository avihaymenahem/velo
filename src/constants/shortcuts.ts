import type { TFunction } from "i18next";

export interface ShortcutItem {
  id: string;
  keys: string; // default key binding
  desc: string;
}

export interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

interface ShortcutDef {
  id: string;
  keys: string;
  descKey: string;
}

interface ShortcutCategoryDef {
  categoryKey: string;
  items: ShortcutDef[];
}

const SHORTCUT_DEFS: ShortcutCategoryDef[] = [
  { categoryKey: "shortcuts.navigation", items: [
    { id: "nav.next", keys: "j", descKey: "shortcuts.nextThread" },
    { id: "nav.prev", keys: "k", descKey: "shortcuts.previousThread" },
    { id: "nav.open", keys: "o", descKey: "shortcuts.openThread" },
    { id: "nav.msgNext", keys: "ArrowDown", descKey: "shortcuts.nextMessage" },
    { id: "nav.msgPrev", keys: "ArrowUp", descKey: "shortcuts.previousMessage" },
    { id: "nav.goInbox", keys: "g then i", descKey: "shortcuts.goToInbox" },
    { id: "nav.goStarred", keys: "g then s", descKey: "shortcuts.goToStarred" },
    { id: "nav.goSent", keys: "g then t", descKey: "shortcuts.goToSent" },
    { id: "nav.goDrafts", keys: "g then d", descKey: "shortcuts.goToDrafts" },
    { id: "nav.goPrimary", keys: "g then p", descKey: "shortcuts.goToPrimary" },
    { id: "nav.goUpdates", keys: "g then u", descKey: "shortcuts.goToUpdates" },
    { id: "nav.goPromotions", keys: "g then o", descKey: "shortcuts.goToPromotions" },
    { id: "nav.goSocial", keys: "g then c", descKey: "shortcuts.goToSocial" },
    { id: "nav.goNewsletters", keys: "g then n", descKey: "shortcuts.goToNewsletters" },
    { id: "nav.goTasks", keys: "g then k", descKey: "shortcuts.goToTasks" },
    { id: "nav.goAttachments", keys: "g then a", descKey: "shortcuts.goToAttachments" },
    { id: "nav.escape", keys: "Escape", descKey: "shortcuts.closeGoBack" },
  ]},
  { categoryKey: "shortcuts.actions", items: [
    { id: "action.compose", keys: "c", descKey: "shortcuts.composeNew" },
    { id: "action.reply", keys: "r", descKey: "shortcuts.reply" },
    { id: "action.replyAll", keys: "a", descKey: "shortcuts.replyAll" },
    { id: "action.forward", keys: "f", descKey: "shortcuts.forward" },
    { id: "action.archive", keys: "e", descKey: "shortcuts.archive" },
    { id: "action.delete", keys: "#", descKey: "shortcuts.deleteMail" },
    { id: "action.spam", keys: "!", descKey: "shortcuts.reportSpamNotSpam" },
    { id: "action.star", keys: "s", descKey: "shortcuts.starUnstar" },
    { id: "action.pin", keys: "p", descKey: "shortcuts.pinUnpin" },
    { id: "action.unsubscribe", keys: "u", descKey: "shortcuts.unsubscribe" },
    { id: "action.mute", keys: "m", descKey: "shortcuts.muteUnmute" },
    { id: "action.createTaskFromEmail", keys: "t", descKey: "shortcuts.createTaskAi" },
    { id: "action.moveToFolder", keys: "v", descKey: "shortcuts.moveToFolderLabel" },
    { id: "action.selectAll", keys: "Ctrl+A", descKey: "shortcuts.selectAll" },
    { id: "action.selectFromHere", keys: "Ctrl+Shift+A", descKey: "shortcuts.selectAllFromHere" },
  ]},
  { categoryKey: "shortcuts.app", items: [
    { id: "app.commandPalette", keys: "/", descKey: "shortcuts.commandPalette" },
    { id: "app.toggleSidebar", keys: "Ctrl+Shift+E", descKey: "shortcuts.toggleSidebar" },
    { id: "app.send", keys: "Ctrl+Enter", descKey: "shortcuts.sendEmail" },
    { id: "app.askInbox", keys: "i", descKey: "shortcuts.askAiInbox" },
    { id: "app.help", keys: "?", descKey: "shortcuts.showShortcuts" },
    { id: "app.syncFolder", keys: "F5", descKey: "shortcuts.syncFolder" },
  ]},
];

/**
 * Static SHORTCUTS array for backward compatibility (used by getDefaultKeyMap and tests).
 * Uses English fallback strings.
 */
export const SHORTCUTS: ShortcutCategory[] = SHORTCUT_DEFS.map((cat) => ({
  category: cat.categoryKey,
  items: cat.items.map((item) => ({
    id: item.id,
    keys: item.keys,
    desc: item.descKey,
  })),
}));

/**
 * Returns translated shortcuts using the provided i18next t function.
 */
export function getShortcuts(t: TFunction): ShortcutCategory[] {
  return SHORTCUT_DEFS.map((cat) => ({
    category: t(cat.categoryKey),
    items: cat.items.map((item) => ({
      id: item.id,
      keys: item.keys,
      desc: t(item.descKey),
    })),
  }));
}

/**
 * Build a flat map of shortcut ID -> default key binding.
 */
export function getDefaultKeyMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cat of SHORTCUT_DEFS) {
    for (const item of cat.items) {
      map[item.id] = item.keys;
    }
  }
  return map;
}
