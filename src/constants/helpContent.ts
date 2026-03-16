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
  ShieldCheck,
  ClipboardCheck,
  BarChart2,
  InboxIcon,
  CalendarPlus,
  Bot,
  SlidersHorizontal,
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

// ---------- Help Categories & Cards ----------

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: BookOpen,
    cards: [
      {
        id: "add-account",
        icon: MailPlus,
        title: "Add your email account",
        summary: "Connect a Gmail or IMAP/SMTP account to start using the app.",
        description:
          "Click the account switcher at the top of the sidebar to add an account. For Gmail, follow the OAuth sign-in flow using your own Google Cloud credentials. For other providers (Outlook, Yahoo, iCloud, Fastmail, etc.), choose 'Add IMAP Account' and enter your email and password — server settings are auto-discovered for popular providers. You can add multiple accounts of any type and switch between them instantly. Each account syncs independently with its own inbox, labels, and settings.",
        tips: [
          { text: "The account switcher is always visible at the top of the sidebar." },
          { text: "Gmail accounts use OAuth; IMAP accounts use password or app-password." },
          { text: "Each account has its own labels, filters, and sync state." },
          { text: "Remove or re-authorize accounts in Settings > Accounts." },
        ],
        relatedSettingsTab: "accounts",
      },
      {
        id: "initial-sync",
        icon: Clock,
        title: "Initial sync",
        summary: "First sync downloads your email history.",
        description:
          "When you add a new account, the app performs an initial sync that downloads your last year of email (configurable). This builds a local database for fast offline search and browsing. Depending on your inbox size, this can take a few minutes. You can use the app normally while the sync runs in the background — read, compose, and send without waiting. After the initial sync, the app switches to delta sync (every 60 seconds) to fetch only new changes. Gmail uses the History API for delta sync; IMAP uses UID-based tracking.",
        tips: [
          { text: "Change the sync period (30 days to 1 year) in Settings > Accounts." },
          { text: "The app is fully usable during the initial sync." },
          { text: "Delta sync runs every 60 seconds after the first sync completes." },
          { text: "Gmail: if sync history expires (~30 days offline), the app auto-falls back to a full sync." },
          { text: "IMAP: if folder UIDVALIDITY changes, the app resyncs that folder automatically." },
        ],
        relatedSettingsTab: "accounts",
      },
      {
        id: "client-id-setup",
        icon: Globe,
        title: "Google Client ID setup",
        summary: "Set up your own Google Cloud OAuth credentials (Gmail only).",
        description:
          "This step is only needed for Gmail accounts. The app uses your own Google Cloud project for OAuth authentication — this means your credentials stay on your device and are never shared. When you first add a Gmail account, a setup wizard guides you through creating a Google Cloud project, enabling the Gmail and Calendar APIs, and generating an OAuth Client ID. The process takes about 5 minutes. The app uses PKCE authentication, so no client secret is needed. IMAP/SMTP accounts do not require a Client ID.",
        tips: [
          { text: "Go to console.cloud.google.com to create your project." },
          { text: "Enable both the Gmail API and Google Calendar API." },
          { text: "Choose 'Desktop application' when creating OAuth credentials." },
          { text: "Your Client ID is stored locally — never sent to external servers." },
          { text: "Update your Client ID later in Settings > About." },
          { text: "IMAP accounts skip this step entirely — no Google Cloud project needed." },
        ],
        relatedSettingsTab: "about",
      },
      {
        id: "imap-smtp-setup",
        icon: Server,
        title: "IMAP/SMTP account setup",
        summary: "Add a non-Gmail email account via IMAP and SMTP.",
        description:
          "To add an IMAP/SMTP account, click 'Add IMAP Account' in the account switcher. The setup wizard has four steps: (1) enter your email, display name, and password or OAuth2 credentials; (2) configure IMAP server settings (host, port, security); (3) configure SMTP server settings; (4) test the connection. For popular providers like Outlook, Yahoo, iCloud, Fastmail, Zoho, AOL, and GMX, server settings are auto-discovered when you enter your email address. Outlook/Hotmail accounts require OAuth2 authentication (basic password auth is disabled by Microsoft). Yahoo supports both OAuth2 and app passwords. Your credentials are encrypted with AES-256-GCM before being stored locally.",
        tips: [
          { text: "Auto-discovery works for Outlook, Yahoo, iCloud, Fastmail, Zoho, AOL, and GMX." },
          { text: "Outlook/Hotmail requires OAuth2 — register an app in Azure Portal to get a Client ID." },
          { text: "Yahoo supports OAuth2 or app passwords — OAuth2 is recommended." },
          { text: "For OAuth2, set the redirect URI to http://localhost:17248 in your app registration." },
          { text: "For other providers, check your email provider's help page for IMAP/SMTP settings." },
          { text: "Security options: SSL/TLS (most secure), STARTTLS, or None." },
          { text: "Both IMAP and SMTP connections are tested before saving." },
          { text: "IMAP folders are automatically mapped to labels in the sidebar." },
        ],
        relatedSettingsTab: "accounts",
      },
      {
        id: "outlook-setup",
        icon: Server,
        title: "Outlook account setup",
        summary: "Step-by-step guide to connect an Outlook, Hotmail, or Live account.",
        description:
          "Microsoft requires OAuth2 for Outlook/Hotmail/Live accounts — basic passwords are disabled. You need to register an app in Azure Portal to get a Client ID. Here's how: (1) Join the Microsoft 365 Developer Program at developer.microsoft.com/microsoft-365/dev-program to get a free Azure tenant — creating apps outside a directory is deprecated. (2) Sign into portal.azure.com with your M365 developer account (admin@yourname.onmicrosoft.com), not your personal Outlook account. (3) Go to Microsoft Entra ID → App registrations → New registration. Name it anything, set 'Supported account types' to 'Accounts in any organizational directory and personal Microsoft accounts', and set Redirect URI to 'Mobile and desktop applications' → http://localhost:17248. (4) Copy the Application (client) ID from the Overview page. (5) Go to API permissions → Add a permission → Microsoft Graph → Delegated permissions → add: offline_access, email, openid, profile, User.Read. If you can find 'Office 365 Exchange Online' under 'APIs my organization uses', add IMAP.AccessAsUser.All and SMTP.Send from there too. If not, add them via Manifest JSON (see tips). (6) Go to Authentication (left sidebar) → scroll to 'Advanced settings' → set 'Allow public client flows' to Yes → Save. (7) In the app, choose Add IMAP Account, enter your personal Outlook email, paste the Client ID, leave Client Secret blank, and click 'Sign in with Microsoft'. Server settings are auto-filled (IMAP: imap-mail.outlook.com:993 SSL, SMTP: smtp-mail.outlook.com:587 STARTTLS). Note: new Outlook.com accounts may take up to 24 hours before IMAP/SMTP access is activated by Microsoft.",
        tips: [
          { text: "Join the M365 Developer Program for a free Azure tenant to register apps." },
          { text: "Sign into Azure Portal with your M365 dev account, not your personal Outlook." },
          { text: "Platform type must be 'Mobile and desktop applications' (not Web or SPA)." },
          { text: "Redirect URI must be exactly: http://localhost:17248" },
          { text: "Client Secret is optional — leave it blank for desktop apps (PKCE handles security)." },
          { text: "Enable 'Allow public client flows' in Authentication → Advanced settings." },
          { text: "If 'Office 365 Exchange Online' doesn't appear in API permissions, add it via Manifest: add resourceAppId '00000002-0000-0ff1-ce00-000000000000' with IMAP scope id '5df07973-7d5d-46ed-f847-aeb6baeacb0b' and SMTP scope id '258f6531-ecdc-4944-8c5f-82fee32d369b'." },
          { text: "Only works for personal Microsoft accounts (outlook.com, hotmail.com, live.com)." },
          { text: "New accounts may need up to 24 hours before IMAP/SMTP access is enabled by Microsoft." },
          { text: "Tokens auto-refresh — you won't need to sign in again." },
        ],
        relatedSettingsTab: "accounts",
      },
    ],
  },
  {
    id: "reading-email",
    label: "Reading Email",
    icon: Eye,
    cards: [
      {
        id: "thread-view",
        icon: Mail,
        title: "Thread view",
        summary: "Emails grouped as conversations.",
        description:
          "All related emails are automatically grouped into conversation threads. Click a thread in the email list to open it and see every message in the conversation, with the newest message at the bottom. Each message shows the sender, timestamp, and full formatted content. Inline attachments and images are displayed directly in the message body. You can reply inline to any individual message in the thread without opening the full composer.",
        tips: [
          { text: "Open a thread", shortcut: "o" },
          { text: "Navigate between threads", shortcut: "j / k" },
          { text: "Go back to the list", shortcut: "Escape" },
          { text: "Pop out a thread into its own window from the action bar." },
          { text: "Inline reply lets you respond to a specific message without leaving the thread." },
        ],
      },
      {
        id: "reading-pane",
        icon: Layout,
        title: "Reading pane positions",
        summary: "Choose right, bottom, or hidden layout.",
        description:
          "The reading pane shows the selected thread's content alongside the email list. You can position it to the right of the email list (best for wide screens), below it (good for narrow screens), or hide it completely (click-to-open mode). The email list width is also adjustable — drag the divider to resize. Your layout preference is saved and restored automatically.",
        tips: [
          { text: "Right pane works best on screens wider than 1400px." },
          { text: "Bottom pane gives more horizontal space to read wide emails." },
          { text: "Hidden mode shows only the email list; click a thread to open it full-width." },
          { text: "Drag the divider between the list and pane to adjust widths." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "mark-as-read",
        icon: Eye,
        title: "Mark-as-read behavior",
        summary: "Control when messages are marked as read.",
        description:
          "Choose when opening a thread marks it as read: immediately when you select it, after a short delay (giving you time to skim), or only when you manually mark it. This setting helps if you use unread count as a to-do indicator and don't want threads marked as read just because you glanced at them.",
        tips: [
          { text: "\"Immediately\" marks as read as soon as you open the thread." },
          { text: "\"After delay\" waits a couple of seconds before marking." },
          { text: "\"Manual only\" never auto-marks — you control it yourself." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "read-filter",
        icon: ListFilter,
        title: "Read / Unread filter",
        summary: "Filter the email list to show all, unread, or read threads.",
        description:
          "Use the filter dropdown at the top of the email list to narrow down what's shown. Choose 'All' to see every thread, 'Unread' to focus on threads that still need attention, or 'Read' to review threads you've already opened. The filter applies to whatever folder or label you're currently viewing. Your filter preference is saved and restored across sessions.",
        tips: [
          { text: "The filter dropdown is in the email list header, next to the thread count." },
          { text: "Options: All, Unread, Read." },
          { text: "Combine with labels or smart folders for precise filtering." },
          { text: "Your filter preference persists across restarts." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "print-export",
        icon: Printer,
        title: "Print & export threads",
        summary: "Print a thread or export it as an .eml file.",
        description:
          "From the action bar, you can print the entire thread or export it as an .eml file. Print generates a clean, formatted view of the full conversation with headers and timestamps, then opens your system print dialog. Export saves the thread as a standard RFC 2822 .eml file that can be opened in any email client — useful for backup, legal records, or sharing outside the app.",
        tips: [
          { text: "Click the Print icon in the action bar to print the thread." },
          { text: "Click the Download icon in the action bar to export as .eml." },
          { text: "The .eml format is a universal standard readable by any email client." },
          { text: "Print view includes all messages, senders, and timestamps." },
        ],
      },
      {
        id: "raw-message",
        icon: Code,
        title: "View raw message source",
        summary: "Inspect the raw MIME source of any email.",
        description:
          "Right-click on any message in a thread and select 'View Source' to see the full raw MIME source code. This shows all headers (including routing, authentication, and custom headers), the raw message body, and MIME structure. Useful for debugging delivery issues, verifying authentication headers, or understanding how an email was constructed.",
        tips: [
          { text: "Right-click a message and choose 'View Source'." },
          { text: "Shows all headers: From, To, Authentication-Results, DKIM, etc." },
          { text: "Useful for debugging delivery or spam filter issues." },
          { text: "The raw view opens in a scrollable modal." },
        ],
      },
    ],
  },
  {
    id: "composing",
    label: "Composing & Sending",
    icon: PenLine,
    cards: [
      {
        id: "new-email",
        icon: PenLine,
        title: "Compose a new email",
        summary: "Rich text editor with formatting and attachments.",
        description:
          "The composer uses a full rich text editor powered by TipTap. You can format text (bold, italic, lists, links, code blocks), add file attachments, insert a signature, and pick a template — all from one place. The composer opens as a panel at the bottom of the screen. Add recipients with autocomplete (ranked by how often you email them), set a subject, and compose your message.",
        tips: [
          { text: "Open the composer", shortcut: "c" },
          { text: "Send the email", shortcut: "Ctrl+Enter" },
          { text: "Recipient autocomplete is ranked by contact frequency." },
          { text: "Use the toolbar or markdown-style shortcuts for formatting." },
          { text: "Close the composer with Escape (draft is auto-saved)." },
        ],
      },
      {
        id: "reply-forward",
        icon: MessageSquare,
        title: "Reply, Reply All & Forward",
        summary: "Respond to emails or forward them.",
        description:
          "Reply sends your response to the original sender only. Reply All includes everyone on the thread (To and CC). Forward lets you send the email to someone new with your own message. You can set your default reply action (Reply vs Reply All) in Composing settings, so pressing the reply shortcut does what you expect. The inline reply feature also lets you reply to a specific message directly within the thread view.",
        tips: [
          { text: "Reply", shortcut: "r" },
          { text: "Reply All", shortcut: "a" },
          { text: "Forward", shortcut: "f" },
          { text: "Set your default reply mode (Reply or Reply All) in Settings." },
          { text: "Inline reply lets you respond without opening the full composer." },
        ],
        relatedSettingsTab: "composing",
      },
      {
        id: "undo-send",
        icon: Undo2,
        title: "Undo send",
        summary: "Brief window to cancel a sent email.",
        description:
          "After you hit send, a toast notification appears with an \"Undo\" button. Click it to cancel the send before the email is actually delivered. You can set how long this window lasts — from 5 to 30 seconds. During the undo window, the email is queued locally but not yet sent to Gmail's servers. Once the window expires, the email is sent and cannot be recalled.",
        tips: [
          { text: "Set the undo delay (5-30 seconds) in Settings > Composing." },
          { text: "The undo toast appears at the bottom of the screen after sending." },
          { text: "Closing the app during the undo window will still send the email." },
        ],
        relatedSettingsTab: "composing",
      },
      {
        id: "schedule-send",
        icon: CalendarClock,
        title: "Schedule send",
        summary: "Write now, send later at a chosen time.",
        description:
          "Compose an email and schedule it to be sent at a specific date and time. This is useful for writing emails after hours, on weekends, or in different time zones without sending them immediately. Choose from quick presets (tomorrow morning, Monday morning) or pick a custom date and time. Scheduled emails appear in your Drafts until they're sent. You can cancel or reschedule them before the send time.",
        tips: [
          { text: "Click the dropdown arrow next to the Send button to schedule." },
          { text: "Quick presets: Tomorrow Morning (9am), Tomorrow Afternoon (1pm), Monday Morning." },
          { text: "View and manage scheduled emails in Settings > Composing." },
          { text: "Cancel a scheduled email any time before it sends." },
        ],
      },
      {
        id: "send-archive",
        icon: Archive,
        title: "Send & Archive",
        summary: "Automatically archive threads after replying.",
        description:
          "When enabled, sending a reply automatically archives the thread — removing it from your inbox while keeping it searchable in All Mail. This keeps your inbox clean, treating replies as \"done\" by default. If you need the thread in your inbox again, you can always unarchive it. Toggle this behavior on or off in Composing settings.",
        tips: [
          { text: "Toggle Send & Archive in Settings > Composing." },
          { text: "Archived threads are still searchable in All Mail." },
          { text: "If someone replies, the thread comes back to your inbox automatically." },
        ],
        relatedSettingsTab: "composing",
      },
      {
        id: "signatures",
        icon: FileSignature,
        title: "Signatures",
        summary: "Create and manage email signatures.",
        description:
          "Create multiple signatures for different contexts — work, personal, formal, casual. Signatures support rich text formatting (bold, links, images). Set one as default to auto-insert it in every new compose, or choose a different signature from the selector in the composer. Signatures are managed in Settings and persisted locally.",
        tips: [
          { text: "Create signatures in Settings > Composing." },
          { text: "Set a default signature that auto-inserts in new emails." },
          { text: "Switch signatures from the signature selector in the composer." },
          { text: "Supports rich text: bold, links, images, and more." },
        ],
        relatedSettingsTab: "composing",
      },
      {
        id: "templates",
        icon: FileText,
        title: "Templates",
        summary: "Reusable email body text for common messages.",
        description:
          "Save frequently-used email bodies as templates. When composing, open the template picker to insert a template's content into the editor with one click. Templates are great for repetitive emails like meeting requests, status updates, or customer replies. You can also assign keyboard shortcuts to your most-used templates for even faster access. Template variables are supported for dynamic content.",
        tips: [
          { text: "Create templates in Settings > Composing." },
          { text: "Insert templates from the template picker icon in the composer toolbar." },
          { text: "Assign keyboard shortcuts to frequently-used templates." },
          { text: "Templates support variables like {{name}} for dynamic content." },
        ],
        relatedSettingsTab: "composing",
      },
      {
        id: "from-aliases",
        icon: Users,
        title: "From aliases",
        summary: "Send from different email addresses.",
        description:
          "If your Gmail account has send-as aliases configured (e.g., a work alias or department address), a \"From\" selector appears in the composer letting you choose which address to send from. Aliases are synced from Gmail's send-as settings when you add your account. The default alias is used for new compose; replies default to the address the original email was sent to. Send-as aliases are currently a Gmail-only feature.",
        tips: [
          { text: "Aliases are fetched from your Gmail send-as settings automatically." },
          { text: "The From selector only appears when your account has multiple aliases." },
          { text: "Replies default to the address the email was originally sent to." },
          { text: "Set a default alias in your Gmail account settings." },
          { text: "Send-as aliases are currently available for Gmail accounts only." },
        ],
        relatedSettingsTab: "accounts",
      },
      {
        id: "draft-autosave",
        icon: Save,
        title: "Draft auto-save",
        summary: "Drafts saved automatically every 3 seconds.",
        description:
          "As you compose, your draft is automatically saved every 3 seconds. If the app closes, your computer restarts, or you navigate away, your draft is preserved. For Gmail accounts, drafts sync across devices. For IMAP accounts, drafts are saved to the server's Drafts folder. The save happens silently in the background — you never have to manually save. Find your drafts in the Drafts folder in the sidebar.",
        tips: [
          { text: "Drafts save automatically every 3 seconds while composing." },
          { text: "Gmail drafts sync across devices; IMAP drafts save to the server's Drafts folder." },
          { text: "Navigate away safely — your draft is already saved." },
          { text: "Find saved drafts in the Drafts folder in the sidebar." },
        ],
      },
    ],
  },
  {
    id: "search-navigation",
    label: "Search & Navigation",
    icon: Search,
    cards: [
      {
        id: "search-operators",
        icon: Search,
        title: "Search operators",
        summary: "Gmail-style operators to refine search results.",
        description:
          "Search uses Gmail-style operators for precise filtering. Combine multiple operators to find exactly what you need. All searches run against your local database using FTS5 full-text indexing, so results are instant. Operators can be combined freely — they use AND logic, so each additional operator narrows the results further.",
        tips: [
          { text: "from:jane — emails from a specific sender" },
          { text: "to:team@ — emails sent to a specific address" },
          { text: "subject:quarterly report — match subject line" },
          { text: "has:attachment — only emails with attachments" },
          { text: "is:unread / is:starred / is:read — filter by status" },
          { text: "before:2024-06-01 / after:2024-01-01 — date range filters" },
          { text: "label:work — filter by label" },
          { text: "Combine freely: from:jane subject:report has:attachment after:2024-01-01" },
        ],
      },
      {
        id: "command-palette",
        icon: Command,
        title: "Command palette",
        summary: "Keyboard-driven search, navigation, and actions.",
        description:
          "The command palette is the fastest way to do anything in the app. Open it with a shortcut and start typing to search your email, jump to any label or folder, switch accounts, or trigger actions. Results update as you type. The palette searches across email content, sender names, subject lines, labels, and folders — all from one input.",
        tips: [
          { text: "Open the command palette", shortcut: "Ctrl+K" },
          { text: "Also opens with", shortcut: "/" },
          { text: "Type to search email, labels, folders, and actions." },
          { text: "Results update instantly as you type." },
          { text: "Press Enter to open the first result, or arrow keys to navigate." },
        ],
      },
      {
        id: "keyboard-shortcuts",
        icon: Keyboard,
        title: "Keyboard shortcuts",
        summary: "Navigate and act on email without the mouse.",
        description:
          "Almost every action has a keyboard shortcut, inspired by Superhuman's keyboard-first design. Shortcuts are disabled when you're typing in an input field, text area, or rich text editor to avoid conflicts. The app supports two-key sequences (press g then another key within 1 second) for navigation commands. All shortcuts are fully customizable — rebind any key in Settings.",
        tips: [
          { text: "View all shortcuts", shortcut: "?" },
          { text: "Navigation: j/k (up/down), o (open), Escape (back)" },
          { text: "In-thread: Arrow Up/Down to navigate between messages" },
          { text: "Actions: e (archive), s (star), # (trash), r (reply)" },
          { text: "Two-key: g then i (Inbox), g then s (Starred), g then t (Sent)" },
          { text: "Ask Inbox (AI)", shortcut: "i" },
          { text: "Sync current folder", shortcut: "F5" },
          { text: "Customize all shortcuts in Settings > Shortcuts." },
          { text: "Shortcuts are disabled in text inputs to prevent conflicts." },
        ],
        relatedSettingsTab: "shortcuts",
      },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    icon: Tag,
    cards: [
      {
        id: "labels",
        icon: Tag,
        title: "Labels",
        summary: "Color-coded tags to organize your email.",
        description:
          "Labels work like tags — apply multiple labels to a single thread to categorize it in several ways. Create custom labels with colors to visually distinguish categories. Labels appear in the sidebar for quick filtering. You can create, edit, rename, change colors, and delete labels from the sidebar or from Settings. For Gmail accounts, labels sync across devices. For IMAP accounts, server folders are automatically mapped to labels in the sidebar (e.g., Inbox, Sent, Drafts, Trash), and custom folders appear as user labels.",
        tips: [
          { text: "Drag and drop threads onto sidebar labels to apply them." },
          { text: "Right-click a label in the sidebar to edit or delete it." },
          { text: "Click the + button in the Labels section of the sidebar to create one." },
          { text: "A thread can have multiple labels simultaneously." },
          { text: "Gmail labels sync across devices; IMAP folders are mapped to labels automatically." },
        ],
        relatedSettingsTab: "mail-rules",
      },
      {
        id: "smart-folders",
        icon: FolderSearch,
        title: "Smart folders",
        summary: "Saved searches that act as dynamic folders.",
        description:
          "Smart folders are saved search queries that appear in the sidebar like regular folders. They dynamically show threads matching the query — the results update automatically as new email arrives. Use any search operator in the query. Dynamic date tokens (like __LAST_7_DAYS__ or __TODAY__) keep the results relative to the current date. Smart folders show an unread count badge, just like regular folders.",
        tips: [
          { text: "Click the + button in the Smart Folders section of the sidebar." },
          { text: "Use search operators: is:unread from:boss" },
          { text: "Dynamic tokens: __LAST_7_DAYS__, __LAST_30_DAYS__, __TODAY__" },
          { text: "Each smart folder shows its unread count in the sidebar." },
          { text: "Edit or delete smart folders in Settings > Mail Rules." },
        ],
        relatedSettingsTab: "mail-rules",
      },
      {
        id: "filters",
        icon: Filter,
        title: "Filters & rules",
        summary: "Auto-sort incoming email by sender, subject, or content.",
        description:
          "Create filter rules that automatically process incoming email. Set criteria (match by sender address, subject line, or message content) and assign actions (apply a label, archive, move to trash, star, or mark as read). Criteria use case-insensitive substring matching with AND logic — all criteria must match. When multiple filters match the same message, their actions are merged together. Filters run automatically on every new message during sync.",
        tips: [
          { text: "Create filters in Settings > Mail Rules." },
          { text: "Criteria: match by From, Subject, or Content (AND logic)." },
          { text: "Actions: apply label, archive, trash, star, mark as read." },
          { text: "Multiple matching filters merge their actions." },
          { text: "Filters run on every new message during background sync." },
        ],
        relatedSettingsTab: "mail-rules",
      },
      {
        id: "smart-labels",
        icon: Tags,
        title: "Smart labels",
        summary: "AI-powered auto-labeling using plain English descriptions.",
        description:
          "Describe what emails should receive a label using natural language — for example, 'Job applications and career opportunities' — and AI automatically labels matching emails during every sync. You can also add optional traditional criteria (from, subject, etc.) for instant deterministic matching before the AI fallback. Smart labels support multi-label assignment, so a single thread can match several rules at once. Use the 'Apply to existing emails' button to backfill labels onto your current inbox.",
        tips: [
          { text: "Create smart labels in Settings > Mail Rules > Smart Labels." },
          { text: "Write a plain-English description of what the label should match." },
          { text: "Optional: add traditional criteria (from, subject) for instant matching without AI." },
          { text: "Click 'Apply to existing emails' to label your current inbox retroactively." },
          { text: "Smart labels run automatically on every new email during sync." },
          { text: "Requires an active AI provider (Claude, GPT, or Gemini)." },
        ],
        relatedSettingsTab: "mail-rules",
      },
      {
        id: "quick-steps",
        icon: Zap,
        title: "Quick steps",
        summary: "Chain multiple actions into a single click.",
        description:
          "Quick steps let you bundle multiple actions into one. For example, create a quick step that applies a label, archives the thread, and marks it as read — all with a single click. There are 18 available action types including labeling, archiving, trashing, starring, marking read/unread, replying, forwarding, and more. Preset templates help you get started, and you can create custom ones for your workflow.",
        tips: [
          { text: "Access quick steps from the action bar on a thread." },
          { text: "18 action types available: label, archive, trash, star, mark read, reply, forward, and more." },
          { text: "Create and manage quick steps in Settings > Mail Rules." },
          { text: "Preset templates are available as starting points." },
        ],
        relatedSettingsTab: "mail-rules",
      },
      {
        id: "star-pin-mute",
        icon: Star,
        title: "Star, Pin & Mute",
        summary: "Flag, prioritize, or silence threads.",
        description:
          "Star threads to flag them for follow-up — starred threads have their own view in the sidebar. Pin threads to keep them stuck at the top of your email list, regardless of date. Mute threads to stop getting bothered by them — muted threads are auto-archived, and future replies in the thread won't appear in your inbox or trigger notifications.",
        tips: [
          { text: "Star / unstar", shortcut: "s" },
          { text: "Pin / unpin", shortcut: "p" },
          { text: "Mute / unmute", shortcut: "m" },
          { text: "Starred threads appear in the Starred view in the sidebar." },
          { text: "Pinned threads stay at the top of the list regardless of date." },
          { text: "Muted threads are auto-archived and suppress notifications." },
        ],
      },
      {
        id: "archive-trash",
        icon: Trash2,
        title: "Archive & Trash",
        summary: "Remove from inbox or delete permanently.",
        description:
          "Archive removes a thread from your inbox but keeps it in All Mail — it's still searchable and accessible. Trash moves a thread to the Trash folder. Deleting a thread that's already in Trash permanently removes it from the database. This two-stage delete prevents accidental permanent deletions. Archived threads come back to your inbox if someone replies to them.",
        tips: [
          { text: "Archive", shortcut: "e" },
          { text: "Trash", shortcut: "#" },
          { text: "Also works with Delete or Backspace keys." },
          { text: "Deleting from Trash permanently removes the thread." },
          { text: "Archived threads return to inbox when new replies arrive." },
        ],
      },
      {
        id: "move-to-folder",
        icon: FolderInput,
        title: "Move to folder",
        summary: "Quickly move threads to any folder or label.",
        description:
          "Press V to open a searchable popup where you can pick a destination folder or label. Type to filter the list, use arrow keys to navigate, and press Enter to move the thread. For Gmail, moving adds the destination label and removes the thread from your current location. For IMAP accounts, the thread is moved to the selected folder on the server. Works with multi-select — move multiple threads at once.",
        tips: [
          { text: "Open the move-to dialog", shortcut: "v" },
          { text: "Type to search and filter destinations." },
          { text: "Navigate with arrow keys, select with Enter." },
          { text: "Also available from the action bar and right-click menu." },
          { text: "Works with multi-selected threads for batch moves." },
        ],
      },
      {
        id: "multi-select",
        icon: MousePointer,
        title: "Multi-select & batch actions",
        summary: "Select multiple threads for bulk operations.",
        description:
          "Click threads to toggle their selection. Shift+click to select a range from the last selected thread to the clicked one. Once you have multiple threads selected, any action you take (archive, trash, star, label, etc.) applies to all of them at once. Keyboard shortcuts also work on your selection — press e to archive all selected threads, # to trash them, etc.",
        tips: [
          { text: "Select all threads", shortcut: "Ctrl+A" },
          { text: "Select range from current position", shortcut: "Ctrl+Shift+A" },
          { text: "Click to toggle individual thread selection." },
          { text: "Shift+click to select a range of threads." },
          { text: "All keyboard actions (archive, trash, star) work on the selection." },
          { text: "Press Escape to clear the selection." },
        ],
      },
      {
        id: "bulk-actions",
        icon: ListFilter,
        title: "Bulk actions bar",
        summary: "A toolbar appears when multiple threads are selected.",
        description:
          "When you select two or more threads, a bulk actions bar appears at the top of the email list. It provides one-click buttons for the most common batch operations: Archive, Delete, Mark as Spam, and Clear Selection. This is faster than using keyboard shortcuts when you want to visually confirm your selection before acting. The bar also shows how many threads are currently selected.",
        tips: [
          { text: "Select multiple threads, then use the bar for quick batch actions." },
          { text: "Available actions: Archive, Delete, Spam, Clear Selection." },
          { text: "The bar shows the count of selected threads." },
          { text: "Keyboard shortcuts also work on the selection alongside the bar." },
        ],
      },
      {
        id: "attachment-library",
        icon: Paperclip,
        title: "Attachment library",
        summary: "Browse and search all your attachments in one place.",
        description:
          "The Attachment Library gives you a searchable, filterable view of every attachment across all your emails. Find files without remembering which email they were in. Filter by file type (images, PDFs, documents, spreadsheets, archives), sender, date range, or file size. Switch between grid and list views. Preview images and PDFs inline, download files, or jump directly to the original email thread.",
        tips: [
          { text: "Go to Attachments", shortcut: "g a" },
          { text: "Open Attachments from the sidebar navigation (Paperclip icon)." },
          { text: "Search by filename, subject, or sender name." },
          { text: "Filter by type, sender, date range, or file size." },
          { text: "Click an attachment to preview, download, or jump to the email." },
          { text: "Switch between grid and list views with the toggle in the header." },
        ],
      },
      {
        id: "drag-drop",
        icon: GripVertical,
        title: "Drag & drop",
        summary: "Drag threads onto sidebar labels to apply them.",
        description:
          "Grab a thread (or multiple selected threads) from the email list and drag them onto any label in the sidebar to apply that label. The drop target highlights as you hover over it. This works with both custom labels and system folders like Trash. Multi-selected threads are all labeled at once when you drop them.",
        tips: [
          { text: "Click and hold a thread to start dragging." },
          { text: "Drop onto any label in the sidebar to apply it." },
          { text: "Works with multi-selected threads — all get labeled." },
          { text: "The sidebar label highlights when a valid drop is detected." },
        ],
      },
    ],
  },
  {
    id: "productivity",
    label: "Productivity",
    icon: Clock,
    cards: [
      {
        id: "snooze",
        icon: Clock,
        title: "Snooze",
        summary: "Temporarily hide a thread, resurface it later.",
        description:
          "Snooze removes a thread from your inbox and brings it back at a date and time you choose. This lets you defer emails you can't handle right now without losing track of them. When the snooze time arrives, the thread reappears in your inbox as if it just arrived. Snoozed threads are visible in the Snoozed folder in the sidebar. Technically, snoozing removes the INBOX label and adds a SNOOZED label.",
        tips: [
          { text: "Click the snooze icon in the thread action bar." },
          { text: "Choose from presets (later today, tomorrow, next week) or pick a custom time." },
          { text: "View all snoozed threads in the Snoozed folder in the sidebar." },
          { text: "Unsnooze a thread early by opening it and clicking Unsnooze." },
        ],
      },
      {
        id: "follow-up-reminders",
        icon: BellRing,
        title: "Follow-up reminders",
        summary: "Get reminded if you don't receive a reply.",
        description:
          "After sending an important email, set a follow-up reminder. If no one replies within your chosen timeframe (e.g., 2 days, 1 week), you'll get a notification reminding you to follow up. The reminder only triggers if the thread has no new replies — if someone responds before the deadline, the reminder is automatically dismissed. Follow-up reminders are checked in the background every 60 seconds.",
        tips: [
          { text: "Set a follow-up reminder from the thread action bar." },
          { text: "Choose a timeframe: 1 day, 2 days, 1 week, or custom." },
          { text: "Reminders auto-cancel if a reply arrives before the deadline." },
          { text: "You'll receive a desktop notification when the follow-up is due." },
        ],
      },
      {
        id: "split-inbox",
        icon: Columns2,
        title: "Split inbox",
        summary: "Divide your inbox into category tabs.",
        description:
          "Split inbox organizes your inbox into five category tabs: Primary, Updates, Promotions, Social, and Newsletters. Each tab shows only the threads belonging to that category, letting you focus on what matters. New emails are automatically categorized using AI (or rule-based fallback). Toggle split inbox from the icon next to Inbox in the sidebar. When split mode is off, all categories are shown together.",
        tips: [
          { text: "Toggle split inbox from the Columns icon next to Inbox in the sidebar." },
          { text: "Categories: Primary, Updates, Promotions, Social, Newsletters." },
          { text: "AI auto-categorizes new emails during sync." },
          { text: "Rule-based categorization runs first, AI fills in the rest." },
          { text: "You can auto-archive non-Primary categories in Settings." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "spam",
        icon: AlertTriangle,
        title: "Spam",
        summary: "Report spam or rescue legitimate emails.",
        description:
          "Mark unwanted emails as spam to move them to the Spam folder. The action is context-aware: when viewing the Spam folder, the button changes to \"Not spam\" so you can rescue legitimate emails that were incorrectly flagged. For Gmail accounts, spam reports sync with Gmail to improve its spam filter. For IMAP accounts, messages are moved to the server's Junk/Spam folder.",
        tips: [
          { text: "Report spam / Not spam", shortcut: "!" },
          { text: "In the Spam folder, the shortcut marks threads as Not spam." },
          { text: "Gmail accounts: spam reports help improve Gmail's filter over time." },
          { text: "IMAP accounts: messages are moved to the Junk/Spam folder on the server." },
        ],
      },
    ],
  },
  {
    id: "ai-features",
    label: "AI Features",
    icon: Sparkles,
    cards: [
      {
        id: "ai-overview",
        icon: Brain,
        title: "AI overview",
        summary: "Choose your AI provider and bring your own key.",
        description:
          "The app supports three AI providers: Anthropic Claude, OpenAI GPT, and Google Gemini. You bring your own API key, which means your email data is sent directly to the provider's API — there's no middleman or third-party server involved. API keys are stored securely in your local database. AI features include thread summaries, smart replies, compose assistance, text transformation, and natural language inbox queries. You can enable or disable AI features globally, and choose which provider to use.",
        tips: [
          { text: "Add your API key in Settings > AI." },
          { text: "Supported providers: Claude, OpenAI, and Gemini." },
          {
            text: "Choose which model to use for each provider in Settings (e.g., Claude Haiku 4.5, GPT-4o Mini, Gemini 2.5 Flash).",
          },
          { text: "Your data goes directly to the provider API — no middleman." },
          { text: "API keys are stored securely in your local database." },
          { text: "AI results are cached locally to reduce API calls." },
          { text: "Disable AI globally with one toggle in Settings." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "thread-summaries",
        icon: FileText,
        title: "Thread summaries",
        summary: "AI-generated summary of long conversations.",
        description:
          "For threads with many messages, click the summary button to get a concise AI-generated overview. The summary captures the key points, decisions, and action items from the entire conversation, saving you from reading through dozens of messages. Summaries are cached locally so you only pay for the API call once. Especially useful for threads you were CC'd on or need to catch up on after being away.",
        tips: [
          { text: "Click the summary icon in the thread view header." },
          { text: "Summaries are cached — subsequent views are instant and free." },
          { text: "Best for long threads with 5+ messages." },
          { text: "Captures key decisions, action items, and takeaways." },
        ],
      },
      {
        id: "smart-replies",
        icon: MessageSquare,
        title: "Smart replies",
        summary: "AI-suggested quick reply options.",
        description:
          "When viewing a thread, AI analyzes the latest message and suggests 2-3 short reply options — like \"Sounds good, thanks!\", \"Let me check and get back to you.\", or \"I'm available next Tuesday.\" Click a suggestion to insert it into the reply editor, then edit it before sending. Smart replies save time for quick, routine responses.",
        tips: [
          { text: "Smart reply suggestions appear below the last message in a thread." },
          { text: "Click a suggestion to insert it into the reply editor." },
          { text: "Edit the suggestion before sending — it's a starting point, not final." },
          { text: "Suggestions are context-aware based on the email content." },
        ],
      },
      {
        id: "ai-compose",
        icon: Wand2,
        title: "AI compose & transform",
        summary: "Draft emails or rewrite text with AI assistance.",
        description:
          "Open the AI Assist panel in the composer to get help drafting emails. Describe what you want to say and AI generates a draft. You can also select existing text and transform it: change the tone (formal, casual, friendly), fix grammar and spelling, translate to another language, shorten or expand the text, or simplify complex language. All transformations happen in-place in the editor.",
        tips: [
          { text: "Open AI Assist from the sparkle icon in the composer toolbar." },
          { text: "Describe your email and AI generates a draft." },
          { text: "Select text to transform: tone, grammar, translate, shorten, expand." },
          { text: "Transformations replace the selected text in-place." },
          { text: "Review and edit AI output before sending." },
        ],
      },
      {
        id: "auto-drafts",
        icon: PenSquare,
        title: "AI auto-draft replies",
        summary: "Reply editor auto-fills with an AI-generated draft matching your writing style.",
        description:
          "When you click Reply or Reply All, the editor is automatically populated with an AI-generated draft that matches your writing voice. The AI learns your style by analyzing your 15 most recent sent emails — it picks up your tone, greeting patterns, sign-off style, and typical phrasing. The style profile is cached per account so analysis only happens once. Drafts are also cached per thread and reply mode. You can regenerate the draft, clear it and start fresh, or simply edit it. If you start typing before the draft loads, the auto-populate is cancelled so you're never interrupted. Auto-drafts work for Reply and Reply All, not Forward.",
        tips: [
          { text: "Toggle auto-drafts in Settings > AI > Auto-Draft Replies." },
          { text: "Writing style is learned from your 15 most recent sent emails." },
          { text: "Click Regenerate to get a new draft for the same thread." },
          { text: "Click Clear to remove the draft and write from scratch." },
          { text: "Typing before the draft loads cancels auto-populate." },
          { text: "Drafts are cached — re-opening the same reply is instant." },
          { text: "Click Reanalyze in Settings to refresh your writing style profile." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "ask-inbox",
        icon: MailQuestion,
        title: "Ask Inbox",
        summary: "Ask questions about your email in plain English.",
        description:
          "Ask natural language questions about your inbox and get AI-powered answers. For example: \"What did John say about the Q3 deadline?\", \"Show me all receipts from last month\", or \"Summarize my unread emails from today.\" The AI searches your local email database, finds relevant threads, and generates a comprehensive answer with references to specific emails.",
        tips: [
          { text: "Open Ask Inbox from the search area or command palette." },
          { text: "Ask in plain English — no need for search operators." },
          { text: "Examples: \"What's the status of the Johnson deal?\"" },
          { text: "AI searches your local database for relevant emails." },
          { text: "Answers include references to specific threads you can click to open." },
        ],
      },
      {
        id: "ai-proofread",
        icon: ClipboardCheck,
        title: "Proofread before send",
        summary: "AI checks tone and clarity before you send.",
        description:
          "When you click Send, AI automatically reviews your email for tone, clarity, and potential issues before it goes out. If problems are found, a panel shows each issue with a severity indicator — you can fix them or send anyway. Catching an unclear ask or an overly blunt tone before hitting send is far less awkward than following up. Enable or disable this feature individually in Settings > AI.",
        tips: [
          { text: "The proofread panel appears before send if issues are detected." },
          { text: "Click 'Send anyway' to send without making changes." },
          { text: "Issues are rated by severity to help you prioritize." },
          { text: "Toggle proofread-before-send in Settings > AI." },
          { text: "Requires an active AI provider (Claude, GPT, or Gemini)." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "ai-urgency",
        icon: BarChart2,
        title: "Thread urgency scoring",
        summary: "AI scores each thread by urgency during sync.",
        description:
          "After each sync, AI analyzes incoming threads and assigns an urgency score based on the content — deadlines, action items, tone, and sender context. High and medium urgency threads show a colored badge in the thread list so you can prioritize at a glance without opening every email. Urgency is scored once per thread and cached locally. Enable or disable this feature in Settings > AI.",
        tips: [
          { text: "Urgency badges appear on ThreadCard: 🔴 high, 🟡 medium." },
          { text: "Scoring runs automatically after each sync in the background." },
          { text: "Scores are cached — no repeated API calls for the same thread." },
          { text: "Toggle urgency scoring in Settings > AI." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "ai-inbox-digest",
        icon: InboxIcon,
        title: "Inbox digest",
        summary: "One-click AI summary of your unread inbox.",
        description:
          "Click the Digest button in the email list to get an instant AI-generated bullet-point summary of your current unread emails. Instead of scrolling through dozens of threads, the digest surfaces the most important items — urgent requests, key decisions, and follow-ups — in a single condensed view. The panel is floating and dismissible so it doesn't interrupt your workflow.",
        tips: [
          { text: "Click the Digest button in the email list toolbar to open the panel." },
          { text: "The panel summarizes your current unread threads as bullet points." },
          { text: "Dismiss the panel by clicking X or pressing Escape." },
          { text: "Toggle inbox digest in Settings > AI." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "ai-meeting-detection",
        icon: CalendarPlus,
        title: "Meeting detection",
        summary: "Detects scheduling requests and offers to create a calendar event.",
        description:
          "When you open a thread that contains a meeting request or scheduling discussion, a banner automatically appears offering to create a calendar event. The AI identifies the proposed date, time, and participants from the email content. Click 'Create Calendar Event' to open a pre-filled event creation modal. This saves the copy-paste workflow of manually extracting meeting details from emails.",
        tips: [
          { text: "The banner appears automatically when scheduling intent is detected." },
          { text: "Click 'Create Calendar Event' to open a pre-filled event form." },
          { text: "Dismiss the banner if you don't need to create an event." },
          { text: "Toggle meeting detection in Settings > AI." },
          { text: "Requires Google Calendar integration to be set up." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "ai-contact-relationship",
        icon: ShieldCheck,
        title: "Contact relationship summary",
        summary: "AI overview of your history with each contact.",
        description:
          "When you open the Contact Sidebar for a sender, AI generates a short summary of your relationship history — how long you've been in contact, the nature of your exchanges, recent topics, and any recurring themes. This gives you quick context before replying, especially useful for contacts you haven't heard from in a while or when preparing for a conversation.",
        tips: [
          { text: "Open the Contact Sidebar by clicking a sender's name or avatar." },
          { text: "The relationship summary loads automatically when the sidebar opens." },
          { text: "Summary covers interaction history, common topics, and patterns." },
          { text: "Toggle contact relationship summary in Settings > AI." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "ai-feature-toggles",
        icon: SlidersHorizontal,
        title: "AI feature toggles",
        summary: "Enable or disable each AI feature individually.",
        description:
          "Settings > AI includes individual on/off toggles for all seven AI features: proofread before send, urgency scoring, inbox digest, meeting detection, auto task extraction, contact relationship summary, and filter suggestions. Each feature defaults to a sensible setting (most are on; urgency scoring and auto task extraction default to off since they run during sync). Your choices persist across sessions.",
        tips: [
          { text: "Find all toggles in Settings > AI under 'AI Features'." },
          { text: "Urgency scoring and auto task extraction default to off (run during sync)." },
          { text: "All other AI features default to on." },
          { text: "Toggling a feature takes effect immediately — no restart needed." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "ai-agent-panel",
        icon: Bot,
        title: "AI Agent Panel",
        summary: "Autonomous AI assistant that can manage your inbox for you.",
        description:
          "The AI Agent Panel is a floating chat interface powered by Claude's tool-use API. Type a request in plain language — like \"Find all my subscriptions\" or \"Archive newsletters from last month\" — and the agent autonomously executes multi-step actions: finding subscriptions, unsubscribing, archiving threads, and searching emails. Three quick-start chips give you one-click access to the most common tasks. Tool execution progress is shown in real time so you can see exactly what the agent is doing.",
        tips: [
          { text: "Open AI Agent Panel", shortcut: "Ctrl+Shift+I" },
          { text: "The agent can unsubscribe from senders, archive threads, and search emails." },
          { text: "Quick-start chips: 'Find my subscriptions', 'What emails need my reply?', 'Give me an inbox summary'." },
          { text: "Tool execution progress is shown as the agent works." },
          { text: "Press Escape or click the backdrop to close the panel." },
          { text: "Requires Claude API key (Claude is the only supported provider for the agent)." },
        ],
        relatedSettingsTab: "ai",
      },
    ],
  },
  {
    id: "newsletters",
    label: "Newsletters & Subscriptions",
    icon: Newspaper,
    cards: [
      {
        id: "newsletter-bundles",
        icon: Newspaper,
        title: "Newsletter bundles",
        summary: "Group newsletters by sender with scheduled delivery.",
        description:
          "Bundle newsletters from the same sender so they arrive on a schedule you choose — daily, weekly, or on specific days. Instead of getting distracted by newsletters throughout the day, they're held and delivered in a batch. Each bundle groups all emails from that sender into a single sidebar entry. You can create bundles per-sender and set different delivery schedules for each.",
        tips: [
          { text: "Manage bundles in Settings > People." },
          { text: "Choose delivery frequency: daily, weekly, or specific days." },
          { text: "Bundled newsletters are held until the next delivery time." },
          { text: "Each sender can have its own delivery schedule." },
        ],
        relatedSettingsTab: "people",
      },
      {
        id: "unsubscribe",
        icon: MailMinus,
        title: "Unsubscribe",
        summary: "One-click unsubscribe from mailing lists.",
        description:
          "When viewing a newsletter or marketing email, click Unsubscribe (or press u) to instantly unsubscribe. The app detects the List-Unsubscribe header and handles the process automatically using the RFC 8058 one-click POST method when available, or falls back to a mailto: unsubscribe. Your unsubscribe actions are logged so you can track what you've unsubscribed from.",
        tips: [
          { text: "Unsubscribe from the current thread", shortcut: "u" },
          { text: "Uses RFC 8058 one-click unsubscribe when available." },
          { text: "Falls back to mailto: unsubscribe if one-click isn't supported." },
          { text: "View unsubscribe history in Settings > People." },
        ],
        relatedSettingsTab: "people",
      },
    ],
  },
  {
    id: "notifications-contacts",
    label: "Notifications & Contacts",
    icon: Bell,
    cards: [
      {
        id: "notifications-vip",
        icon: Bell,
        title: "Notifications & VIP senders",
        summary: "Desktop notifications with smart filtering.",
        description:
          "Get desktop notifications when new email arrives. Smart notifications let you choose which inbox categories trigger notifications (e.g., only Primary), reducing noise from updates and promotions. Add VIP senders who always trigger a notification regardless of category — useful for your boss, key clients, or family. Muted threads never trigger notifications. Notifications use your OS's native notification system.",
        tips: [
          { text: "Enable notifications in Settings > Notifications." },
          { text: "Smart notifications: choose which categories trigger alerts." },
          { text: "Add VIP senders who always notify regardless of category." },
          { text: "Muted threads never trigger notifications." },
          { text: "Uses your OS's native notification system (Windows, macOS, Linux)." },
        ],
        relatedSettingsTab: "notifications",
      },
      {
        id: "contact-sidebar",
        icon: Users,
        title: "Contact sidebar",
        summary: "View contact details, history, and quick actions.",
        description:
          "Click on a sender's name or avatar to open the contact sidebar. It shows their profile photo (via Gravatar), email address, how often you've emailed them, when you first connected, recent conversation threads, shared attachments, and quick actions (compose new email, copy address). The sidebar gives you context about who you're communicating with without leaving your inbox.",
        tips: [
          { text: "Click any sender name or avatar to open the contact sidebar." },
          { text: "Shows profile photo, email, contact frequency, and first contact date." },
          { text: "Quick actions: compose new email, copy address." },
          { text: "Browse recent shared threads and attachments." },
          { text: "Add notes about contacts for your own reference." },
        ],
        relatedSettingsTab: "people",
      },
    ],
  },
  {
    id: "security",
    label: "Security & Privacy",
    icon: Shield,
    cards: [
      {
        id: "phishing-detection",
        icon: AlertTriangle,
        title: "Phishing detection",
        summary: "Automatic scanning of email links for threats.",
        description:
          "Every email's links are scanned using 10 heuristic rules that detect common phishing patterns: IP-based URLs, homograph/punycode attacks, suspicious TLDs, URL shorteners, display text vs. actual URL mismatches, suspicious path patterns, brand name impersonation, dangerous protocols (javascript:, data:), free email addresses impersonating companies, and subdomain spoofing. Risky emails show a warning banner. You can adjust sensitivity (low, default, high) and allowlist trusted senders to suppress warnings.",
        tips: [
          { text: "Adjust sensitivity (low / default / high) in Settings." },
          { text: "Low: catches only obvious threats. High: more aggressive, may have false positives." },
          { text: "Allowlist trusted senders to suppress warnings for them." },
          { text: "10 heuristic rules cover common phishing patterns." },
          { text: "Warning banner appears at the top of risky emails." },
          { text: "Scan results are cached — each link is only analyzed once." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "auth-badges",
        icon: CheckCircle,
        title: "Authentication badges (SPF/DKIM/DMARC)",
        summary: "See if the sender's identity is verified.",
        description:
          "Each email displays an authentication badge showing whether the sender passed SPF (sender IP verification), DKIM (message signature), and DMARC (alignment policy) checks. A green badge means all checks passed — the email is genuinely from who it says it's from. A red badge indicates failed checks, which could mean the email is spoofed or forged. Orange means partial pass. This information is parsed from the email's Authentication-Results header.",
        tips: [
          { text: "Green badge: all authentication checks passed." },
          { text: "Red badge: one or more checks failed — possible spoofing." },
          { text: "Orange badge: partial pass — some checks inconclusive." },
          { text: "Click the badge to see detailed SPF, DKIM, and DMARC results." },
          { text: "Authentication data comes from the email's headers." },
        ],
      },
      {
        id: "remote-image-blocking",
        icon: ImageOff,
        title: "Remote image blocking",
        summary: "Block tracking pixels and remote images by default.",
        description:
          "Remote images (loaded from external servers) are blocked by default to protect your privacy. Many marketing emails use invisible tracking pixels that notify the sender when you open their email. When images are blocked, you'll see placeholder areas where images would be. You can allow images for specific senders (they're added to an allowlist), or disable blocking globally in Settings. Allowed senders' images load automatically on future emails.",
        tips: [
          { text: "Images are blocked by default for privacy protection." },
          { text: "Click \"Show images\" on an email to load images for that sender." },
          { text: "Allowed senders are remembered — images load automatically next time." },
          { text: "Disable blocking globally in Settings > General." },
          { text: "Blocks tracking pixels that report when you open an email." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "link-confirmation",
        icon: LinkIcon,
        title: "Link confirmation",
        summary: "Preview URLs before opening them in your browser.",
        description:
          "When you click a link in an email, a confirmation dialog shows the actual destination URL before opening it. This prevents you from accidentally visiting malicious sites that disguise their URLs with friendly display text. The dialog shows the full URL so you can verify it looks legitimate. You can choose to proceed, copy the URL, or cancel. This is especially useful combined with the phishing detection feature.",
        tips: [
          { text: "Every link click shows a confirmation with the actual URL." },
          { text: "Verify the domain looks legitimate before proceeding." },
          { text: "Copy the URL to inspect it more closely if unsure." },
          { text: "Works together with phishing detection for layered protection." },
        ],
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: Calendar,
    cards: [
      {
        id: "calendar-integration",
        icon: Calendar,
        title: "Google Calendar integration",
        summary: "View and manage your calendar alongside email.",
        description:
          "Access your Google Calendar directly from the sidebar. Switch between day, week, and month views. See all your events with color-coded calendar support (if you have multiple Google calendars). Create new events directly from the app without switching to a browser. The calendar uses the same Google account as your email and refreshes automatically. Navigate between dates with the toolbar controls.",
        tips: [
          { text: "Open Calendar from the sidebar navigation." },
          { text: "Switch between Day, Week, and Month views from the toolbar." },
          { text: "Click on a time slot to create a new event." },
          { text: "Supports multiple Google calendars with color coding." },
          { text: "Calendar uses the same Google OAuth as your email." },
          { text: "Events refresh automatically in the background." },
        ],
      },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    cards: [
      {
        id: "task-manager",
        icon: ListTodo,
        title: "Task manager",
        summary: "Full task management with priorities, due dates, and subtasks.",
        description:
          "Velo includes a built-in task manager accessible from the sidebar or via the g then k shortcut. Create tasks with titles, descriptions, priorities (none, low, medium, high, urgent), due dates, and tags. Tasks can have one level of subtasks for breaking down complex items. Drag to reorder tasks, filter by status or priority, and group by priority, due date, or tag. Completed tasks can be shown or hidden. The task sidebar panel shows tasks linked to the current email thread.",
        tips: [
          { text: "Go to Tasks page", shortcut: "g k" },
          { text: "Open tasks from the Tasks item in the sidebar." },
          { text: "Quick-add a task from the input at the bottom of the task sidebar." },
          { text: "The sidebar badge shows your incomplete task count." },
          { text: "Filter tasks by status (all, active, completed) or priority." },
          { text: "Group tasks by priority, due date, or tag." },
        ],
      },
      {
        id: "ai-task-extraction",
        icon: Sparkles,
        title: "AI task extraction",
        summary: "Press t to extract a task from the current email with AI.",
        description:
          "When viewing an email thread, press t to have AI analyze the conversation and extract an actionable task. The AI identifies the task title, description, suggested due date, and priority from the email content. A dialog shows the extracted task with editable fields — adjust the title, description, priority, or due date before creating. The task is linked to the email thread so you can always jump back to the original context. Also available from the command palette as 'Create Task from Email (AI)'.",
        tips: [
          { text: "Extract task from email", shortcut: "t" },
          { text: "Also available in the command palette (Ctrl+K → 'Create Task from Email')." },
          { text: "Edit the extracted fields before creating the task." },
          { text: "The task links back to the original email thread." },
          { text: "Requires an active AI provider (Claude, GPT, or Gemini)." },
        ],
        relatedSettingsTab: "ai",
      },
      {
        id: "task-sidebar",
        icon: ListTodo,
        title: "Task sidebar panel",
        summary: "View and manage tasks linked to the current thread.",
        description:
          "Toggle the task sidebar panel from the action bar (ListTodo icon) to see tasks associated with the current email thread. The panel shows linked tasks with their status, priority, and due date. You can quickly add new tasks from the panel, toggle completion, or click through to the full Tasks page. Tasks created via AI extraction are automatically linked to their source thread.",
        tips: [
          { text: "Toggle the task panel from the action bar button." },
          { text: "Quick-add tasks with the input at the bottom of the panel." },
          { text: "Click 'View all tasks' to go to the full Tasks page." },
          { text: "AI-extracted tasks are automatically linked to the email." },
        ],
      },
      {
        id: "recurring-tasks",
        icon: Repeat,
        title: "Recurring tasks",
        summary: "Tasks that automatically repeat on a schedule.",
        description:
          "Create tasks that recur on a schedule — daily, weekly, monthly, or yearly with configurable intervals. When you complete a recurring task, the next occurrence is automatically created with the due date advanced by the recurrence interval. This is useful for regular reviews, weekly reports, monthly check-ins, or any repeating responsibility. The recurrence icon appears on tasks that have a schedule set.",
        tips: [
          { text: "Set recurrence when creating or editing a task." },
          { text: "Options: daily, weekly, monthly, yearly with interval." },
          { text: "Completing a recurring task creates the next occurrence." },
          { text: "The recurrence icon indicates a task has a schedule." },
        ],
      },
    ],
  },
  {
    id: "appearance",
    label: "Appearance & Layout",
    icon: Palette,
    cards: [
      {
        id: "theme",
        icon: Sun,
        title: "Light & dark mode",
        summary: "Switch between light, dark, or system theme.",
        description:
          "Choose between light mode, dark mode, or system-matched (follows your OS setting). Dark mode uses carefully chosen colors for comfortable reading in low-light environments, with a darker background and softer text. The theme switches instantly and persists across restarts. The animated gradient background also adapts — light mode uses blues/purples/pinks, dark mode uses deeper blues and purples.",
        tips: [
          { text: "Change theme in Settings > General." },
          { text: "\"System\" follows your OS light/dark preference." },
          { text: "Dark mode is optimized for low-light environments." },
          { text: "The animated background gradient adapts to light/dark mode." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "accent-colors",
        icon: Palette,
        title: "Accent colors",
        summary: "8 color presets to personalize the app.",
        description:
          "Choose from 8 accent color presets to personalize the look of the app: Indigo (default), Rose, Emerald, Amber, Sky, Violet, Orange, or Slate. Each preset has separate light and dark mode variants that are optimized for readability. The accent color is used for buttons, active states, links, badges, and highlights throughout the app. Accent colors are independent of the light/dark theme.",
        tips: [
          { text: "Change accent color in Settings > General." },
          { text: "8 presets: Indigo, Rose, Emerald, Amber, Sky, Violet, Orange, Slate." },
          { text: "Each color has optimized light and dark variants." },
          { text: "Accent color is independent of light/dark theme." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "font-density",
        icon: Type,
        title: "Font size & email density",
        summary: "Adjust text size and list spacing.",
        description:
          "Font scale adjusts the overall text size across the app: Small, Default, Large, or Extra Large. Email density controls the spacing in the email list: Compact (more threads visible), Default (balanced), or Comfortable (more breathing room). Both settings combine — use large font with comfortable density for accessibility, or small font with compact density to see more at once.",
        tips: [
          { text: "Font sizes: Small, Default, Large, Extra Large." },
          { text: "Density options: Compact, Default, Comfortable." },
          { text: "Compact density shows more threads in the email list." },
          { text: "Large font + Comfortable density is great for accessibility." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "layout-customization",
        icon: Columns2,
        title: "Layout customization",
        summary: "Adjust sidebar, reading pane, and list width.",
        description:
          "Customize your workspace layout: collapse the sidebar to icon-only mode for more screen space, choose the reading pane position (right, bottom, or hidden), drag the divider to resize the email list width, and toggle the contact sidebar. All layout preferences are saved and restored automatically on startup. The sidebar toggle also has a keyboard shortcut for quick access.",
        tips: [
          { text: "Toggle sidebar", shortcut: "Ctrl+Shift+E" },
          { text: "Collapse sidebar to icons-only for more screen space." },
          { text: "Drag the list/pane divider to adjust widths." },
          { text: "All layout preferences persist across restarts." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "sidebar-customization",
        icon: Layout,
        title: "Sidebar customization",
        summary: "Hide, show, and reorder sidebar navigation items.",
        description:
          "Control which items appear in your sidebar and their order. Go to Settings > General > Sidebar to toggle visibility of any navigation item (Starred, Snoozed, Sent, Drafts, Trash, Spam, All Mail, Tasks, Calendar, Attachments) and reorder them with up/down arrows. You can also hide the Smart Folders and Labels sections entirely. Inbox is always visible and cannot be hidden. Use \"Reset to defaults\" to restore the original layout. Changes take effect immediately and persist across restarts.",
        tips: [
          { text: "Hide items you rarely use to reduce sidebar clutter." },
          { text: "Reorder items to put your most-used folders on top." },
          { text: "Toggle off Smart Folders or Labels to hide those sections." },
          { text: "Inbox is always visible — it cannot be hidden." },
          { text: "Click \"Reset to defaults\" to restore the original order." },
        ],
        relatedSettingsTab: "general",
      },
    ],
  },
  {
    id: "accounts-system",
    label: "Accounts & System",
    icon: UserCircle,
    cards: [
      {
        id: "multi-account",
        icon: Users,
        title: "Multiple accounts",
        summary: "Manage Gmail and IMAP accounts side by side.",
        description:
          "Add and manage multiple email accounts — mix Gmail (OAuth) and IMAP/SMTP accounts freely. Each account has its own inbox, labels, filters, and sync state. Switch between accounts using the account switcher at the top of the sidebar. The active account's email is displayed in the main view. You can add, re-authorize, or remove accounts in Settings. Each account syncs independently on its own 60-second cycle.",
        tips: [
          { text: "Click the account switcher at the top of the sidebar to switch." },
          { text: "Mix Gmail and IMAP accounts — they work side by side." },
          { text: "Each account has independent inbox, labels, and sync." },
          { text: "Add or remove accounts in Settings > Accounts." },
          { text: "Re-authorize a Gmail account if the token expires." },
        ],
        relatedSettingsTab: "accounts",
      },
      {
        id: "system-tray",
        icon: Minimize2,
        title: "System tray & autostart",
        summary: "Minimize to tray and launch on startup.",
        description:
          "When you close the app window, it minimizes to the system tray instead of quitting — the app stays running in the background, continuing to sync email and check for notifications. Click the tray icon to show the window again, right-click for a menu (show, check mail, quit). Enable autostart to launch the app automatically when your computer starts — it starts minimized to the tray so it's ready without cluttering your taskbar.",
        tips: [
          { text: "Closing the window minimizes to tray (doesn't quit)." },
          { text: "Right-click the tray icon for: Show, Check Mail, Quit." },
          { text: "Enable autostart in Settings > General." },
          { text: "Autostart launches minimized — the app is ready in the background." },
          { text: "The app continues syncing and notifying while in the tray." },
        ],
        relatedSettingsTab: "general",
      },
      {
        id: "global-compose",
        icon: Monitor,
        title: "Global compose shortcut",
        summary: "Compose from anywhere with a system-wide shortcut.",
        description:
          "Register a system-wide keyboard shortcut that opens the compose window from anywhere on your computer — even when the app is minimized to the tray or another app is focused. This lets you quickly fire off an email without switching windows. The shortcut is customizable in Settings > Shortcuts. The app window will appear with the composer open and ready.",
        tips: [
          { text: "Set the global compose shortcut in Settings > Shortcuts." },
          { text: "Works even when the app is minimized to the tray." },
          { text: "The compose window opens immediately when the shortcut is pressed." },
          { text: "Works from any application — no need to switch to the app first." },
        ],
        relatedSettingsTab: "shortcuts",
      },
      {
        id: "pop-out-windows",
        icon: ExternalLink,
        title: "Pop-out windows",
        summary: "Open threads in separate windows.",
        description:
          "Open any thread in its own independent window for side-by-side reading, reference, or multi-tasking. Pop-out windows have their own thread view with full functionality — you can read, reply, forward, and take actions without going back to the main window. Each pop-out window is 800x700 pixels by default and can be resized. Multiple threads can be popped out simultaneously.",
        tips: [
          { text: "Click the pop-out icon in the thread action bar." },
          { text: "Pop-out windows are fully functional — read, reply, and act." },
          { text: "Multiple threads can be open in separate windows." },
          { text: "Pop-out windows are independent of the main app window." },
        ],
      },
      {
        id: "manual-sync",
        icon: RefreshCw,
        title: "Manual sync",
        summary: "Trigger an immediate sync of the current folder.",
        description:
          "Press F5 to immediately sync the current folder or label instead of waiting for the next 60-second background sync cycle. This is useful when you're expecting an email and don't want to wait, or after making changes in another client. For Gmail, this fetches new history changes; for IMAP, it checks for new UIDs in the current folder.",
        tips: [
          { text: "Sync current folder", shortcut: "F5" },
          { text: "Background sync runs every 60 seconds automatically." },
          { text: "Manual sync is useful when you're expecting a new email." },
        ],
      },
      {
        id: "offline-mode",
        icon: WifiOff,
        title: "Offline mode",
        summary: "Keep working without an internet connection.",
        description:
          "Archive, star, trash, move, label, and compose emails even when you're offline. Changes are queued locally and sync automatically when your connection returns. A banner appears at the top of the screen when you're offline, and the sidebar shows how many operations are pending. Redundant actions (like starring then unstarring) are automatically compacted so only the final result syncs.",
        tips: [
          { text: "All actions work offline — archive, star, trash, labels, compose." },
          { text: "Pending changes sync automatically when you reconnect." },
          { text: "Check pending and failed operations in Settings > Accounts." },
          { text: "Failed operations can be retried or cleared from Settings." },
        ],
        relatedSettingsTab: "accounts",
      },
    ],
  },
];

// ---------- Contextual Tips ----------

export const CONTEXTUAL_TIPS: Record<string, ContextualTip> = {
  "reading-pane": {
    title: "Reading pane",
    body: "Choose where to display the reading pane — right, bottom, or hidden. Right works best on wide screens.",
    helpTopic: "reading-email",
  },
  "split-inbox": {
    title: "Split inbox",
    body: "Divide your inbox into categories (Primary, Updates, Promotions, Social, Newsletters) so you can focus on what matters most.",
    helpTopic: "productivity",
  },
  "undo-send": {
    title: "Undo send",
    body: "Set how many seconds you have to undo a sent email. You can choose up to 30 seconds.",
    helpTopic: "composing",
  },
  "smart-notifications": {
    title: "Smart notifications",
    body: "Only get notified for the categories you care about. Add VIP senders who always trigger notifications regardless of category.",
    helpTopic: "notifications-contacts",
  },
  "phishing-sensitivity": {
    title: "Phishing sensitivity",
    body: "Low catches only obvious threats. Default is balanced. High flags more aggressively but may have false positives.",
    helpTopic: "security",
  },
  "ai-provider": {
    title: "AI provider",
    body: "Choose between Claude, OpenAI, or Gemini. Bring your own API key — your data is sent directly to the provider, never through a middleman.",
    helpTopic: "ai-features",
  },
  "search-operators": {
    title: "Search operators",
    body: "Use from:, to:, subject:, has:attachment, is:unread, before:, after:, and label: to narrow your search.",
    helpTopic: "search-navigation",
  },
  "filters": {
    title: "Automatic filters",
    body: "Filters run on every new message during sync. Criteria use AND logic, and when multiple filters match, their actions are merged.",
    helpTopic: "organization",
  },
  "smart-labels": {
    title: "Smart labels",
    body: "Describe what emails should get a label in plain English. AI auto-labels matching emails during sync. Optional criteria provide instant matching without AI.",
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
