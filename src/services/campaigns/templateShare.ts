export interface ExportedTemplate {
  version: number;
  name: string;
  subject: string | null;
  body_html: string;
  shortcut: string | null;
  category_name: string | null;
  conditional_blocks_json: string | null;
  usage_count?: number;
  last_used_at?: number | null;
  created_at?: number;
  exported_at?: number;
}

export function exportTemplateToJson(template: {
  name: string;
  subject: string | null;
  body_html: string;
  shortcut: string | null;
  categoryName?: string | null;
  conditional_blocks_json?: string | null;
  usageCount?: number;
  lastUsedAt?: number | null;
  createdAt?: number;
}): string {
  const exported: ExportedTemplate = {
    version: 2,
    name: template.name,
    subject: template.subject,
    body_html: template.body_html,
    shortcut: template.shortcut,
    category_name: template.categoryName ?? null,
    conditional_blocks_json: template.conditional_blocks_json ?? null,
    usage_count: template.usageCount ?? 0,
    last_used_at: template.lastUsedAt ?? null,
    created_at: template.createdAt ?? Date.now(),
    exported_at: Date.now(),
  };
  return JSON.stringify(exported, null, 2);
}

export function parseImportedTemplate(json: string): ExportedTemplate | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.version !== "number" ||
      typeof parsed.name !== "string" ||
      typeof parsed.body_html !== "string"
    ) {
      return null;
    }
    return {
      version: parsed.version,
      name: parsed.name,
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      body_html: parsed.body_html,
      shortcut: typeof parsed.shortcut === "string" ? parsed.shortcut : null,
      category_name: typeof parsed.category_name === "string" ? parsed.category_name : null,
      conditional_blocks_json: typeof parsed.conditional_blocks_json === "string" ? parsed.conditional_blocks_json : null,
      usage_count: typeof parsed.usage_count === "number" ? parsed.usage_count : undefined,
      last_used_at: parsed.last_used_at ?? undefined,
      created_at: typeof parsed.created_at === "number" ? parsed.created_at : undefined,
      exported_at: typeof parsed.exported_at === "number" ? parsed.exported_at : undefined,
    };
  } catch {
    return null;
  }
}

export function importFromFile(file: File): Promise<ExportedTemplate | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(parseImportedTemplate(text));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function toExportableJson(parsed: ExportedTemplate): string {
  return JSON.stringify(parsed, null, 2);
}
