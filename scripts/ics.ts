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

// The site's own expansion, so the feed can tell which RDATEs the RRULE already
// covers — one engine deciding what a series means, not two.
import { occurrences } from "../app/lib/recurrence";

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
  /** Dates the series skips / extra one-off dates (YYYY-MM-DD). */
  exdate?: string[];
  rdate?: string[];
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
  // Schedule exceptions. RFC 5545 permits several dates per property, but
  // real-world parsers are inconsistent about multi-value RDATE (node-ical
  // doesn't decode it at all), so emit ONE property per date — what Google and
  // Apple both produce. Each carries the event's time-of-day so clients can
  // match the occurrence being cancelled/moved.
  const timeOfDay = ev.allDay ? "" : localStamp(ev.start).slice(8); // 'THHMMSS'
  const exception = (name: "EXDATE" | "RDATE", date: string) =>
    ev.allDay
      ? `${name};VALUE=DATE:${dateOnly(date)}`
      : `${name};TZID=America/Los_Angeles:${dateOnly(date) + timeOfDay}`;
  for (const d of ev.exdate ?? []) lines.push(exception("EXDATE", d));
  /**
   * Skip any RDATE the RRULE already generates.
   *
   * RFC 5545 defines the recurrence set as a UNION, so a date in both is one
   * occurrence — but consumers don't agree: ICAL.js (and, in testing, real
   * calendar apps) emit it twice, which shows a subscriber the same meeting
   * duplicated. Our own engine unions correctly, so without this the feed and
   * the site disagree.
   *
   * This is defensive rather than cosmetic: it happens whenever a series' rule
   * is broadened and its old `rdate` compensations are left behind, which is
   * exactly what three chapter meetings look like right now.
   */
  const rdates = ev.rdate ?? [];
  if (rdates.length) {
    // NB: plain `YYYY-MM-DD` here, not dateOnly() — that returns the compact
    // ICS form (20261112), which the engine doesn't parse, so comparing against
    // it silently matches nothing and every RDATE survives.
    const iso = (s: string) => s.slice(0, 10);
    const days = rdates.map(iso).sort();
    const fromRule = new Set(
      ev.rrule
        ? occurrences(
            { rrule: ev.rrule, exdate: ev.exdate },
            ev.start,
            days[0],
            days[days.length - 1],
          )
        : [],
    );
    for (const d of rdates)
      if (!fromRule.has(iso(d))) lines.push(exception("RDATE", d));
  }
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
