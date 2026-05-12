import { escapeHtml } from "@/utils/sanitize";
import { getContactById } from "@/services/db/contacts";
import { getDb } from "@/services/db/connection";

export interface CampaignVariableSource {
  contactId: string;
  accountId: string;
}

const GREETINGS: Record<string, string[]> = {
  en: ["Hello", "Hi", "Hey", "Greetings"],
  fr: ["Bonjour", "Salut", "Coucou"],
  de: ["Hallo", "Hallo", "Guten Tag"],
  es: ["Hola", "Buenos días"],
  zh: ["您好", "你好"],
  ja: ["こんにちは"],
  ar: ["مرحبا", "أهلا"],
  pt: ["Olá", "Oi"],
  it: ["Ciao", "Buongiorno"],
  nl: ["Hallo", "Hoi"],
};

function getGreetings(locale: string): string[] {
  const lang = locale.split("-")[0] ?? "en";
  return GREETINGS[lang] ?? GREETINGS["en"]!;
}

async function getMyName(accountId: string): Promise<string> {
  const db = await getDb();
  const row = await db.select<{ display_name: string | null }[]>(
    "SELECT display_name FROM accounts WHERE id = $1",
    [accountId],
  );
  return row[0]?.display_name ?? "";
}

async function getMyTitle(accountId: string): Promise<string> {
  const db = await getDb();
  const row = await db.select<{ value: string | null }[]>(
    "SELECT value FROM settings WHERE key = 'my_title'",
  );
  if (row[0]?.value) return row[0].value;
  const acc = await db.select<{ my_title: string | null }[]>(
    "SELECT my_title FROM accounts WHERE id = $1",
    [accountId],
  );
  return acc[0]?.my_title ?? "";
}

async function getMyPhone(accountId: string): Promise<string> {
  const db = await getDb();
  const row = await db.select<{ value: string | null }[]>(
    "SELECT value FROM settings WHERE key = 'my_phone'",
  );
  if (row[0]?.value) return row[0].value;
  const acc = await db.select<{ my_phone: string | null }[]>(
    "SELECT my_phone FROM accounts WHERE id = $1",
    [accountId],
  );
  return acc[0]?.my_phone ?? "";
}

function getDateShort(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    month: "long", day: "numeric", year: "numeric",
  });
}

function getDateLong(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function getDayOfWeek(locale: string): string {
  return new Date().toLocaleDateString(locale, { weekday: "long" });
}

export async function resolveCampaignVariables(
  template: string,
  source: CampaignVariableSource,
): Promise<string> {
  if (!template.includes("{{")) return template;

  const contact = await getContactById(source.contactId);

  let result = template;

  const email = contact?.email ?? "";
  const displayName = contact?.display_name ?? "";
  const firstName = displayName.split(/\s+/)[0] ?? email.split("@")[0] ?? "";
  const company = email.includes("@") ? email.split("@")[1]?.split(".")[0] ?? "" : "";

  const [myName, myTitle, myPhone] = await Promise.all([
    getMyName(source.accountId),
    getMyTitle(source.accountId),
    getMyPhone(source.accountId),
  ]);

  const locale = navigator?.language ?? "en";
  const dateStr = getDateShort(locale);
  const dateLongStr = getDateLong(locale);
  const dayOfWeek = getDayOfWeek(locale);
  const greetings = getGreetings(locale);
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)] ?? "Hello";

  const replacements: Record<string, string> = {
    "{{email}}": email,
    "{{first_name}}": firstName,
    "{{company}}": company,
    "{{display_name}}": displayName,
    "{{my_name}}": myName,
    "{{my_title}}": myTitle,
    "{{my_phone}}": myPhone,
    "{{date}}": dateStr,
    "{{date_long}}": dateLongStr,
    "{{day_of_week}}": dayOfWeek,
    "{{random_greeting}}": randomGreeting,
  };

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, escapeHtml(value));
  }

  return result;
}

export function evaluateConditionalBlocks(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;

  const blockRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

  result = result.replace(blockRegex, (_match, varName, ifBlock, elseBlock) => {
    const value = vars[varName];
    if (value && value.trim().length > 0) {
      return ifBlock ?? "";
    }
    return elseBlock ?? "";
  });

  return result;
}
