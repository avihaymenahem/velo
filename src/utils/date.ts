// IMAP stores dates as Unix seconds; Gmail stores milliseconds.
// Any value < 1e10 is certainly seconds (year 2001 in ms = 1e12).
function toMs(timestamp: number): number {
  return timestamp < 1e10 ? timestamp * 1000 : timestamp;
}

/**
 * Format a unix timestamp (seconds or milliseconds) into a relative date string.
 */
export function formatRelativeDate(timestamp: number): string {
  const date = new Date(toMs(timestamp));
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  // Today: show time
  if (isSameDay(date, now)) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return "Yesterday";
  }

  // Within last 7 days: show day name
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  // Same year: show month + day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  // Older: show full date
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a unix timestamp (seconds or milliseconds) into a full date string for message headers.
 */
export function formatFullDate(timestamp: number): string {
  const date = new Date(toMs(timestamp));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
