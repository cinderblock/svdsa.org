/** Date helpers. Event/post date strings are local wall-clock "YYYY-MM-DD HH:MM:SS". */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Parse a "YYYY-MM-DD HH:MM:SS" (or ISO) string into a local Date. */
function parse(s: string): Date {
  return new Date(s.replace(" ", "T"));
}

export function longDate(s: string): string {
  const d = parse(s);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function shortDate(s: string): string {
  const d = parse(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function time(s: string): string {
  const d = parse(s);
  return d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
}

/** Month + day parts for the calendar date chip. */
export function dateParts(s: string): { month: string; day: number } {
  const d = parse(s);
  return { month: MONTHS[d.getMonth()], day: d.getDate() };
}

export function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** True if the event's start is today or later, relative to `now`. */
export function isUpcoming(start: string, now: Date): boolean {
  return parse(start).getTime() >= startOfDay(now).getTime();
}

/** Parts of a 'YYYY-MM-DD' day key, for agenda date headings. */
export const weekdayOf = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
export const monthOf = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short" });
export const dayNumber = (day: string) => Number(day.slice(8, 10));
