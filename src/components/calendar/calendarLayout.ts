import type { DbCalendarEvent } from "@/services/db/calendarEvents";

export interface PositionedEvent {
  event: DbCalendarEvent;
  /** 0-based column index within the overlap group */
  colIndex: number;
  /** total columns in the overlap group */
  colCount: number;
  /** px from top of the day column */
  top: number;
  /** px height */
  height: number;
}

const MIN_HEIGHT_PX = 20;

/**
 * Lays out timed events for a single day using a greedy column-packing
 * algorithm. Returns position data (top, height, colIndex, colCount) for
 * each event so callers can render them with absolute positioning.
 *
 * @param events    timed (non-all-day) events that fall within the day
 * @param dayStartTs  Unix timestamp (seconds) for midnight of the day
 * @param hourHeight  px height of one hour slot
 */
export function layoutDayEvents(
  events: DbCalendarEvent[],
  dayStartTs: number,
  hourHeight: number,
): PositionedEvent[] {
  if (!events.length) return [];

  const dayEndTs = dayStartTs + 86400;

  const sorted = [...events].sort(
    (a, b) => a.start_time - b.start_time || b.end_time - a.end_time,
  );

  // Greedy column assignment: place each event in the first column whose
  // last event has already ended.
  const colEnds: number[] = [];
  const colOf = new Map<string, number>();

  for (const e of sorted) {
    let placed = false;
    for (let c = 0; c < colEnds.length; c++) {
      if ((colEnds[c] as number) <= e.start_time) {
        colEnds[c] = e.end_time;
        colOf.set(e.id, c);
        placed = true;
        break;
      }
    }
    if (!placed) {
      colOf.set(e.id, colEnds.length);
      colEnds.push(e.end_time);
    }
  }

  // Group into overlap clusters to determine the total column count for each group.
  const groups: DbCalendarEvent[][] = [];
  let groupEnd = -Infinity;
  let cur: DbCalendarEvent[] = [];
  for (const e of sorted) {
    if (e.start_time >= groupEnd) {
      if (cur.length) groups.push(cur);
      cur = [e];
      groupEnd = e.end_time;
    } else {
      cur.push(e);
      groupEnd = Math.max(groupEnd, e.end_time);
    }
  }
  if (cur.length) groups.push(cur);

  const colCountOf = new Map<string, number>();
  for (const group of groups) {
    const cols = group.reduce((mx, e) => Math.max(mx, (colOf.get(e.id) ?? 0) + 1), 0);
    for (const e of group) colCountOf.set(e.id, cols);
  }

  // Build result with pixel geometry.
  return sorted.map((e) => {
    const clampedStart = Math.max(e.start_time, dayStartTs);
    const clampedEnd = Math.min(e.end_time, dayEndTs);
    const startMin = (clampedStart - dayStartTs) / 60;
    const durationMin = Math.max((clampedEnd - clampedStart) / 60, 15);

    return {
      event: e,
      colIndex: colOf.get(e.id) ?? 0,
      colCount: colCountOf.get(e.id) ?? 1,
      top: (startMin / 60) * hourHeight,
      height: Math.max((durationMin / 60) * hourHeight, MIN_HEIGHT_PX),
    };
  });
}
