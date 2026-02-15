export interface ShortcutItem {
  id: string;
  keys: string; // default key binding
  desc: string;
}

export interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

export const SHORTCUTS: ShortcutCategory[] = [
  { category: "Navigation", items: [
    { id: "nav.next", keys: "j", desc: "Next thread" },
    { id: "nav.prev", keys: "k", desc: "Previous thread" },
    { id: "nav.open", keys: "o", desc: "Open thread" },
    { id: "nav.goInbox", keys: "g then i", desc: "Go to Inbox" },
    { id: "nav.goStarred", keys: "g then s", desc: "Go to Starred" },
    { id: "nav.goSent", keys: "g then t", desc: "Go to Sent" },
    { id: "nav.goDrafts", keys: "g then d", desc: "Go to Drafts" },
    { id: "nav.goPrimary", keys: "g then p", desc: "Go to Primary" },
    { id: "nav.goUpdates", keys: "g then u", desc: "Go to Updates" },
    { id: "nav.goPromotions", keys: "g then o", desc: "Go to Promotions" },
    { id: "nav.goSocial", keys: "g then c", desc: "Go to Social" },
    { id: "nav.goNewsletters", keys: "g then n", desc: "Go to Newsletters" },
    { id: "nav.escape", keys: "Escape", desc: "Close / Go back" },
  ]},
  { category: "Actions", items: [
    { id: "action.compose", keys: "c", desc: "Compose new email" },
    { id: "action.reply", keys: "r", desc: "Reply" },
    { id: "action.replyAll", keys: "a", desc: "Reply All" },
    { id: "action.forward", keys: "f", desc: "Forward" },
    { id: "action.archive", keys: "e", desc: "Archive" },
    { id: "action.delete", keys: "#", desc: "Delete" },
    { id: "action.spam", keys: "!", desc: "Report Spam / Not Spam" },
    { id: "action.star", keys: "s", desc: "Star / Unstar" },
    { id: "action.pin", keys: "p", desc: "Pin / Unpin" },
    { id: "action.unsubscribe", keys: "u", desc: "Unsubscribe" },
    { id: "action.mute", keys: "m", desc: "Mute / Unmute" },
    { id: "action.selectAll", keys: "Ctrl+A", desc: "Select all" },
    { id: "action.selectFromHere", keys: "Ctrl+Shift+A", desc: "Select all from here" },
  ]},
  { category: "App", items: [
    { id: "app.commandPalette", keys: "/", desc: "Command palette" },
    { id: "app.toggleSidebar", keys: "Ctrl+Shift+E", desc: "Toggle sidebar" },
    { id: "app.send", keys: "Ctrl+Enter", desc: "Send email" },
    { id: "app.askInbox", keys: "i", desc: "Ask AI about your inbox" },
    { id: "app.help", keys: "?", desc: "Show keyboard shortcuts" },
  ]},
];

/**
 * Build a flat map of shortcut ID -> default key binding.
 */
export function getDefaultKeyMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cat of SHORTCUTS) {
    for (const item of cat.items) {
      map[item.id] = item.keys;
    }
  }
  return map;
}
