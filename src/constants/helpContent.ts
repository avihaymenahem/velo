import type { LucideIcon } from "lucide-react";
import {
  Mail,
  PenLine,
  Search,
  Tag,
  Clock,
  Sparkles,
  Newspaper,
  Bell,
  Shield,
  Calendar,
  Palette,
  UserCircle,
  BookOpen,
  Eye,
  Layout,
  Undo2,
  CalendarClock,
  Archive,
  FileSignature,
  FileText,
  Users,
  Save,
  Keyboard,
  Command,
  FolderSearch,
  Filter,
  Zap,
  Star,
  Trash2,
  MousePointer,
  GripVertical,
  BellRing,
  MessageSquare,
  Wand2,
  Brain,
  MailQuestion,
  MailMinus,
  Monitor,
  Sun,
  Type,
  Columns2,
  Globe,
  Minimize2,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  ImageOff,
  LinkIcon,
  MailPlus,
  Server,
  WifiOff,
  CheckSquare,
  ListTodo,
  Repeat,
  PenSquare,
  Printer,
  Code,
  RefreshCw,
  ListFilter,
  Paperclip,
  Tags,
  FolderInput,
} from "lucide-react";

// ---------- Types ----------

export interface HelpTip {
  /** i18n key path (e.g. "cards.add-account.tips.0") — resolve with t() */
  text: string;
  shortcut?: string;
}

export interface HelpCard {
  id: string;
  icon: LucideIcon;
  /** i18n key path for title (e.g. "cards.add-account.title") */
  title: string;
  /** i18n key path for summary */
  summary: string;
  /** i18n key path for description */
  description: string;
  tips?: HelpTip[];
  relatedSettingsTab?: string;
}

export interface HelpCategory {
  id: string;
  /** i18n key path for label (e.g. "categories.getting-started") */
  label: string;
  icon: LucideIcon;
  cards: HelpCard[];
}

export interface ContextualTip {
  /** i18n key path for title */
  title: string;
  /** i18n key path for body */
  body: string;
  helpTopic: string;
}

// ---------- Valid settings tabs (for type-safe references) ----------

const VALID_SETTINGS_TABS = [
  "general", "notifications", "composing", "mail-rules", "people",
  "accounts", "shortcuts", "ai", "about",
] as const;

export type SettingsTabId = (typeof VALID_SETTINGS_TABS)[number];

// ---------- Helper to build card with i18n keys ----------

function card(
  id: string,
  icon: LucideIcon,
  tipCount: number,
  shortcuts: (string | undefined)[],
  relatedSettingsTab?: string,
): HelpCard {
  const tips: HelpTip[] = [];
  for (let i = 0; i < tipCount; i++) {
    tips.push({
      text: `cards.${id}.tips.${i}`,
      shortcut: shortcuts[i],
    });
  }
  return {
    id,
    icon,
    title: `cards.${id}.title`,
    summary: `cards.${id}.summary`,
    description: `cards.${id}.description`,
    tips,
    relatedSettingsTab,
  };
}

// ---------- Help Categories & Cards ----------

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    label: "categories.getting-started",
    icon: BookOpen,
    cards: [
      card("add-account", MailPlus, 4, [undefined, undefined, undefined, undefined], "accounts"),
      card("initial-sync", Clock, 5, [undefined, undefined, undefined, undefined, undefined], "accounts"),
      card("client-id-setup", Globe, 6, [undefined, undefined, undefined, undefined, undefined, undefined], "about"),
      card("imap-smtp-setup", Server, 8, [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined], "accounts"),
      card("outlook-setup", Server, 10, [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined], "accounts"),
    ],
  },
  {
    id: "reading-email",
    label: "categories.reading-email",
    icon: Eye,
    cards: [
      card("thread-view", Mail, 5, ["o", "j / k", "Escape", undefined, undefined]),
      card("reading-pane", Layout, 4, [undefined, undefined, undefined, undefined], "general"),
      card("mark-as-read", Eye, 3, [undefined, undefined, undefined], "general"),
      card("read-filter", ListFilter, 4, [undefined, undefined, undefined, undefined], "general"),
      card("print-export", Printer, 4, [undefined, undefined, undefined, undefined]),
      card("raw-message", Code, 4, [undefined, undefined, undefined, undefined]),
    ],
  },
  {
    id: "composing",
    label: "categories.composing",
    icon: PenLine,
    cards: [
      card("new-email", PenLine, 5, ["c", "Ctrl+Enter", undefined, undefined, undefined]),
      card("reply-forward", MessageSquare, 5, ["r", "a", "f", undefined, undefined], "composing"),
      card("undo-send", Undo2, 3, [undefined, undefined, undefined], "composing"),
      card("schedule-send", CalendarClock, 4, [undefined, undefined, undefined, undefined]),
      card("send-archive", Archive, 3, [undefined, undefined, undefined], "composing"),
      card("signatures", FileSignature, 4, [undefined, undefined, undefined, undefined], "composing"),
      card("templates", FileText, 4, [undefined, undefined, undefined, undefined], "composing"),
      card("from-aliases", Users, 5, [undefined, undefined, undefined, undefined, undefined], "accounts"),
      card("draft-autosave", Save, 4, [undefined, undefined, undefined, undefined]),
    ],
  },
  {
    id: "search-navigation",
    label: "categories.search-navigation",
    icon: Search,
    cards: [
      card("search-operators", Search, 8, [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined]),
      card("command-palette", Command, 5, ["Ctrl+K", "/", undefined, undefined, undefined]),
      card("keyboard-shortcuts", Keyboard, 9, ["?", undefined, undefined, undefined, undefined, "i", "F5", undefined, undefined], "shortcuts"),
    ],
  },
  {
    id: "organization",
    label: "categories.organization",
    icon: Tag,
    cards: [
      card("labels", Tag, 5, [undefined, undefined, undefined, undefined, undefined], "mail-rules"),
      card("smart-folders", FolderSearch, 5, [undefined, undefined, undefined, undefined, undefined], "mail-rules"),
      card("filters", Filter, 5, [undefined, undefined, undefined, undefined, undefined], "mail-rules"),
      card("smart-labels", Tags, 6, [undefined, undefined, undefined, undefined, undefined, undefined], "mail-rules"),
      card("quick-steps", Zap, 4, [undefined, undefined, undefined, undefined], "mail-rules"),
      card("star-pin-mute", Star, 6, ["s", "p", "m", undefined, undefined, undefined]),
      card("archive-trash", Trash2, 5, ["e", "#", undefined, undefined, undefined]),
      card("move-to-folder", FolderInput, 5, ["v", undefined, undefined, undefined, undefined]),
      card("multi-select", MousePointer, 6, ["Ctrl+A", "Ctrl+Shift+A", undefined, undefined, undefined, undefined]),
      card("bulk-actions", ListFilter, 4, [undefined, undefined, undefined, undefined]),
      card("attachment-library", Paperclip, 6, ["g a", undefined, undefined, undefined, undefined, undefined]),
      card("drag-drop", GripVertical, 4, [undefined, undefined, undefined, undefined]),
    ],
  },
  {
    id: "productivity",
    label: "categories.productivity",
    icon: Clock,
    cards: [
      card("snooze", Clock, 4, [undefined, undefined, undefined, undefined]),
      card("follow-up-reminders", BellRing, 4, [undefined, undefined, undefined, undefined]),
      card("split-inbox", Columns2, 5, [undefined, undefined, undefined, undefined, undefined], "general"),
      card("spam", AlertTriangle, 4, ["!", undefined, undefined, undefined]),
    ],
  },
  {
    id: "ai-features",
    label: "categories.ai-features",
    icon: Sparkles,
    cards: [
      card("ai-overview", Brain, 7, [undefined, undefined, undefined, undefined, undefined, undefined, undefined], "ai"),
      card("thread-summaries", FileText, 4, [undefined, undefined, undefined, undefined]),
      card("smart-replies", MessageSquare, 4, [undefined, undefined, undefined, undefined]),
      card("ai-compose", Wand2, 5, [undefined, undefined, undefined, undefined, undefined]),
      card("auto-drafts", PenSquare, 7, [undefined, undefined, undefined, undefined, undefined, undefined, undefined], "ai"),
      card("ask-inbox", MailQuestion, 5, [undefined, undefined, undefined, undefined, undefined]),
    ],
  },
  {
    id: "newsletters",
    label: "categories.newsletters",
    icon: Newspaper,
    cards: [
      card("newsletter-bundles", Newspaper, 4, [undefined, undefined, undefined, undefined], "people"),
      card("unsubscribe", MailMinus, 4, ["u", undefined, undefined, undefined], "people"),
    ],
  },
  {
    id: "notifications-contacts",
    label: "categories.notifications-contacts",
    icon: Bell,
    cards: [
      card("notifications-vip", Bell, 5, [undefined, undefined, undefined, undefined, undefined], "notifications"),
      card("contact-sidebar", Users, 5, [undefined, undefined, undefined, undefined, undefined], "people"),
    ],
  },
  {
    id: "security",
    label: "categories.security",
    icon: Shield,
    cards: [
      card("phishing-detection", AlertTriangle, 6, [undefined, undefined, undefined, undefined, undefined, undefined], "general"),
      card("auth-badges", CheckCircle, 5, [undefined, undefined, undefined, undefined, undefined]),
      card("remote-image-blocking", ImageOff, 5, [undefined, undefined, undefined, undefined, undefined], "general"),
      card("link-confirmation", LinkIcon, 4, [undefined, undefined, undefined, undefined]),
    ],
  },
  {
    id: "calendar",
    label: "categories.calendar",
    icon: Calendar,
    cards: [
      card("calendar-integration", Calendar, 6, [undefined, undefined, undefined, undefined, undefined, undefined]),
    ],
  },
  {
    id: "tasks",
    label: "categories.tasks",
    icon: CheckSquare,
    cards: [
      card("task-manager", ListTodo, 6, ["g k", undefined, undefined, undefined, undefined, undefined]),
      card("ai-task-extraction", Sparkles, 5, ["t", undefined, undefined, undefined, undefined], "ai"),
      card("task-sidebar", ListTodo, 4, [undefined, undefined, undefined, undefined]),
      card("recurring-tasks", Repeat, 4, [undefined, undefined, undefined, undefined]),
    ],
  },
  {
    id: "appearance",
    label: "categories.appearance",
    icon: Palette,
    cards: [
      card("theme", Sun, 4, [undefined, undefined, undefined, undefined], "general"),
      card("accent-colors", Palette, 4, [undefined, undefined, undefined, undefined], "general"),
      card("font-density", Type, 4, [undefined, undefined, undefined, undefined], "general"),
      card("layout-customization", Columns2, 4, ["Ctrl+Shift+E", undefined, undefined, undefined], "general"),
      card("sidebar-customization", Layout, 5, [undefined, undefined, undefined, undefined, undefined], "general"),
    ],
  },
  {
    id: "accounts-system",
    label: "categories.accounts-system",
    icon: UserCircle,
    cards: [
      card("multi-account", Users, 5, [undefined, undefined, undefined, undefined, undefined], "accounts"),
      card("system-tray", Minimize2, 5, [undefined, undefined, undefined, undefined, undefined], "general"),
      card("global-compose", Monitor, 4, [undefined, undefined, undefined, undefined], "shortcuts"),
      card("pop-out-windows", ExternalLink, 4, [undefined, undefined, undefined, undefined]),
      card("manual-sync", RefreshCw, 3, ["F5", undefined, undefined]),
      card("offline-mode", WifiOff, 4, [undefined, undefined, undefined, undefined], "accounts"),
    ],
  },
];

// ---------- Contextual Tips ----------

export const CONTEXTUAL_TIPS: Record<string, ContextualTip> = {
  "reading-pane": {
    title: "contextualTips.reading-pane.title",
    body: "contextualTips.reading-pane.body",
    helpTopic: "reading-email",
  },
  "split-inbox": {
    title: "contextualTips.split-inbox.title",
    body: "contextualTips.split-inbox.body",
    helpTopic: "productivity",
  },
  "undo-send": {
    title: "contextualTips.undo-send.title",
    body: "contextualTips.undo-send.body",
    helpTopic: "composing",
  },
  "smart-notifications": {
    title: "contextualTips.smart-notifications.title",
    body: "contextualTips.smart-notifications.body",
    helpTopic: "notifications-contacts",
  },
  "phishing-sensitivity": {
    title: "contextualTips.phishing-sensitivity.title",
    body: "contextualTips.phishing-sensitivity.body",
    helpTopic: "security",
  },
  "ai-provider": {
    title: "contextualTips.ai-provider.title",
    body: "contextualTips.ai-provider.body",
    helpTopic: "ai-features",
  },
  "search-operators": {
    title: "contextualTips.search-operators.title",
    body: "contextualTips.search-operators.body",
    helpTopic: "search-navigation",
  },
  "filters": {
    title: "contextualTips.filters.title",
    body: "contextualTips.filters.body",
    helpTopic: "organization",
  },
  "smart-labels": {
    title: "contextualTips.smart-labels.title",
    body: "contextualTips.smart-labels.body",
    helpTopic: "organization",
  },
};

// ---------- Helpers ----------

/** Get all cards across all categories (for search) */
export function getAllCards(): (HelpCard & { categoryId: string; categoryLabel: string })[] {
  return HELP_CATEGORIES.flatMap((cat) =>
    cat.cards.map((card) => ({
      ...card,
      categoryId: cat.id,
      categoryLabel: cat.label,
    })),
  );
}

/** Find a category by its ID */
export function getCategoryById(id: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((cat) => cat.id === id);
}
