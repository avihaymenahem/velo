import type { TFunction } from "i18next";
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
  text: string;
  shortcut?: string;
}

export interface HelpCard {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  description: string;
  tips?: HelpTip[];
  relatedSettingsTab?: string;
}

export interface HelpCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  cards: HelpCard[];
}

export interface ContextualTip {
  title: string;
  body: string;
  helpTopic: string;
}

// ---------- Valid settings tabs (for type-safe references) ----------

const VALID_SETTINGS_TABS = [
  "general", "notifications", "composing", "mail-rules", "people",
  "accounts", "shortcuts", "ai", "about",
] as const;

export type SettingsTabId = (typeof VALID_SETTINGS_TABS)[number];

// ---------- Internal helpers ----------

/** Build tips array from numbered i18n keys */
function tips(t: TFunction, prefix: string, count: number, shortcuts?: Record<number, string>): HelpTip[] {
  const result: HelpTip[] = [];
  for (let i = 0; i < count; i++) {
    const tip: HelpTip = { text: t(`${prefix}.${i}`) };
    if (shortcuts && i in shortcuts) {
      tip.shortcut = shortcuts[i];
    }
    result.push(tip);
  }
  return result;
}

// ---------- Help Categories & Cards ----------

export function getHelpCategories(t: TFunction): HelpCategory[] {
  const c = "help.content";
  return [
    {
      id: "getting-started",
      label: t(`${c}.gettingStarted.label`),
      icon: BookOpen,
      cards: [
        {
          id: "add-account",
          icon: MailPlus,
          title: t(`${c}.gettingStarted.cards.addAccount.title`),
          summary: t(`${c}.gettingStarted.cards.addAccount.summary`),
          description: t(`${c}.gettingStarted.cards.addAccount.description`),
          tips: tips(t, `${c}.gettingStarted.cards.addAccount.tips`, 4),
          relatedSettingsTab: "accounts",
        },
        {
          id: "initial-sync",
          icon: Clock,
          title: t(`${c}.gettingStarted.cards.initialSync.title`),
          summary: t(`${c}.gettingStarted.cards.initialSync.summary`),
          description: t(`${c}.gettingStarted.cards.initialSync.description`),
          tips: tips(t, `${c}.gettingStarted.cards.initialSync.tips`, 5),
          relatedSettingsTab: "accounts",
        },
        {
          id: "client-id-setup",
          icon: Globe,
          title: t(`${c}.gettingStarted.cards.clientIdSetup.title`),
          summary: t(`${c}.gettingStarted.cards.clientIdSetup.summary`),
          description: t(`${c}.gettingStarted.cards.clientIdSetup.description`),
          tips: tips(t, `${c}.gettingStarted.cards.clientIdSetup.tips`, 6),
          relatedSettingsTab: "about",
        },
        {
          id: "imap-smtp-setup",
          icon: Server,
          title: t(`${c}.gettingStarted.cards.imapSmtpSetup.title`),
          summary: t(`${c}.gettingStarted.cards.imapSmtpSetup.summary`),
          description: t(`${c}.gettingStarted.cards.imapSmtpSetup.description`),
          tips: tips(t, `${c}.gettingStarted.cards.imapSmtpSetup.tips`, 8),
          relatedSettingsTab: "accounts",
        },
        {
          id: "outlook-setup",
          icon: Server,
          title: t(`${c}.gettingStarted.cards.outlookSetup.title`),
          summary: t(`${c}.gettingStarted.cards.outlookSetup.summary`),
          description: t(`${c}.gettingStarted.cards.outlookSetup.description`),
          tips: tips(t, `${c}.gettingStarted.cards.outlookSetup.tips`, 10),
          relatedSettingsTab: "accounts",
        },
      ],
    },
    {
      id: "reading-email",
      label: t(`${c}.readingEmail.label`),
      icon: Eye,
      cards: [
        {
          id: "thread-view",
          icon: Mail,
          title: t(`${c}.readingEmail.cards.threadView.title`),
          summary: t(`${c}.readingEmail.cards.threadView.summary`),
          description: t(`${c}.readingEmail.cards.threadView.description`),
          tips: tips(t, `${c}.readingEmail.cards.threadView.tips`, 5, { 0: "o", 1: "j / k", 2: "Escape" }),
        },
        {
          id: "reading-pane",
          icon: Layout,
          title: t(`${c}.readingEmail.cards.readingPane.title`),
          summary: t(`${c}.readingEmail.cards.readingPane.summary`),
          description: t(`${c}.readingEmail.cards.readingPane.description`),
          tips: tips(t, `${c}.readingEmail.cards.readingPane.tips`, 4),
          relatedSettingsTab: "general",
        },
        {
          id: "mark-as-read",
          icon: Eye,
          title: t(`${c}.readingEmail.cards.markAsRead.title`),
          summary: t(`${c}.readingEmail.cards.markAsRead.summary`),
          description: t(`${c}.readingEmail.cards.markAsRead.description`),
          tips: tips(t, `${c}.readingEmail.cards.markAsRead.tips`, 3),
          relatedSettingsTab: "general",
        },
        {
          id: "read-filter",
          icon: ListFilter,
          title: t(`${c}.readingEmail.cards.readFilter.title`),
          summary: t(`${c}.readingEmail.cards.readFilter.summary`),
          description: t(`${c}.readingEmail.cards.readFilter.description`),
          tips: tips(t, `${c}.readingEmail.cards.readFilter.tips`, 4),
          relatedSettingsTab: "general",
        },
        {
          id: "print-export",
          icon: Printer,
          title: t(`${c}.readingEmail.cards.printExport.title`),
          summary: t(`${c}.readingEmail.cards.printExport.summary`),
          description: t(`${c}.readingEmail.cards.printExport.description`),
          tips: tips(t, `${c}.readingEmail.cards.printExport.tips`, 4),
        },
        {
          id: "raw-message",
          icon: Code,
          title: t(`${c}.readingEmail.cards.rawMessage.title`),
          summary: t(`${c}.readingEmail.cards.rawMessage.summary`),
          description: t(`${c}.readingEmail.cards.rawMessage.description`),
          tips: tips(t, `${c}.readingEmail.cards.rawMessage.tips`, 4),
        },
      ],
    },
    {
      id: "composing",
      label: t(`${c}.composing.label`),
      icon: PenLine,
      cards: [
        {
          id: "new-email",
          icon: PenLine,
          title: t(`${c}.composing.cards.newEmail.title`),
          summary: t(`${c}.composing.cards.newEmail.summary`),
          description: t(`${c}.composing.cards.newEmail.description`),
          tips: tips(t, `${c}.composing.cards.newEmail.tips`, 5, { 0: "c", 1: "Ctrl+Enter" }),
        },
        {
          id: "reply-forward",
          icon: MessageSquare,
          title: t(`${c}.composing.cards.replyForward.title`),
          summary: t(`${c}.composing.cards.replyForward.summary`),
          description: t(`${c}.composing.cards.replyForward.description`),
          tips: tips(t, `${c}.composing.cards.replyForward.tips`, 5, { 0: "r", 1: "a", 2: "f" }),
          relatedSettingsTab: "composing",
        },
        {
          id: "undo-send",
          icon: Undo2,
          title: t(`${c}.composing.cards.undoSend.title`),
          summary: t(`${c}.composing.cards.undoSend.summary`),
          description: t(`${c}.composing.cards.undoSend.description`),
          tips: tips(t, `${c}.composing.cards.undoSend.tips`, 3),
          relatedSettingsTab: "composing",
        },
        {
          id: "schedule-send",
          icon: CalendarClock,
          title: t(`${c}.composing.cards.scheduleSend.title`),
          summary: t(`${c}.composing.cards.scheduleSend.summary`),
          description: t(`${c}.composing.cards.scheduleSend.description`),
          tips: tips(t, `${c}.composing.cards.scheduleSend.tips`, 4),
        },
        {
          id: "send-archive",
          icon: Archive,
          title: t(`${c}.composing.cards.sendArchive.title`),
          summary: t(`${c}.composing.cards.sendArchive.summary`),
          description: t(`${c}.composing.cards.sendArchive.description`),
          tips: tips(t, `${c}.composing.cards.sendArchive.tips`, 3),
          relatedSettingsTab: "composing",
        },
        {
          id: "signatures",
          icon: FileSignature,
          title: t(`${c}.composing.cards.signatures.title`),
          summary: t(`${c}.composing.cards.signatures.summary`),
          description: t(`${c}.composing.cards.signatures.description`),
          tips: tips(t, `${c}.composing.cards.signatures.tips`, 4),
          relatedSettingsTab: "composing",
        },
        {
          id: "templates",
          icon: FileText,
          title: t(`${c}.composing.cards.templates.title`),
          summary: t(`${c}.composing.cards.templates.summary`),
          description: t(`${c}.composing.cards.templates.description`),
          tips: tips(t, `${c}.composing.cards.templates.tips`, 4),
          relatedSettingsTab: "composing",
        },
        {
          id: "from-aliases",
          icon: Users,
          title: t(`${c}.composing.cards.fromAliases.title`),
          summary: t(`${c}.composing.cards.fromAliases.summary`),
          description: t(`${c}.composing.cards.fromAliases.description`),
          tips: tips(t, `${c}.composing.cards.fromAliases.tips`, 5),
          relatedSettingsTab: "accounts",
        },
        {
          id: "draft-autosave",
          icon: Save,
          title: t(`${c}.composing.cards.draftAutosave.title`),
          summary: t(`${c}.composing.cards.draftAutosave.summary`),
          description: t(`${c}.composing.cards.draftAutosave.description`),
          tips: tips(t, `${c}.composing.cards.draftAutosave.tips`, 4),
        },
      ],
    },
    {
      id: "search-navigation",
      label: t(`${c}.searchNavigation.label`),
      icon: Search,
      cards: [
        {
          id: "search-operators",
          icon: Search,
          title: t(`${c}.searchNavigation.cards.searchOperators.title`),
          summary: t(`${c}.searchNavigation.cards.searchOperators.summary`),
          description: t(`${c}.searchNavigation.cards.searchOperators.description`),
          tips: tips(t, `${c}.searchNavigation.cards.searchOperators.tips`, 8),
        },
        {
          id: "command-palette",
          icon: Command,
          title: t(`${c}.searchNavigation.cards.commandPalette.title`),
          summary: t(`${c}.searchNavigation.cards.commandPalette.summary`),
          description: t(`${c}.searchNavigation.cards.commandPalette.description`),
          tips: tips(t, `${c}.searchNavigation.cards.commandPalette.tips`, 5, { 0: "Ctrl+K", 1: "/" }),
        },
        {
          id: "keyboard-shortcuts",
          icon: Keyboard,
          title: t(`${c}.searchNavigation.cards.keyboardShortcuts.title`),
          summary: t(`${c}.searchNavigation.cards.keyboardShortcuts.summary`),
          description: t(`${c}.searchNavigation.cards.keyboardShortcuts.description`),
          tips: tips(t, `${c}.searchNavigation.cards.keyboardShortcuts.tips`, 9, { 0: "?", 5: "i", 6: "F5" }),
          relatedSettingsTab: "shortcuts",
        },
      ],
    },
    {
      id: "organization",
      label: t(`${c}.organization.label`),
      icon: Tag,
      cards: [
        {
          id: "labels",
          icon: Tag,
          title: t(`${c}.organization.cards.labels.title`),
          summary: t(`${c}.organization.cards.labels.summary`),
          description: t(`${c}.organization.cards.labels.description`),
          tips: tips(t, `${c}.organization.cards.labels.tips`, 5),
          relatedSettingsTab: "mail-rules",
        },
        {
          id: "smart-folders",
          icon: FolderSearch,
          title: t(`${c}.organization.cards.smartFolders.title`),
          summary: t(`${c}.organization.cards.smartFolders.summary`),
          description: t(`${c}.organization.cards.smartFolders.description`),
          tips: tips(t, `${c}.organization.cards.smartFolders.tips`, 5),
          relatedSettingsTab: "mail-rules",
        },
        {
          id: "filters",
          icon: Filter,
          title: t(`${c}.organization.cards.filters.title`),
          summary: t(`${c}.organization.cards.filters.summary`),
          description: t(`${c}.organization.cards.filters.description`),
          tips: tips(t, `${c}.organization.cards.filters.tips`, 5),
          relatedSettingsTab: "mail-rules",
        },
        {
          id: "smart-labels",
          icon: Tags,
          title: t(`${c}.organization.cards.smartLabels.title`),
          summary: t(`${c}.organization.cards.smartLabels.summary`),
          description: t(`${c}.organization.cards.smartLabels.description`),
          tips: tips(t, `${c}.organization.cards.smartLabels.tips`, 6),
          relatedSettingsTab: "mail-rules",
        },
        {
          id: "quick-steps",
          icon: Zap,
          title: t(`${c}.organization.cards.quickSteps.title`),
          summary: t(`${c}.organization.cards.quickSteps.summary`),
          description: t(`${c}.organization.cards.quickSteps.description`),
          tips: tips(t, `${c}.organization.cards.quickSteps.tips`, 4),
          relatedSettingsTab: "mail-rules",
        },
        {
          id: "star-pin-mute",
          icon: Star,
          title: t(`${c}.organization.cards.starPinMute.title`),
          summary: t(`${c}.organization.cards.starPinMute.summary`),
          description: t(`${c}.organization.cards.starPinMute.description`),
          tips: tips(t, `${c}.organization.cards.starPinMute.tips`, 6, { 0: "s", 1: "p", 2: "m" }),
        },
        {
          id: "archive-trash",
          icon: Trash2,
          title: t(`${c}.organization.cards.archiveTrash.title`),
          summary: t(`${c}.organization.cards.archiveTrash.summary`),
          description: t(`${c}.organization.cards.archiveTrash.description`),
          tips: tips(t, `${c}.organization.cards.archiveTrash.tips`, 5, { 0: "e", 1: "#" }),
        },
        {
          id: "move-to-folder",
          icon: FolderInput,
          title: t(`${c}.organization.cards.moveToFolder.title`),
          summary: t(`${c}.organization.cards.moveToFolder.summary`),
          description: t(`${c}.organization.cards.moveToFolder.description`),
          tips: tips(t, `${c}.organization.cards.moveToFolder.tips`, 5, { 0: "v" }),
        },
        {
          id: "multi-select",
          icon: MousePointer,
          title: t(`${c}.organization.cards.multiSelect.title`),
          summary: t(`${c}.organization.cards.multiSelect.summary`),
          description: t(`${c}.organization.cards.multiSelect.description`),
          tips: tips(t, `${c}.organization.cards.multiSelect.tips`, 6, { 0: "Ctrl+A", 1: "Ctrl+Shift+A" }),
        },
        {
          id: "bulk-actions",
          icon: ListFilter,
          title: t(`${c}.organization.cards.bulkActions.title`),
          summary: t(`${c}.organization.cards.bulkActions.summary`),
          description: t(`${c}.organization.cards.bulkActions.description`),
          tips: tips(t, `${c}.organization.cards.bulkActions.tips`, 4),
        },
        {
          id: "attachment-library",
          icon: Paperclip,
          title: t(`${c}.organization.cards.attachmentLibrary.title`),
          summary: t(`${c}.organization.cards.attachmentLibrary.summary`),
          description: t(`${c}.organization.cards.attachmentLibrary.description`),
          tips: tips(t, `${c}.organization.cards.attachmentLibrary.tips`, 6, { 0: "g a" }),
        },
        {
          id: "drag-drop",
          icon: GripVertical,
          title: t(`${c}.organization.cards.dragDrop.title`),
          summary: t(`${c}.organization.cards.dragDrop.summary`),
          description: t(`${c}.organization.cards.dragDrop.description`),
          tips: tips(t, `${c}.organization.cards.dragDrop.tips`, 4),
        },
      ],
    },
    {
      id: "productivity",
      label: t(`${c}.productivity.label`),
      icon: Clock,
      cards: [
        {
          id: "snooze",
          icon: Clock,
          title: t(`${c}.productivity.cards.snooze.title`),
          summary: t(`${c}.productivity.cards.snooze.summary`),
          description: t(`${c}.productivity.cards.snooze.description`),
          tips: tips(t, `${c}.productivity.cards.snooze.tips`, 4),
        },
        {
          id: "follow-up-reminders",
          icon: BellRing,
          title: t(`${c}.productivity.cards.followUpReminders.title`),
          summary: t(`${c}.productivity.cards.followUpReminders.summary`),
          description: t(`${c}.productivity.cards.followUpReminders.description`),
          tips: tips(t, `${c}.productivity.cards.followUpReminders.tips`, 4),
        },
        {
          id: "split-inbox",
          icon: Columns2,
          title: t(`${c}.productivity.cards.splitInbox.title`),
          summary: t(`${c}.productivity.cards.splitInbox.summary`),
          description: t(`${c}.productivity.cards.splitInbox.description`),
          tips: tips(t, `${c}.productivity.cards.splitInbox.tips`, 5),
          relatedSettingsTab: "general",
        },
        {
          id: "spam",
          icon: AlertTriangle,
          title: t(`${c}.productivity.cards.spam.title`),
          summary: t(`${c}.productivity.cards.spam.summary`),
          description: t(`${c}.productivity.cards.spam.description`),
          tips: tips(t, `${c}.productivity.cards.spam.tips`, 4, { 0: "!" }),
        },
      ],
    },
    {
      id: "ai-features",
      label: t(`${c}.aiFeatures.label`),
      icon: Sparkles,
      cards: [
        {
          id: "ai-overview",
          icon: Brain,
          title: t(`${c}.aiFeatures.cards.aiOverview.title`),
          summary: t(`${c}.aiFeatures.cards.aiOverview.summary`),
          description: t(`${c}.aiFeatures.cards.aiOverview.description`),
          tips: tips(t, `${c}.aiFeatures.cards.aiOverview.tips`, 7),
          relatedSettingsTab: "ai",
        },
        {
          id: "thread-summaries",
          icon: FileText,
          title: t(`${c}.aiFeatures.cards.threadSummaries.title`),
          summary: t(`${c}.aiFeatures.cards.threadSummaries.summary`),
          description: t(`${c}.aiFeatures.cards.threadSummaries.description`),
          tips: tips(t, `${c}.aiFeatures.cards.threadSummaries.tips`, 4),
        },
        {
          id: "smart-replies",
          icon: MessageSquare,
          title: t(`${c}.aiFeatures.cards.smartReplies.title`),
          summary: t(`${c}.aiFeatures.cards.smartReplies.summary`),
          description: t(`${c}.aiFeatures.cards.smartReplies.description`),
          tips: tips(t, `${c}.aiFeatures.cards.smartReplies.tips`, 4),
        },
        {
          id: "ai-compose",
          icon: Wand2,
          title: t(`${c}.aiFeatures.cards.aiCompose.title`),
          summary: t(`${c}.aiFeatures.cards.aiCompose.summary`),
          description: t(`${c}.aiFeatures.cards.aiCompose.description`),
          tips: tips(t, `${c}.aiFeatures.cards.aiCompose.tips`, 5),
        },
        {
          id: "auto-drafts",
          icon: PenSquare,
          title: t(`${c}.aiFeatures.cards.autoDrafts.title`),
          summary: t(`${c}.aiFeatures.cards.autoDrafts.summary`),
          description: t(`${c}.aiFeatures.cards.autoDrafts.description`),
          tips: tips(t, `${c}.aiFeatures.cards.autoDrafts.tips`, 7),
          relatedSettingsTab: "ai",
        },
        {
          id: "ask-inbox",
          icon: MailQuestion,
          title: t(`${c}.aiFeatures.cards.askInbox.title`),
          summary: t(`${c}.aiFeatures.cards.askInbox.summary`),
          description: t(`${c}.aiFeatures.cards.askInbox.description`),
          tips: tips(t, `${c}.aiFeatures.cards.askInbox.tips`, 5),
        },
      ],
    },
    {
      id: "newsletters",
      label: t(`${c}.newsletters.label`),
      icon: Newspaper,
      cards: [
        {
          id: "newsletter-bundles",
          icon: Newspaper,
          title: t(`${c}.newsletters.cards.newsletterBundles.title`),
          summary: t(`${c}.newsletters.cards.newsletterBundles.summary`),
          description: t(`${c}.newsletters.cards.newsletterBundles.description`),
          tips: tips(t, `${c}.newsletters.cards.newsletterBundles.tips`, 4),
          relatedSettingsTab: "people",
        },
        {
          id: "unsubscribe",
          icon: MailMinus,
          title: t(`${c}.newsletters.cards.unsubscribe.title`),
          summary: t(`${c}.newsletters.cards.unsubscribe.summary`),
          description: t(`${c}.newsletters.cards.unsubscribe.description`),
          tips: tips(t, `${c}.newsletters.cards.unsubscribe.tips`, 4, { 0: "u" }),
          relatedSettingsTab: "people",
        },
      ],
    },
    {
      id: "notifications-contacts",
      label: t(`${c}.notificationsContacts.label`),
      icon: Bell,
      cards: [
        {
          id: "notifications-vip",
          icon: Bell,
          title: t(`${c}.notificationsContacts.cards.notificationsVip.title`),
          summary: t(`${c}.notificationsContacts.cards.notificationsVip.summary`),
          description: t(`${c}.notificationsContacts.cards.notificationsVip.description`),
          tips: tips(t, `${c}.notificationsContacts.cards.notificationsVip.tips`, 5),
          relatedSettingsTab: "notifications",
        },
        {
          id: "contact-sidebar",
          icon: Users,
          title: t(`${c}.notificationsContacts.cards.contactSidebar.title`),
          summary: t(`${c}.notificationsContacts.cards.contactSidebar.summary`),
          description: t(`${c}.notificationsContacts.cards.contactSidebar.description`),
          tips: tips(t, `${c}.notificationsContacts.cards.contactSidebar.tips`, 5),
          relatedSettingsTab: "people",
        },
      ],
    },
    {
      id: "security",
      label: t(`${c}.security.label`),
      icon: Shield,
      cards: [
        {
          id: "phishing-detection",
          icon: AlertTriangle,
          title: t(`${c}.security.cards.phishingDetection.title`),
          summary: t(`${c}.security.cards.phishingDetection.summary`),
          description: t(`${c}.security.cards.phishingDetection.description`),
          tips: tips(t, `${c}.security.cards.phishingDetection.tips`, 6),
          relatedSettingsTab: "general",
        },
        {
          id: "auth-badges",
          icon: CheckCircle,
          title: t(`${c}.security.cards.authBadges.title`),
          summary: t(`${c}.security.cards.authBadges.summary`),
          description: t(`${c}.security.cards.authBadges.description`),
          tips: tips(t, `${c}.security.cards.authBadges.tips`, 5),
        },
        {
          id: "remote-image-blocking",
          icon: ImageOff,
          title: t(`${c}.security.cards.remoteImageBlocking.title`),
          summary: t(`${c}.security.cards.remoteImageBlocking.summary`),
          description: t(`${c}.security.cards.remoteImageBlocking.description`),
          tips: tips(t, `${c}.security.cards.remoteImageBlocking.tips`, 5),
          relatedSettingsTab: "general",
        },
        {
          id: "link-confirmation",
          icon: LinkIcon,
          title: t(`${c}.security.cards.linkConfirmation.title`),
          summary: t(`${c}.security.cards.linkConfirmation.summary`),
          description: t(`${c}.security.cards.linkConfirmation.description`),
          tips: tips(t, `${c}.security.cards.linkConfirmation.tips`, 4),
        },
      ],
    },
    {
      id: "calendar",
      label: t(`${c}.calendar.label`),
      icon: Calendar,
      cards: [
        {
          id: "calendar-integration",
          icon: Calendar,
          title: t(`${c}.calendar.cards.calendarIntegration.title`),
          summary: t(`${c}.calendar.cards.calendarIntegration.summary`),
          description: t(`${c}.calendar.cards.calendarIntegration.description`),
          tips: tips(t, `${c}.calendar.cards.calendarIntegration.tips`, 6),
        },
      ],
    },
    {
      id: "tasks",
      label: t(`${c}.tasks.label`),
      icon: CheckSquare,
      cards: [
        {
          id: "task-manager",
          icon: ListTodo,
          title: t(`${c}.tasks.cards.taskManager.title`),
          summary: t(`${c}.tasks.cards.taskManager.summary`),
          description: t(`${c}.tasks.cards.taskManager.description`),
          tips: tips(t, `${c}.tasks.cards.taskManager.tips`, 6, { 0: "g k" }),
        },
        {
          id: "ai-task-extraction",
          icon: Sparkles,
          title: t(`${c}.tasks.cards.aiTaskExtraction.title`),
          summary: t(`${c}.tasks.cards.aiTaskExtraction.summary`),
          description: t(`${c}.tasks.cards.aiTaskExtraction.description`),
          tips: tips(t, `${c}.tasks.cards.aiTaskExtraction.tips`, 5, { 0: "t" }),
          relatedSettingsTab: "ai",
        },
        {
          id: "task-sidebar",
          icon: ListTodo,
          title: t(`${c}.tasks.cards.taskSidebar.title`),
          summary: t(`${c}.tasks.cards.taskSidebar.summary`),
          description: t(`${c}.tasks.cards.taskSidebar.description`),
          tips: tips(t, `${c}.tasks.cards.taskSidebar.tips`, 4),
        },
        {
          id: "recurring-tasks",
          icon: Repeat,
          title: t(`${c}.tasks.cards.recurringTasks.title`),
          summary: t(`${c}.tasks.cards.recurringTasks.summary`),
          description: t(`${c}.tasks.cards.recurringTasks.description`),
          tips: tips(t, `${c}.tasks.cards.recurringTasks.tips`, 4),
        },
      ],
    },
    {
      id: "appearance",
      label: t(`${c}.appearance.label`),
      icon: Palette,
      cards: [
        {
          id: "theme",
          icon: Sun,
          title: t(`${c}.appearance.cards.theme.title`),
          summary: t(`${c}.appearance.cards.theme.summary`),
          description: t(`${c}.appearance.cards.theme.description`),
          tips: tips(t, `${c}.appearance.cards.theme.tips`, 4),
          relatedSettingsTab: "general",
        },
        {
          id: "accent-colors",
          icon: Palette,
          title: t(`${c}.appearance.cards.accentColors.title`),
          summary: t(`${c}.appearance.cards.accentColors.summary`),
          description: t(`${c}.appearance.cards.accentColors.description`),
          tips: tips(t, `${c}.appearance.cards.accentColors.tips`, 4),
          relatedSettingsTab: "general",
        },
        {
          id: "font-density",
          icon: Type,
          title: t(`${c}.appearance.cards.fontDensity.title`),
          summary: t(`${c}.appearance.cards.fontDensity.summary`),
          description: t(`${c}.appearance.cards.fontDensity.description`),
          tips: tips(t, `${c}.appearance.cards.fontDensity.tips`, 4),
          relatedSettingsTab: "general",
        },
        {
          id: "layout-customization",
          icon: Columns2,
          title: t(`${c}.appearance.cards.layoutCustomization.title`),
          summary: t(`${c}.appearance.cards.layoutCustomization.summary`),
          description: t(`${c}.appearance.cards.layoutCustomization.description`),
          tips: tips(t, `${c}.appearance.cards.layoutCustomization.tips`, 4, { 0: "Ctrl+Shift+E" }),
          relatedSettingsTab: "general",
        },
        {
          id: "sidebar-customization",
          icon: Layout,
          title: t(`${c}.appearance.cards.sidebarCustomization.title`),
          summary: t(`${c}.appearance.cards.sidebarCustomization.summary`),
          description: t(`${c}.appearance.cards.sidebarCustomization.description`),
          tips: tips(t, `${c}.appearance.cards.sidebarCustomization.tips`, 5),
          relatedSettingsTab: "general",
        },
      ],
    },
    {
      id: "accounts-system",
      label: t(`${c}.accountsSystem.label`),
      icon: UserCircle,
      cards: [
        {
          id: "multi-account",
          icon: Users,
          title: t(`${c}.accountsSystem.cards.multiAccount.title`),
          summary: t(`${c}.accountsSystem.cards.multiAccount.summary`),
          description: t(`${c}.accountsSystem.cards.multiAccount.description`),
          tips: tips(t, `${c}.accountsSystem.cards.multiAccount.tips`, 5),
          relatedSettingsTab: "accounts",
        },
        {
          id: "system-tray",
          icon: Minimize2,
          title: t(`${c}.accountsSystem.cards.systemTray.title`),
          summary: t(`${c}.accountsSystem.cards.systemTray.summary`),
          description: t(`${c}.accountsSystem.cards.systemTray.description`),
          tips: tips(t, `${c}.accountsSystem.cards.systemTray.tips`, 5),
          relatedSettingsTab: "general",
        },
        {
          id: "global-compose",
          icon: Monitor,
          title: t(`${c}.accountsSystem.cards.globalCompose.title`),
          summary: t(`${c}.accountsSystem.cards.globalCompose.summary`),
          description: t(`${c}.accountsSystem.cards.globalCompose.description`),
          tips: tips(t, `${c}.accountsSystem.cards.globalCompose.tips`, 4),
          relatedSettingsTab: "shortcuts",
        },
        {
          id: "pop-out-windows",
          icon: ExternalLink,
          title: t(`${c}.accountsSystem.cards.popOutWindows.title`),
          summary: t(`${c}.accountsSystem.cards.popOutWindows.summary`),
          description: t(`${c}.accountsSystem.cards.popOutWindows.description`),
          tips: tips(t, `${c}.accountsSystem.cards.popOutWindows.tips`, 4),
        },
        {
          id: "manual-sync",
          icon: RefreshCw,
          title: t(`${c}.accountsSystem.cards.manualSync.title`),
          summary: t(`${c}.accountsSystem.cards.manualSync.summary`),
          description: t(`${c}.accountsSystem.cards.manualSync.description`),
          tips: tips(t, `${c}.accountsSystem.cards.manualSync.tips`, 3, { 0: "F5" }),
        },
        {
          id: "offline-mode",
          icon: WifiOff,
          title: t(`${c}.accountsSystem.cards.offlineMode.title`),
          summary: t(`${c}.accountsSystem.cards.offlineMode.summary`),
          description: t(`${c}.accountsSystem.cards.offlineMode.description`),
          tips: tips(t, `${c}.accountsSystem.cards.offlineMode.tips`, 4),
          relatedSettingsTab: "accounts",
        },
      ],
    },
  ];
}

// ---------- Contextual Tips ----------

export function getContextualTips(t: TFunction): Record<string, ContextualTip> {
  const c = "help.content.contextualTips";
  return {
    "reading-pane": {
      title: t(`${c}.readingPane.title`),
      body: t(`${c}.readingPane.body`),
      helpTopic: "reading-email",
    },
    "split-inbox": {
      title: t(`${c}.splitInbox.title`),
      body: t(`${c}.splitInbox.body`),
      helpTopic: "productivity",
    },
    "undo-send": {
      title: t(`${c}.undoSend.title`),
      body: t(`${c}.undoSend.body`),
      helpTopic: "composing",
    },
    "smart-notifications": {
      title: t(`${c}.smartNotifications.title`),
      body: t(`${c}.smartNotifications.body`),
      helpTopic: "notifications-contacts",
    },
    "phishing-sensitivity": {
      title: t(`${c}.phishingSensitivity.title`),
      body: t(`${c}.phishingSensitivity.body`),
      helpTopic: "security",
    },
    "ai-provider": {
      title: t(`${c}.aiProvider.title`),
      body: t(`${c}.aiProvider.body`),
      helpTopic: "ai-features",
    },
    "search-operators": {
      title: t(`${c}.searchOperators.title`),
      body: t(`${c}.searchOperators.body`),
      helpTopic: "search-navigation",
    },
    "filters": {
      title: t(`${c}.filters.title`),
      body: t(`${c}.filters.body`),
      helpTopic: "organization",
    },
    "smart-labels": {
      title: t(`${c}.smartLabels.title`),
      body: t(`${c}.smartLabels.body`),
      helpTopic: "organization",
    },
  };
}

// ---------- Backward-compatible constants (using i18next directly) ----------
// These are kept for consumers that can't easily pass TFunction (e.g., tests).
// They use the default language at import time.

import i18n from "@/i18n";

/** @deprecated Use getHelpCategories(t) instead */
export const HELP_CATEGORIES: HelpCategory[] = getHelpCategories(i18n.t.bind(i18n));

/** @deprecated Use getContextualTips(t) instead */
export const CONTEXTUAL_TIPS: Record<string, ContextualTip> = getContextualTips(i18n.t.bind(i18n));

// ---------- Helpers ----------

/** Get all cards across all categories (for search) */
export function getAllCards(t?: TFunction): (HelpCard & { categoryId: string; categoryLabel: string })[] {
  const categories = t ? getHelpCategories(t) : HELP_CATEGORIES;
  return categories.flatMap((cat) =>
    cat.cards.map((card) => ({
      ...card,
      categoryId: cat.id,
      categoryLabel: cat.label,
    })),
  );
}

/** Find a category by its ID */
export function getCategoryById(id: string, t?: TFunction): HelpCategory | undefined {
  const categories = t ? getHelpCategories(t) : HELP_CATEGORIES;
  return categories.find((cat) => cat.id === id);
}
