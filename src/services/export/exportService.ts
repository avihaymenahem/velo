import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/services/db/connection";

export type ExportFormat = "mbox" | "eml" | "pdf" | "zip";

export interface ExportOptions {
  accountId: string;
  format: ExportFormat;
  destinationPath: string;
  dateFrom?: number;
  dateTo?: number;
  includeAttachments: boolean;
  encryptBackup: boolean;
}

export interface BackupSchedule {
  id: string;
  account_id: string | null;
  name: string;
  format: string;
  cron_expression: string;
  destination_path: string | null;
  encrypt: number;
  is_enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
}

export async function getExportFormats(): Promise<string[]> {
  return invoke<string[]>("get_export_formats");
}

export async function validateExportConfig(
  format: string,
  destination: string,
): Promise<boolean> {
  return invoke<boolean>("validate_export_config", { format, destination });
}

export async function exportMessages(options: ExportOptions): Promise<void> {
  await validateExportConfig(options.format, options.destinationPath);

  const db = await getDb();

  let dateFilter = "";
  const params: unknown[] = [options.accountId];
  let idx = 2;

  if (options.dateFrom) {
    dateFilter += ` AND m.date >= $${idx++}`;
    params.push(options.dateFrom);
  }
  if (options.dateTo) {
    dateFilter += ` AND m.date <= $${idx++}`;
    params.push(options.dateTo);
  }

  const messages = await db.select<{
    id: string;
    from_address: string | null;
    date: number;
    subject: string | null;
    to_addresses: string | null;
    cc_addresses: string | null;
    body_text: string | null;
    body_html: string | null;
  }[]>(
    `SELECT m.id, m.from_address, m.date, m.subject, m.to_addresses,
            m.cc_addresses, m.body_text, m.body_html
     FROM messages m
     WHERE m.account_id = $1${dateFilter}
     ORDER BY m.date ASC`,
    params,
  );

  if (messages.length === 0) return;

  for (const msg of messages) {
    const rfc2822 = buildRfc2822(msg);
    const from = msg.from_address ?? "unknown";
    const date = msg.date ?? Math.floor(Date.now() / 1000);

    await invoke("append_to_mbox", {
      filePath: options.destinationPath,
      messageRfc2822: rfc2822,
      fromAddress: from,
      dateSeconds: date,
    });
  }
}

function buildRfc2822(msg: {
  id: string;
  from_address: string | null;
  date: number;
  subject: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  body_text: string | null;
  body_html: string | null;
}): string {
  const dateStr = new Date((msg.date ?? 0) * 1000).toUTCString();
  const lines: string[] = [];

  lines.push(`Message-ID: <${msg.id}>`);
  if (msg.from_address) lines.push(`From: ${msg.from_address}`);
  if (msg.to_addresses) lines.push(`To: ${msg.to_addresses}`);
  if (msg.cc_addresses) lines.push(`Cc: ${msg.cc_addresses}`);
  lines.push(`Date: ${dateStr}`);
  lines.push(`Subject: ${msg.subject ?? "(No Subject)"}`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: 8bit");
  lines.push("");
  lines.push(msg.body_text || msg.body_html || "");

  return lines.join("\r\n");
}

export async function scheduleBackup(schedule: {
  accountId: string;
  name: string;
  format: string;
  cronExpression: string;
  destinationPath: string;
  encrypt: boolean;
}): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO backup_schedules (id, account_id, name, format, cron_expression, destination_path, encrypt)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      schedule.accountId,
      schedule.name,
      schedule.format,
      schedule.cronExpression,
      schedule.destinationPath,
      schedule.encrypt ? 1 : 0,
    ],
  );
}

export async function getSchedules(accountId: string): Promise<BackupSchedule[]> {
  const db = await getDb();
  return db.select<BackupSchedule[]>(
    `SELECT * FROM backup_schedules WHERE account_id = $1 ORDER BY created_at DESC`,
    [accountId],
  );
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE backup_schedules SET is_enabled = $1 WHERE id = $2",
    [enabled ? 1 : 0, id],
  );
}

export async function updateSchedule(
  id: string,
  updates: {
    name?: string;
    format?: string;
    cronExpression?: string;
    destinationPath?: string;
    encrypt?: boolean;
  },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(updates.name);
  }
  if (updates.format !== undefined) {
    sets.push(`format = $${idx++}`);
    params.push(updates.format);
  }
  if (updates.cronExpression !== undefined) {
    sets.push(`cron_expression = $${idx++}`);
    params.push(updates.cronExpression);
  }
  if (updates.destinationPath !== undefined) {
    sets.push(`destination_path = $${idx++}`);
    params.push(updates.destinationPath);
  }
  if (updates.encrypt !== undefined) {
    sets.push(`encrypt = $${idx++}`);
    params.push(updates.encrypt ? 1 : 0);
  }
  if (sets.length === 0) return;

  params.push(id);
  await db.execute(
    `UPDATE backup_schedules SET ${sets.join(", ")} WHERE id = $${idx}`,
    params,
  );
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM backup_schedules WHERE id = $1", [id]);
}

export async function runBackupNow(scheduleId: string): Promise<void> {
  const db = await getDb();
  const schedules = await db.select<BackupSchedule[]>(
    "SELECT * FROM backup_schedules WHERE id = $1",
    [scheduleId],
  );
  const schedule = schedules[0];
  if (!schedule) throw new Error("Schedule not found");

  await exportMessages({
    accountId: schedule.account_id ?? "",
    format: schedule.format as ExportFormat,
    destinationPath: schedule.destination_path ?? "",
    includeAttachments: true,
    encryptBackup: schedule.encrypt === 1,
  });

  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    "UPDATE backup_schedules SET last_run_at = $1 WHERE id = $2",
    [now, scheduleId],
  );
}
