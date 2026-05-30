import { useState, useCallback, useMemo } from "react";
import { MapPin, Clock, User, Pencil, Trash2, Check, X, HelpCircle, Video } from "lucide-react";
import { t, getLocale } from "@/i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";
import type { DbCalendar } from "@/services/db/calendars";
import { getCalendarProvider } from "@/services/calendar/providerFactory";
import { deleteCalendarEvent as deleteCalendarEventDb } from "@/services/db/calendarEvents";
import { getMeetingUrl, isMeetingActive } from "@/utils/meetingUrl";

interface EventDetailModalProps {
  event: DbCalendarEvent;
  calendars: DbCalendar[];
  accountId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function EventDetailModal({ event, calendars, accountId, onClose, onUpdated }: EventDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(event.summary ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [startTime, setStartTime] = useState(toLocalISOString(new Date(event.start_time * 1000)));
  const [endTime, setEndTime] = useState(toLocalISOString(new Date(event.end_time * 1000)));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const calendar = calendars.find((c) => c.id === event.calendar_id);

  const meetingUrl = useMemo(() => getMeetingUrl(event), [event]);
  const nowTs = Math.floor(Date.now() / 1000);
  const todayMidnightTs = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return Math.floor(d.getTime() / 1000); }, []);
  const isUpcoming = event.start_time >= todayMidnightTs;
  const isActive = meetingUrl && isUpcoming ? isMeetingActive(event, nowTs) : false;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const provider = await getCalendarProvider(accountId);
      const calendarRemoteId = calendar?.remote_id ?? "primary";
      const remoteEventId = event.remote_event_id ?? event.google_event_id;

      await provider.updateEvent(calendarRemoteId, remoteEventId, {
        summary,
        description: description || undefined,
        location: location || undefined,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      }, event.etag ?? undefined);

      onUpdated();
    } catch (err) {
      console.error("Failed to update event:", err);
    } finally {
      setSaving(false);
    }
  }, [accountId, calendar, event, summary, description, location, startTime, endTime, onUpdated]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const provider = await getCalendarProvider(accountId);
      const calendarRemoteId = calendar?.remote_id ?? "primary";
      const remoteEventId = event.remote_event_id ?? event.google_event_id;

      await provider.deleteEvent(calendarRemoteId, remoteEventId, event.etag ?? undefined);

      // Remove from local DB
      await deleteCalendarEventDb(event.id);

      onUpdated();
    } catch (err) {
      console.error("Failed to delete event:", err);
    } finally {
      setDeleting(false);
    }
  }, [accountId, calendar, event, onUpdated]);

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleString(getLocale(), {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const attendees = event.attendees_json
    ? (JSON.parse(event.attendees_json) as { email: string; displayName?: string; responseStatus?: string }[])
        .filter((a) => a.email !== event.organizer_email)
    : [];

  if (editing) {
    return (
      <Modal isOpen={true} onClose={onClose} title={t("calendar.eventEditTitle")} width="w-full max-w-md">
        <div className="p-4 space-y-3">
          <TextField
            label={t("calendar.eventTitle")}
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t("calendar.eventStart")}
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <TextField
              label={t("calendar.eventEnd")}
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <TextField
            label={t("calendar.eventLocation")}
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("calendar.eventLocationPlaceholder")}
          />

          <div>
            <label className="text-xs text-text-secondary block mb-1">{t("calendar.eventDescription")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("calendar.eventDescriptionPlaceholder")}
              rows={3}
              className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="md" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" size="md" onClick={handleSave} disabled={saving || !summary.trim()}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={event.summary ?? t("calendar.eventUnknown")} width="w-full max-w-md">
      <div className="p-4 space-y-3">
        {calendar && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: calendar.color ?? "var(--color-accent)" }}
            />
            {calendar.display_name}
          </div>
        )}

        <div className="flex items-start gap-2.5 text-sm text-text-secondary">
          <Clock size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
          <div>
            <div>{formatTime(event.start_time)}</div>
            <div>{formatTime(event.end_time)}</div>
          </div>
        </div>

        {event.location && (
          <div className="flex items-start gap-2.5 text-sm text-text-secondary">
            <MapPin size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
            <span>{event.location}</span>
          </div>
        )}

        {event.description && (
          <div className="text-sm text-text-secondary whitespace-pre-wrap border-t border-border-primary pt-3">
            {event.description}
          </div>
        )}

        {(event.organizer_email || attendees.length > 0) && (
          <div className="border-t border-border-primary pt-3">
            <div className="text-xs text-text-tertiary mb-1.5">{t("calendar.eventAttendees")}</div>
            <div className="space-y-1">
              {event.organizer_email && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <User size={12} className="text-accent" />
                  <span className="flex-1 min-w-0 truncate">{event.organizer_email}</span>
                  <span className="text-[0.625rem] text-text-tertiary shrink-0">{t("calendar.eventOrganizer")}</span>
                </div>
              )}
              {attendees.map((a, i) => {
                const status = a.responseStatus?.toLowerCase();
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                    <User size={12} className="text-text-tertiary shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{a.displayName ?? a.email}</span>
                    {status === "accepted" && <Check size={11} className="text-emerald-500 shrink-0" />}
                    {status === "declined" && <X size={11} className="text-danger shrink-0" />}
                    {status === "tentative" && <HelpCircle size={11} className="text-amber-400 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {meetingUrl && isUpcoming && (
          <div className="pt-2 border-t border-border-primary">
            <button
              onClick={() => openUrl(meetingUrl).catch(() => {})}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? "bg-accent text-white animate-pulse shadow-md shadow-accent/30"
                  : "bg-accent/10 text-accent hover:bg-accent/20"
              }`}
            >
              <Video size={15} />
              {t("calendar.joinButton")}
            </button>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-border-primary">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-danger">{t("calendar.eventDeleteConfirm")}</span>
              <Button variant="danger" size="xs" onClick={handleDelete} disabled={deleting}>
                {deleting ? t("common.deleting") : t("calendar.eventYesDelete")}
              </Button>
              <Button variant="secondary" size="xs" onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={() => setConfirmDelete(true)}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil size={14} />}
            onClick={() => setEditing(true)}
          >
            {t("common.edit")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
