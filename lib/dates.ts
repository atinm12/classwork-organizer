import { SEMESTER_YEAR } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * US Eastern UTC offset for a given 2026 date. DST (EDT, -04:00) runs
 * Mar 8 – Nov 1, 2026; otherwise EST (-05:00). Good enough for course dates.
 */
function easternOffset(month: number, day: number): string {
  let edt: boolean;
  if (month > 3 && month < 11) edt = true;
  else if (month < 3 || month > 11) edt = false;
  else if (month === 3) edt = day >= 8;
  else edt = day < 1; // November: EST from the 1st onward
  return edt ? "-04:00" : "-05:00";
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Build an ISO 8601 timestamp with the correct US Eastern offset for the
 * course's semester year. Returns null if month/day are out of range.
 */
export function easternIso(
  month: number,
  day: number,
  hour = 23,
  minute = 59,
  year: number = SEMESTER_YEAR
): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(
    minute
  )}:00${easternOffset(month, day)}`;
}

/** "Mon Aug 31" / "Aug 31" -> {month, day}. Returns null if unparseable. */
export function parseMonthDay(text: string): { month: number; day: number } | null {
  const m = text.match(/([A-Za-z]{3,})\.?\s+(\d{1,2})/);
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  const day = Number(m[2]);
  if (!month || !day) return null;
  return { month, day };
}

/**
 * Parse a "M/D [time]" fragment (e.g. "8/29 8pm", "9/5 8:00pm", "9/8").
 * Returns an Eastern ISO string, or null.
 */
export function parseSlashDate(text: string): string | null {
  const md = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (!md) return null;
  const month = Number(md[1]);
  const day = Number(md[2]);

  const t = text.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])m/i);
  let hour = 23;
  let minute = 59;
  if (t) {
    hour = Number(t[1]) % 12;
    if (t[3].toLowerCase() === "p") hour += 12;
    minute = t[2] ? Number(t[2]) : 0;
  }
  return easternIso(month, day, hour, minute);
}
