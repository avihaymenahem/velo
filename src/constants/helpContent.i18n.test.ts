import { describe, expect, it, beforeEach } from "vitest";
import i18n from "@/i18n";
import {
  CONTEXTUAL_TIPS,
  HELP_CATEGORIES,
  localizeContextualTips,
  localizeHelpCategories,
} from "./helpContent";

function translate(key: string, defaultValue: string): string {
  return i18n.t(key, { ns: "help", defaultValue });
}

describe("help content i18n", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("localizes help category labels and getting-started card content", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const gettingStarted = categories.find((category) => category.id === "getting-started");

    expect(gettingStarted?.label).toBe("快速开始");
    expect(categories.find((category) => category.id === "organization")?.label).toBe("整理邮件");

    const addAccount = gettingStarted?.cards.find((card) => card.id === "add-account");
    expect(addAccount?.title).toBe("添加邮箱账户");
    expect(addAccount?.summary).toBe("连接 Gmail 或 IMAP/SMTP 账户，开始使用 Kirje。");
    expect(addAccount?.description).toContain("账户切换器");
    expect(addAccount?.tips?.[0]?.text).toBe("账户切换器始终位于侧边栏顶部。");

    const clientIdSetup = gettingStarted?.cards.find((card) => card.id === "client-id-setup");
    expect(clientIdSetup?.title).toBe("Google 客户端 ID 设置");
    expect(clientIdSetup?.description).toContain("生成 OAuth 客户端 ID");
    expect(clientIdSetup?.description).toContain("不需要客户端密钥");
    expect(clientIdSetup?.description).not.toContain("OAuth Client ID");
    expect(clientIdSetup?.tips?.[3]?.text).toBe("客户端 ID 只保存在本地，不会发送到外部服务器。");

    const imapSetup = gettingStarted?.cards.find((card) => card.id === "imap-smtp-setup");
    expect(imapSetup?.tips?.[1]?.text).toBe("Outlook/Hotmail 需要 OAuth2；请在 Azure Portal 注册应用获取客户端 ID。");
    expect(imapSetup?.tips?.[5]?.text).toBe("安全选项：SSL/TLS（最安全）、STARTTLS 或 无。");
    expect(imapSetup?.tips?.[5]?.text).not.toContain("None");

    const outlookSetup = gettingStarted?.cards.find((card) => card.id === "outlook-setup");
    expect(outlookSetup?.description).toContain("粘贴客户端 ID，客户端密钥留空");
    expect(outlookSetup?.description).not.toContain("粘贴 Client ID");
    expect(outlookSetup?.tips?.[4]?.text).toBe("客户端密钥可留空；桌面应用由 PKCE 保障安全。");
    expect(outlookSetup?.tips?.[9]?.text).toBe("令牌会自动刷新，之后不需要反复登录。");
    expect(outlookSetup?.tips?.[9]?.text).not.toContain("Token");
  });

  it("falls back to provided defaults when a help key is missing", () => {
    const categories = localizeHelpCategories(
      [
        {
          id: "missing-category",
          label: "Missing Category",
          icon: HELP_CATEGORIES[0].icon,
          cards: [
            {
              id: "missing-card",
              icon: HELP_CATEGORIES[0].cards[0].icon,
              title: "Fallback title",
              summary: "Fallback summary.",
              description: "Fallback description.",
              tips: [{ text: "Fallback tip." }],
            },
          ],
        },
      ],
      translate,
    );

    expect(categories[0]?.label).toBe("Missing Category");
    expect(categories[0]?.cards[0]?.title).toBe("Fallback title");
    expect(categories[0]?.cards[0]?.tips?.[0]?.text).toBe("Fallback tip.");
  });

  it("localizes reading email help cards", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const readingEmail = categories.find((category) => category.id === "reading-email");

    expect(readingEmail?.label).toBe("阅读邮件");

    const threadView = readingEmail?.cards.find((card) => card.id === "thread-view");
    expect(threadView?.title).toBe("线程视图");
    expect(threadView?.summary).toBe("把相关邮件按对话聚合。");
    expect(threadView?.description).toContain("自动归并为对话线程");
    expect(threadView?.tips?.[0]?.text).toBe("打开线程");

    const rawMessage = readingEmail?.cards.find((card) => card.id === "raw-message");
    expect(rawMessage?.title).toBe("查看原始邮件源码");
    expect(rawMessage?.tips?.[0]?.text).toBe("右键点击消息并选择“查看源码”。");
  });

  it("localizes composing help cards", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const composing = categories.find((category) => category.id === "composing");

    expect(composing?.label).toBe("写信与发送");

    const newEmail = composing?.cards.find((card) => card.id === "new-email");
    expect(newEmail?.title).toBe("写一封新邮件");
    expect(newEmail?.summary).toBe("带格式和附件的富文本编辑器。");
    expect(newEmail?.description).toContain("TipTap");
    expect(newEmail?.tips?.[0]?.text).toBe("打开写信窗口");

    const draftAutosave = composing?.cards.find((card) => card.id === "draft-autosave");
    expect(draftAutosave?.title).toBe("草稿自动保存");
    expect(draftAutosave?.tips?.[0]?.text).toBe("写信时草稿每 3 秒自动保存。");
  });

  it("localizes search and navigation help cards", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const searchNavigation = categories.find((category) => category.id === "search-navigation");

    expect(searchNavigation?.label).toBe("搜索与导航");

    const searchOperators = searchNavigation?.cards.find((card) => card.id === "search-operators");
    expect(searchOperators?.title).toBe("搜索运算符");
    expect(searchOperators?.summary).toBe("使用 Gmail 风格运算符细化搜索结果。");
    expect(searchOperators?.description).toContain("FTS5");
    expect(searchOperators?.tips?.[0]?.text).toBe("from:jane — 来自指定发件人的邮件");

    const commandPalette = searchNavigation?.cards.find((card) => card.id === "command-palette");
    expect(commandPalette?.title).toBe("命令菜单");
    expect(commandPalette?.tips?.[0]?.text).toBe("打开命令菜单");

    const keyboardShortcuts = searchNavigation?.cards.find((card) => card.id === "keyboard-shortcuts");
    expect(keyboardShortcuts?.title).toBe("键盘快捷键");
    expect(keyboardShortcuts?.tips?.at(-1)?.text).toBe("在文本输入区域中会禁用快捷键，避免冲突。");
  });

  it("localizes organization help cards", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const organization = categories.find((category) => category.id === "organization");

    expect(organization?.label).toBe("整理邮件");

    const expectedTitles = new Map([
      ["labels", "标签"],
      ["smart-folders", "智能文件夹"],
      ["filters", "过滤器与规则"],
      ["smart-labels", "智能标签"],
      ["quick-steps", "快捷步骤"],
      ["star-pin-mute", "星标、置顶与静音"],
      ["archive-trash", "归档与删除"],
      ["move-to-folder", "移动到文件夹"],
      ["multi-select", "多选与批量操作"],
      ["bulk-actions", "批量操作栏"],
      ["attachment-library", "附件库"],
      ["drag-drop", "拖放"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(organization?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const labels = organization?.cards.find((card) => card.id === "labels");
    expect(labels?.summary).toBe("用彩色标签整理邮件。");
    expect(labels?.tips?.[0]?.text).toBe("把线程拖放到侧边栏标签上即可应用标签。");

    const smartLabels = organization?.cards.find((card) => card.id === "smart-labels");
    expect(smartLabels?.description).toContain("自然语言");
    expect(smartLabels?.description).toContain("在交给 AI 判断前");
    expect(smartLabels?.description).not.toContain("AI fallback");
    expect(smartLabels?.tips?.at(-1)?.text).toBe("需要启用 AI 服务商（Claude、GPT 或 Gemini）。");

    const attachmentLibrary = organization?.cards.find((card) => card.id === "attachment-library");
    expect(attachmentLibrary?.tips?.[0]?.text).toBe("前往附件");
  });

  it("localizes productivity help cards", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const productivity = categories.find((category) => category.id === "productivity");

    expect(productivity?.label).toBe("效率工具");

    const expectedTitles = new Map([
      ["snooze", "稍后提醒"],
      ["follow-up-reminders", "跟进提醒"],
      ["split-inbox", "分类收件箱"],
      ["spam", "垃圾邮件"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(productivity?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const snooze = productivity?.cards.find((card) => card.id === "snooze");
    expect(snooze?.summary).toBe("暂时隐藏线程，并在稍后重新出现。");
    expect(snooze?.tips?.[0]?.text).toBe("点击线程操作栏中的稍后提醒图标。");

    const followUp = productivity?.cards.find((card) => card.id === "follow-up-reminders");
    expect(followUp?.description).toContain("后台每 60 秒检查一次");

    const splitInbox = productivity?.cards.find((card) => card.id === "split-inbox");
    expect(splitInbox?.description).toContain("规则后备判断");
    expect(splitInbox?.description).not.toContain("规则 fallback");

    const spam = productivity?.cards.find((card) => card.id === "spam");
    expect(spam?.tips?.[0]?.text).toBe("标为垃圾邮件 / 不是垃圾邮件");
  });

  it("localizes AI features help cards with trust boundaries", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const aiFeatures = categories.find((category) => category.id === "ai-features");

    expect(aiFeatures?.label).toBe("AI 功能");

    const expectedTitles = new Map([
      ["ai-overview", "AI 概览"],
      ["thread-summaries", "线程摘要"],
      ["smart-replies", "智能回复"],
      ["ai-compose", "AI 写信与改写"],
      ["auto-drafts", "AI 自动草拟回复"],
      ["ask-inbox", "Ask Inbox"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(aiFeatures?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const overview = aiFeatures?.cards.find((card) => card.id === "ai-overview");
    expect(overview?.summary).toBe("选择 AI 服务商，并使用你自己的 API 密钥。");
    expect(overview?.description).toContain("没有中间服务器");
    expect(overview?.description).toContain("API 密钥会安全地保存在本地数据库中");
    expect(overview?.description).not.toContain("API key");
    expect(overview?.tips?.[0]?.text).toBe("在设置 > AI 中添加你的 API 密钥。");
    expect(overview?.tips?.[3]?.text).toBe("你的数据会直接发送到服务商 API，没有中间服务器。");

    const smartReplies = aiFeatures?.cards.find((card) => card.id === "smart-replies");
    expect(smartReplies?.tips?.[2]?.text).toBe("发送前先编辑建议内容；它只是起点，不是最终回复。");

    const autoDrafts = aiFeatures?.cards.find((card) => card.id === "auto-drafts");
    expect(autoDrafts?.description).toContain("如果你在草稿加载前开始输入");
  });

  it("localizes newsletters and subscriptions help cards", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const newsletters = categories.find((category) => category.id === "newsletters");

    expect(newsletters?.label).toBe("订阅与通讯");

    const expectedTitles = new Map([
      ["newsletter-bundles", "通讯捆绑"],
      ["unsubscribe", "取消订阅"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(newsletters?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const bundles = newsletters?.cards.find((card) => card.id === "newsletter-bundles");
    expect(bundles?.description).toContain("按你选择的计划投递");
    expect(bundles?.tips?.[0]?.text).toBe("在设置 > 联系人中管理通讯捆绑。");

    const unsubscribe = newsletters?.cards.find((card) => card.id === "unsubscribe");
    expect(unsubscribe?.description).toContain("RFC 8058");
    expect(unsubscribe?.tips?.[0]?.text).toBe("取消当前线程订阅");
  });

  it("localizes notifications and contacts help cards", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const notificationsContacts = categories.find((category) => category.id === "notifications-contacts");

    expect(notificationsContacts?.label).toBe("通知与联系人");

    const expectedTitles = new Map([
      ["notifications-vip", "通知与 VIP 发件人"],
      ["contact-sidebar", "联系人侧栏"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(notificationsContacts?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const notifications = notificationsContacts?.cards.find((card) => card.id === "notifications-vip");
    expect(notifications?.description).toContain("VIP 发件人");
    expect(notifications?.tips?.[3]?.text).toBe("静音线程永远不会触发通知。");

    const contactSidebar = notificationsContacts?.cards.find((card) => card.id === "contact-sidebar");
    expect(contactSidebar?.description).toContain("不离开收件箱");
    expect(contactSidebar?.tips?.[2]?.text).toBe("快捷操作：写一封新邮件、复制地址。");
  });

  it("localizes security and privacy help cards with safety boundaries", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const security = categories.find((category) => category.id === "security");

    expect(security?.label).toBe("安全与隐私");

    const expectedTitles = new Map([
      ["phishing-detection", "钓鱼检测"],
      ["auth-badges", "认证徽章（SPF/DKIM/DMARC）"],
      ["remote-image-blocking", "远程图片阻止"],
      ["link-confirmation", "链接确认"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(security?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const phishing = security?.cards.find((card) => card.id === "phishing-detection");
    expect(phishing?.description).toContain("10 条启发式规则");
    expect(phishing?.tips?.[1]?.text).toContain("可能产生误报");

    const authBadges = security?.cards.find((card) => card.id === "auth-badges");
    expect(authBadges?.summary).toBe("查看发件人身份是否通过验证。");
    expect(authBadges?.tips?.[3]?.text).toBe("点击徽章可查看 SPF、DKIM 和 DMARC 的详细结果。");

    const remoteImages = security?.cards.find((card) => card.id === "remote-image-blocking");
    expect(remoteImages?.description).toContain("不可见的跟踪像素");

    const linkConfirmation = security?.cards.find((card) => card.id === "link-confirmation");
    expect(linkConfirmation?.tips?.[0]?.text).toBe("每次点击链接都会显示包含真实 URL 的确认窗口。");
  });

  it("localizes calendar help cards without overstating sync behavior", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const calendar = categories.find((category) => category.id === "calendar");

    expect(calendar?.label).toBe("日历");

    const integration = calendar?.cards.find((card) => card.id === "calendar-integration");
    expect(integration?.title).toBe("Google 日历集成");
    expect(integration?.summary).toBe("在邮件旁查看和管理日历。");
    expect(integration?.description).toContain("使用与你的邮件相同的 Google 账户");
    expect(integration?.tips?.[2]?.text).toBe("点击时间段即可创建新事件。");
    expect(integration?.tips?.[4]?.text).toBe("日历使用与你的邮件相同的 Google OAuth 授权。");
  });

  it("localizes tasks help cards with AI review boundaries", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const tasks = categories.find((category) => category.id === "tasks");

    expect(tasks?.label).toBe("任务");

    const expectedTitles = new Map([
      ["task-manager", "任务管理器"],
      ["ai-task-extraction", "AI 任务提取"],
      ["task-sidebar", "任务侧栏面板"],
      ["recurring-tasks", "重复任务"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(tasks?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const taskManager = tasks?.cards.find((card) => card.id === "task-manager");
    expect(taskManager?.summary).toBe("支持优先级、截止日期和子任务的完整任务管理。");
    expect(taskManager?.tips?.[0]?.text).toBe("前往任务页面");

    const aiExtraction = tasks?.cards.find((card) => card.id === "ai-task-extraction");
    expect(aiExtraction?.description).toContain("可编辑字段");
    expect(aiExtraction?.description).toContain("命令菜单中执行“从邮件创建任务（AI）”");
    expect(aiExtraction?.description).not.toContain("Create Task from Email");
    expect(aiExtraction?.tips?.[1]?.text).toBe("也可在命令菜单中使用（Ctrl+K → “从邮件创建任务”）。");
    expect(aiExtraction?.tips?.[2]?.text).toBe("创建任务前先编辑提取出的字段。");
    expect(aiExtraction?.tips?.[4]?.text).toBe("需要启用 AI 服务商（Claude、GPT 或 Gemini）。");

    const taskSidebar = tasks?.cards.find((card) => card.id === "task-sidebar");
    expect(taskSidebar?.description).toContain("关联到当前邮件线程");

    const recurring = tasks?.cards.find((card) => card.id === "recurring-tasks");
    expect(recurring?.description).toContain("完成一项重复任务时");
    expect(recurring?.tips?.[2]?.text).toBe("完成一项重复任务会创建下一次任务。");
  });

  it("localizes appearance and layout help cards with readability boundaries", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const appearance = categories.find((category) => category.id === "appearance");

    expect(appearance?.label).toBe("外观与布局");

    const expectedTitles = new Map([
      ["theme", "浅色与深色模式"],
      ["accent-colors", "强调色"],
      ["font-density", "字号与邮件密度"],
      ["layout-customization", "布局自定义"],
      ["sidebar-customization", "侧边栏自定义"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(appearance?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const theme = appearance?.cards.find((card) => card.id === "theme");
    expect(theme?.description).toContain("跟随操作系统设置");
    expect(theme?.tips?.[1]?.text).toBe("“系统”会跟随操作系统的浅色/深色偏好。");

    const accent = appearance?.cards.find((card) => card.id === "accent-colors");
    expect(accent?.description).toContain("8 个强调色预设");
    expect(accent?.description).toContain("靛蓝（默认）、玫瑰、翠绿、琥珀、天蓝、紫罗兰、橙色或石板灰");
    expect(accent?.description).not.toContain("Indigo");
    expect(accent?.description).not.toContain("Rose");
    expect(accent?.tips?.[1]?.text).toBe("8 个预设：靛蓝、玫瑰、翠绿、琥珀、天蓝、紫罗兰、橙色、石板灰。");

    const density = appearance?.cards.find((card) => card.id === "font-density");
    expect(density?.tips?.[2]?.text).toBe("紧凑密度会在邮件列表中显示更多线程。");

    const layout = appearance?.cards.find((card) => card.id === "layout-customization");
    expect(layout?.tips?.[0]?.text).toBe("切换侧边栏");

    const sidebar = appearance?.cards.find((card) => card.id === "sidebar-customization");
    expect(sidebar?.description).toContain("收件箱始终可见");
  });

  it("localizes accounts and system help cards with sync and offline boundaries", () => {
    const categories = localizeHelpCategories(HELP_CATEGORIES, translate);
    const accountsSystem = categories.find((category) => category.id === "accounts-system");

    expect(accountsSystem?.label).toBe("账户与系统");

    const expectedTitles = new Map([
      ["multi-account", "多账户"],
      ["system-tray", "系统托盘与开机启动"],
      ["global-compose", "全局写信快捷键"],
      ["pop-out-windows", "弹出窗口"],
      ["manual-sync", "手动同步"],
      ["offline-mode", "离线模式"],
    ]);

    for (const [cardId, title] of expectedTitles) {
      expect(accountsSystem?.cards.find((card) => card.id === cardId)?.title).toBe(title);
    }

    const multiAccount = accountsSystem?.cards.find((card) => card.id === "multi-account");
    expect(multiAccount?.description).toContain("每个账户都有独立的收件箱、标签、过滤器和同步状态");

    const tray = accountsSystem?.cards.find((card) => card.id === "system-tray");
    expect(tray?.description).toContain("保持在后台运行");

    const globalCompose = accountsSystem?.cards.find((card) => card.id === "global-compose");
    expect(globalCompose?.tips?.[0]?.text).toBe("在设置 > 快捷键中设置全局写信快捷键。");

    const popOut = accountsSystem?.cards.find((card) => card.id === "pop-out-windows");
    expect(popOut?.tips?.[1]?.text).toBe("弹出窗口功能完整，可以阅读、回复并执行操作。");

    const manualSync = accountsSystem?.cards.find((card) => card.id === "manual-sync");
    expect(manualSync?.description).toContain("当前文件夹或标签");
    expect(manualSync?.tips?.[1]?.text).toBe("后台同步会每 60 秒自动运行一次。");

    const offlineMode = accountsSystem?.cards.find((card) => card.id === "offline-mode");
    expect(offlineMode?.description).toContain("操作会在本地排队");
    expect(offlineMode?.tips?.[3]?.text).toBe("失败的操作可以在设置中重试或清除。");
  });

  it("localizes contextual help tips", () => {
    const tips = localizeContextualTips(CONTEXTUAL_TIPS, translate);

    expect(tips["reading-pane"]?.title).toBe("阅读面板");
    expect(tips["reading-pane"]?.body).toContain("右侧、底部或隐藏");
  });
});
