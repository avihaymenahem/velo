import { useEffect, useState, useCallback } from "react";
import { Calendar, MapPin, Clock, ExternalLink, Check, X, Minus, User, AlertCircle } from "lucide-react";
import { t } from "@/i18n";
import type { DbAttachment } from "@/services/db/attachments";
import type { Account } from "@/stores/accountStore";
import type { CalendarEventData } from "@/services/calendar/types";
import { loadInvite, respondToInvite, type RsvpPartstat } from "@/services/calendar/calendarInviteService";

interface CalendarInviteWidgetProps {
  attachment: DbAttachment;
  messageId: string;
  threadId: string;
  account: Account;
}

type LoadState = "loading" | "ready" | "cancelled" | "error";

function formatEventDate(startTime: number, endTime: number, isAllDay: boolean): string {
  const start = new Date(startTime * 1000);
  const end = new Date(endTime * 1000);
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
  if (isAllDay) return start.toLocaleDateString(undefined, dateOpts);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${start.toLocaleDateString(undefined, dateOpts)} – ${end.toLocaleDateString(undefined, dateOpts)}`;
}

function formatDuration(startTime: number, endTime: number, isAllDay: boolean): string {
  if (isAllDay) return t("calendarInvite.allDay");
  const mins = Math.round((endTime - startTime) / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function isStartingSoon(startTime: number): boolean {
  const nowSec = Date.now() / 1000;
  return startTime > nowSec && startTime - nowSec <= 5 * 60;
}

const RSVP_LABELS: Record<RsvpPartstat, string> = {
  ACCEPTED: t("calendarInvite.youAccepted"),
  DECLINED: t("calendarInvite.youDeclined"),
  TENTATIVE: t("calendarInvite.tentative"),
};

const RSVP_COLORS: Record<RsvpPartstat, string> = {
  ACCEPTED: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
  DECLINED: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  TENTATIVE: "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
};

export function CalendarInviteWidget({ attachment, messageId, threadId, account }: CalendarInviteWidgetProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [event, setEvent] = useState<CalendarEventData | null>(null);
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(null);
  const [responding, setResponding] = useState<RsvpPartstat | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [icsText, setIcsText] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    loadInvite(attachment, messageId)
      .then(({ event: ev, meetingUrl: url, rsvpStatus: status, method, icsText: text }) => {
        if (cancelled) return;
        if (method === "REPLY") { setLoadState("error"); return; }
        if (method === "CANCEL") { setEvent(ev); setLoadState("cancelled"); return; }
        setEvent(ev);
        setMeetingUrl(url);
        setRsvpStatus(status);
        setIcsText(text);
        setLoadState("ready");
      })
      .catch(() => { if (!cancelled) setLoadState("error"); });
    return () => { cancelled = true; };
  }, [attachment, messageId]);

  const handleRsvp = useCallback(async (partstat: RsvpPartstat) => {
    if (!event || responding) return;
    setRsvpError(null);
    setResponding(partstat);
    try {
      await respondToInvite({ event, icsText, messageId, threadId, account, partstat });
      setRsvpStatus(partstat.toLowerCase());
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : "Failed to send response. Try again.");
    } finally {
      setResponding(null);
    }
  }, [event, icsText, messageId, threadId, account, responding]);

  if (loadState === "loading") {
    return (
      <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary text-text-tertiary text-xs">
        <Calendar size={14} />
        <span>{t("calendarInvite.loadingInvitation")}</span>
      </div>
    );
  }

  if (loadState === "error" || (!event && loadState !== "cancelled")) return null;

  if (loadState === "cancelled" && event) {
    return (
      <div className="mb-4 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-start gap-3">
        <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-red-700 dark:text-red-400 text-sm">
            {t("calendarInvite.eventCancelled")}
          </div>
          <div className="text-xs text-red-600 dark:text-red-500 mt-0.5 truncate">
            {event.summary ?? "Meeting"}
          </div>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const normalizedStatus = rsvpStatus?.toUpperCase() as RsvpPartstat | undefined;
  const hasRsvped = normalizedStatus && normalizedStatus in RSVP_LABELS;
  const startingSoon = event.startTime ? isStartingSoon(event.startTime) : false;

  return (
    <div className="mb-4 rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Calendar size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-text-primary text-sm truncate">
              {event.summary ?? t("calendarInvite.defaultTitle")}
            </div>
            <div className="text-xs text-text-tertiary">{t("calendarInvite.invitation")}</div>
          </div>
        </div>
        {meetingUrl && (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
              startingSoon
                ? "bg-green-500 hover:bg-green-600 animate-breathe-glow"
                : "bg-accent hover:opacity-90"
            }`}
          >
            <ExternalLink size={12} />
            {startingSoon ? t("calendarInvite.joinNow") : t("calendarInvite.join")}
          </a>
        )}
      </div>

      {/* Details */}
      <div className="px-4 pb-3 space-y-1.5">
        <div className="flex items-start gap-2 text-xs text-text-secondary">
          <Clock size={13} className="mt-0.5 flex-shrink-0 text-text-tertiary" />
          <span>
            {formatEventDate(event.startTime, event.endTime, event.isAllDay)}
            <span className="text-text-tertiary ml-1">
              · {formatDuration(event.startTime, event.endTime, event.isAllDay)}
            </span>
          </span>
        </div>

        {event.location && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <MapPin size={13} className="flex-shrink-0 text-text-tertiary" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {event.organizerEmail && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <User size={13} className="flex-shrink-0 text-text-tertiary" />
            <span className="truncate">{t("calendarInvite.organizer")}: {event.organizerEmail}</span>
          </div>
        )}
      </div>

      {/* RSVP section */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {hasRsvped && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${RSVP_COLORS[normalizedStatus!]}`}>
              {normalizedStatus === "ACCEPTED" && <Check size={11} />}
              {normalizedStatus === "DECLINED" && <X size={11} />}
              {normalizedStatus === "TENTATIVE" && <Minus size={11} />}
              {RSVP_LABELS[normalizedStatus!]}
            </span>
          )}
          <div className={`flex items-center gap-1.5 ${hasRsvped ? "ml-auto" : ""}`}>
            <RsvpButton
              label={t("calendarInvite.accept")}
              icon={<Check size={12} />}
              active={normalizedStatus === "ACCEPTED"}
              loading={responding === "ACCEPTED"}
              disabled={!!responding}
              onClick={() => handleRsvp("ACCEPTED")}
              activeClass="bg-green-500 hover:bg-green-600 text-white"
            />
            <RsvpButton
              label={t("calendarInvite.maybe")}
              icon={<Minus size={12} />}
              active={normalizedStatus === "TENTATIVE"}
              loading={responding === "TENTATIVE"}
              disabled={!!responding}
              onClick={() => handleRsvp("TENTATIVE")}
              activeClass="bg-yellow-500 hover:bg-yellow-600 text-white"
            />
            <RsvpButton
              label={t("calendarInvite.decline")}
              icon={<X size={12} />}
              active={normalizedStatus === "DECLINED"}
              loading={responding === "DECLINED"}
              disabled={!!responding}
              onClick={() => handleRsvp("DECLINED")}
              activeClass="bg-red-500 hover:bg-red-600 text-white"
            />
          </div>
        </div>
        {rsvpError && (
          <div className="text-xs text-red-600 dark:text-red-400">{rsvpError}</div>
        )}
      </div>
    </div>
  );
}

interface RsvpButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  activeClass: string;
}

function RsvpButton({ label, icon, active, loading, disabled, onClick, activeClass }: RsvpButtonProps) {
  const base = "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border";
  const inactiveClass = "border-border-primary bg-bg-primary text-text-secondary hover:bg-bg-tertiary disabled:opacity-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${active ? `${activeClass} border-transparent` : inactiveClass}`}
    >
      {loading ? (
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      ) : icon}
      {label}
    </button>
  );
}
