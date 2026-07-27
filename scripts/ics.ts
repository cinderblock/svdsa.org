/**
 * iCalendar (RFC 5545) serialization for the events calendar.
 *
 * Used by build-content.ts to prerender static `.ics` feeds — the whole
 * calendar, one per filter facet, one per category, and one per event — so
 * members can subscribe in Apple Calendar / Google Calendar / Outlook the way
 * they can on the WordPress site today.
 *
 * Recurring series are emitted as a SINGLE VEVENT with an RRULE (rather than
 * one VEVENT per generated instance), so a subscriber's calendar shows a real
 * repeating entry that never runs out — which also means the feed does not go
 * stale between rebuilds the way the site's expanded instance list does.
 */

import type { Repeats } from "./expand-recurring";

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** RFC 5545 §3.3.11 TEXT escaping. Order matters: backslash first. */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to ≤75 **octets** per line (§3.1). Continuations start with one space.
 * Multi-byte characters are never split across a fold boundary.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off if we'd split a UTF-8 continuation byte (0b10xxxxxx).
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80)
      end--;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join("\r\n ");
}

/** '2026-08-15 14:00:00' | '2026-08-15T14:00:00' → '20260815T140000' (local). */
function localStamp(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error(`unparseable event time: ${s}`);
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] ?? "00"}`;
}

const dateOnly = (s: string) => s.slice(0, 10).replace(/-/g, "");

/** UTC stamp for DTSTAMP / UNTIL. */
export const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/**
 * US Pacific VTIMEZONE. Static definition (current US DST rules) so clients
 * resolve America/Los_Angeles wall-clock times without their own tzdb.
 */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Los_Angeles",
  "X-LIC-LOCATION:America/Los_Angeles",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Build an RRULE value from a series' `repeats:` rule. */
export function rruleFor(rep: Repeats, anchorStart: string): string | null {
  const parts: string[] = [];
  if (rep.freq === "weekly") {
    const [y, m, d] = anchorStart.slice(0, 10).split("-").map(Number);
    const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    parts.push("FREQ=WEEKLY");
    if ((rep.interval ?? 1) > 1) parts.push(`INTERVAL=${rep.interval}`);
    parts.push(`BYDAY=${wd}`);
  } else if (rep.freq === "monthly") {
    if (!rep.byday) return null;
    parts.push("FREQ=MONTHLY", `BYDAY=${rep.byday}`);
  } else {
    return null;
  }
  if (rep.until) parts.push(`UNTIL=${dateOnly(rep.until)}T235959Z`);
  return parts.join(";");
}

export interface IcsEvent {
  /** Globally unique + STABLE across rebuilds (clients dedupe on this). */
  uid: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  url?: string;
  categories?: string[];
  organizer?: string;
  /** RRULE value (without the `RRULE:` prefix) for recurring series. */
  rrule?: string | null;
}

function vevent(ev: IcsEvent, dtstamp: string): string[] {
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${dtstamp}`,
  ];
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`);
    if (ev.end) lines.push(`DTEND;VALUE=DATE:${dateOnly(ev.end)}`);
  } else {
    lines.push(
      `DTSTART;TZID=America/Los_Angeles:${localStamp(ev.start)}`,
      ...(ev.end
        ? [`DTEND;TZID=America/Los_Angeles:${localStamp(ev.end)}`]
        : []),
    );
  }
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
  lines.push(`SUMMARY:${esc(ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  if (ev.categories?.length)
    lines.push(`CATEGORIES:${ev.categories.map(esc).join(",")}`);
  if (ev.organizer)
    lines.push(`ORGANIZER;CN=${esc(ev.organizer)}:invalid:nomail`);
  lines.push("END:VEVENT");
  return lines;
}

/** Serialize a complete calendar. Returns CRLF-terminated iCalendar text. */
export function icalendar(opts: {
  name: string;
  description?: string;
  events: IcsEvent[];
  dtstamp: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Silicon Valley DSA//svdsa.org//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.name)}`,
    "X-WR-TIMEZONE:America/Los_Angeles",
    ...(opts.description ? [`X-WR-CALDESC:${esc(opts.description)}`] : []),
    // Ask clients to re-poll daily; the site rebuilds at least that often.
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    ...VTIMEZONE,
    ...opts.events.flatMap((e) => vevent(e, opts.dtstamp)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
