export interface ExportedTemplate {
  version: number;
  name: string;
  subject: string | null;
  body_html: string;
  shortcut: string | null;
  category_name: string | null;
  conditional_blocks_json: string | null;
}

export function exportTemplateToJson(template: {
  name: string;
  subject: string | null;
  body_html: string;
  shortcut: string | null;
  categoryName?: string | null;
  conditional_blocks_json?: string | null;
}): string {
  const exported: ExportedTemplate = {
    version: 1,
    name: template.name,
    subject: template.subject,
    body_html: template.body_html,
    shortcut: template.shortcut,
    category_name: template.categoryName ?? null,
    conditional_blocks_json: template.conditional_blocks_json ?? null,
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
