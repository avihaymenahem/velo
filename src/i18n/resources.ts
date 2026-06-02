import enCommon from "./locales/en/common.json";
import enSettings from "./locales/en/settings.json";
import enSidebar from "./locales/en/sidebar.json";
import enEmail from "./locales/en/email.json";
import enSearch from "./locales/en/search.json";
import enComposer from "./locales/en/composer.json";
import enAgentic from "./locales/en/agentic.json";
import enAccounts from "./locales/en/accounts.json";
import enAttachments from "./locales/en/attachments.json";
import enCalendar from "./locales/en/calendar.json";
import enTasks from "./locales/en/tasks.json";
import enHelp from "./locales/en/help.json";
import zhCommon from "./locales/zh-CN/common.json";
import zhSettings from "./locales/zh-CN/settings.json";
import zhSidebar from "./locales/zh-CN/sidebar.json";
import zhEmail from "./locales/zh-CN/email.json";
import zhSearch from "./locales/zh-CN/search.json";
import zhComposer from "./locales/zh-CN/composer.json";
import zhAgentic from "./locales/zh-CN/agentic.json";
import zhAccounts from "./locales/zh-CN/accounts.json";
import zhAttachments from "./locales/zh-CN/attachments.json";
import zhCalendar from "./locales/zh-CN/calendar.json";
import zhTasks from "./locales/zh-CN/tasks.json";
import zhHelp from "./locales/zh-CN/help.json";

export const namespaces = [
  "common",
  "settings",
  "sidebar",
  "email",
  "search",
  "composer",
  "agentic",
  "accounts",
  "attachments",
  "calendar",
  "tasks",
  "help",
] as const;
export const defaultNamespace = "common";

export const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    sidebar: enSidebar,
    email: enEmail,
    search: enSearch,
    composer: enComposer,
    agentic: enAgentic,
    accounts: enAccounts,
    attachments: enAttachments,
    calendar: enCalendar,
    tasks: enTasks,
    help: enHelp,
  },
  "zh-CN": {
    common: zhCommon,
    settings: zhSettings,
    sidebar: zhSidebar,
    email: zhEmail,
    search: zhSearch,
    composer: zhComposer,
    agentic: zhAgentic,
    accounts: zhAccounts,
    attachments: zhAttachments,
    calendar: zhCalendar,
    tasks: zhTasks,
    help: zhHelp,
  },
} as const;

export type I18nNamespace = (typeof namespaces)[number];
