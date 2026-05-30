import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { getAccount, type DbAccount } from "@/services/db/accounts";
import { t } from "@/i18n";
import {
  getCalendarsForAccount,
  setCalendarVisibility,
  calColor,
  calDisplayName,
  type DbCalendar,
} from "@/services/db/calendars";
import { getSetting } from "@/services/db/settings";
import { updateCalendarPruningMonths } from "@/services/calendarInviteManager";
import { CalDavSettings } from "@/components/settings/CalDavSettings";
import { Section } from "./shared";

// ---- Checkbox identico a CalendarList ----

function CalendarCheckbox({
  cal,
  onToggle,
}: {
  cal: DbCalendar;
  onToggle: (id: string, visible: boolean) => void;
}) {
  const visible = !!cal.is_visible;
  return (
    <label className="flex items-center gap-2.5 px-3 py-1.5 rounded-md hover:bg-bg-hover cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={visible}
        onChange={(e) => onToggle(cal.id, e.target.checked)}
        className="sr-only"
      />
      <span
        className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors ${
          visible ? "border-transparent" : "border-border-primary bg-transparent"
        }`}
        style={visible ? { backgroundColor: calColor(cal) ?? "var(--color-accent)" } : undefined}
      >
        {visible && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 4L3 5.5L6.5 2"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="text-sm text-text-primary flex-1 truncate">
        {calDisplayName(cal)}
      </span>
      {!!cal.is_primary && (
        <span className="text-[0.6rem] text-text-tertiary shrink-0">{t("settings.calendar.calendarPrimary")}</span>
      )}
    </label>
  );
}

// ---- Lista calendari per account ----

function AccountCalendarList({
  calendars,
  onToggle,
}: {
  calendars: DbCalendar[];
  onToggle: (id: string, visible: boolean) => void;
}) {
  if (calendars.length === 0) {
    return (
      <p className="text-xs text-text-tertiary px-3 py-1.5">
        {t("settings.calendar.noCalendarsSynced")}
      </p>
    );
  }

  return (
    <div className="mt-1.5">
      {calendars.map((cal) => (
        <CalendarCheckbox key={cal.id} cal={cal} onToggle={onToggle} />
      ))}
    </div>
  );
}

// ---- Sezione CalDAV inline per account IMAP ----

function ImapCalendarSection({
  account,
  onSaved,
}: {
  account: DbAccount;
  onSaved: (updated: DbAccount) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isConfigured = !!account.caldav_url;

  return (
    <div className="mt-2">
      {isConfigured ? (
        <div className="flex items-center justify-between py-1.5 px-3 rounded-md bg-bg-tertiary">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-text-secondary truncate">{account.caldav_url}</span>
            <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">
              {t("settings.calendar.caldavConnected")}
            </span>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-accent hover:text-accent-hover transition-colors ml-3 shrink-0"
          >
            {expanded ? t("settings.calendar.caldavClose") : t("settings.calendar.caldavEdit")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors py-1 px-1"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Plus size={13} />
          {t("settings.calendar.addCalDav")}
        </button>
      )}

      {expanded && (
        <div className="mt-3 p-4 bg-bg-secondary rounded-lg border border-border-primary">
          <CalDavSettings
            account={account}
            onSaved={() => {
              import("@/services/db/accounts").then(({ getAccount: ga }) => {
                ga(account.id).then((updated) => {
                  if (updated) onSaved(updated);
                  setExpanded(false);
                });
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---- Blocco singolo account ----

type UiAccount = ReturnType<typeof useAccountStore.getState>["accounts"][number];

function AccountCalendarBlock({
  uiAccount,
  onToggle,
}: {
  uiAccount: UiAccount;
  onToggle: (calId: string, visible: boolean) => void;
}) {
  const [dbAccount, setDbAccount] = useState<DbAccount | null>(null);
  const [calendars, setCalendars] = useState<DbCalendar[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [db, cals] = await Promise.all([
      getAccount(uiAccount.id),
      getCalendarsForAccount(uiAccount.id),
    ]);
    setDbAccount(db);
    setCalendars(cals);
    setLoading(false);
  }, [uiAccount.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const isGmail = uiAccount.provider === "gmail_api";
  const isImap = uiAccount.provider === "imap";

  return (
    <div className="py-3 px-4 bg-bg-secondary rounded-lg">
      <div className="flex items-center gap-2">
        {uiAccount.color && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: uiAccount.color }}
          />
        )}
        <span className="text-sm font-medium text-text-primary">
          {uiAccount.label ?? uiAccount.displayName ?? uiAccount.email}
        </span>
        <span className="text-[0.6rem] font-medium px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-tertiary">
          {isGmail ? "Gmail" : "IMAP"}
        </span>
      </div>
      <p className="text-xs text-text-tertiary mt-0.5 mb-1 px-0.5">{uiAccount.email}</p>

      {loading ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-tertiary">
          <Loader2 size={13} className="animate-spin" />
          {t("common.loading")}
        </div>
      ) : (
        <>
          <AccountCalendarList
            calendars={calendars}
            onToggle={onToggle}
          />

          {isImap && dbAccount && (
            <ImapCalendarSection
              account={dbAccount}
              onSaved={(updated) => {
                setDbAccount(updated);
                getCalendarsForAccount(uiAccount.id).then(setCalendars);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---- Account CalDAV standalone ----

function StandaloneCalDavSection({ onRemove }: { onRemove: (id: string) => void }) {
  const accounts = useAccountStore((s) => s.accounts);
  const caldavAccounts = accounts.filter((a) => a.provider === "caldav");

  if (caldavAccounts.length === 0) return null;

  return (
    <Section title={t("settings.calendar.sections.calendarOnlyAccounts")}>
      <div className="space-y-2">
        {caldavAccounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between py-2.5 px-4 bg-bg-secondary rounded-lg"
          >
            <div>
              <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                {account.displayName ?? account.email}
                <span className="text-[0.6rem] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                  CalDAV
                </span>
              </div>
              <div className="text-xs text-text-tertiary">{account.email}</div>
            </div>
            <button
              onClick={() => onRemove(account.id)}
              className="text-xs text-danger hover:text-danger/80 transition-colors"
            >
              {t("settings.calendar.removeCalDav")}
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---- Sezione pruning inviti al calendario ----

function CalendarInvitesPruningSection() {
  const [months, setMonths] = useState("6");

  useEffect(() => {
    getSetting("calendar_invite_pruning_months").then((v) => {
      if (v) setMonths(v);
    });
  }, []);

  async function handleChange(value: string) {
    setMonths(value);
    await updateCalendarPruningMonths(value);
  }

  return (
    <Section title={t("settings.calendar.sections.calendarInvites")}>
      <p className="text-xs text-text-tertiary mb-4">
        {t("settings.calendar.invitePruningDesc")}
      </p>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-primary font-medium">
          {t("settings.calendar.invitePruningLabel")}
        </p>
        <select
          value={months}
          onChange={(e) => handleChange(e.target.value)}
          className="bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="3">{t("settings.calendar.pruning3months")}</option>
          <option value="6">{t("settings.calendar.pruning6months")}</option>
          <option value="12">{t("settings.calendar.pruning12months")}</option>
          <option value="0">{t("settings.calendar.pruningNever")}</option>
        </select>
      </div>
    </Section>
  );
}

// ---- Tab principale ----

export function CalendarTab() {
  const accounts = useAccountStore((s) => s.accounts);
  const removeAccountFromStore = useAccountStore((s) => s.removeAccount);

  const mailAccounts = accounts.filter((a) => a.provider !== "caldav");

  const handleToggle = useCallback(async (calId: string, visible: boolean) => {
    await setCalendarVisibility(calId, visible);
  }, []);

  const handleRemoveCalDav = useCallback(
    async (accountId: string) => {
      const { deleteAccount } = await import("@/services/db/accounts");
      await deleteAccount(accountId);
      removeAccountFromStore(accountId);
    },
    [removeAccountFromStore],
  );

  return (
    <>
      <Section title={t("settings.calendar.sections.calendars")}>
        {mailAccounts.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("settings.calendar.noAccountsConnected")}</p>
        ) : (
          <div className="space-y-3">
            {mailAccounts.map((account) => (
              <AccountCalendarBlock
                key={account.id}
                uiAccount={account}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </Section>

      <StandaloneCalDavSection onRemove={handleRemoveCalDav} />

      <CalendarInvitesPruningSection />

      <Section title={t("settings.calendar.sections.addCalendarAccount")}>
        <p className="text-sm text-text-tertiary">
          {t("settings.calendar.calendarComingSoon")}
        </p>
      </Section>
    </>
  );
}
