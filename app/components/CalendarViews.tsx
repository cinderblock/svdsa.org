/**
 * Week and Month calendar views — both **continuously vertically scrolling**:
 * periods are stacked in order and you scroll into the future. No prev/next
 * paging, which suits a phone and means a member never has to hunt for "next
 * month".
 *
 * Week view lists all seven days (empty ones muted) so the rhythm of the week
 * is visible. Month view is a real 7-column grid — a `<table>`, so screen
 * readers and keyboard users get row/column semantics for free — with each day
 * cell holding its events.
 *
 * Both take the already-filtered event list and are pure presentation.
 */

import { Link } from "react-router";
import type { EventSlim } from "~/lib/data";
import { categoryStyle, PLACE_META, placeOf } from "~/lib/eventStyle";
import { time } from "~/lib/format";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Add whole CALENDAR days.
 *
 * Millisecond arithmetic (`t + n * DAY_MS`) is wrong across a daylight-saving
 * boundary: on the US fall-back day, local midnight + 24 h is 23:00 on the
 * SAME date. A grid built that way repeats a day and drops the next one —
 * which is exactly what happened around 2026-11-01. Constructing a new local
 * Date from (year, month, day + n) hands the arithmetic to the platform's
 * calendar, which handles the 23- and 25-hour days.
 */
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Whole days between two local midnights (rounded past DST's ±1 h). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** 'YYYY-MM-DD' of a Date, in local time (not UTC — avoids off-by-one). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const dayOf = (e: EventSlim) => e.start.slice(0, 10);
/** Local Date at midnight for a 'YYYY-MM-DD'. */
const atMidnight = (day: string) => new Date(`${day}T00:00:00`);

function groupByDay(events: EventSlim[]): Map<string, EventSlim[]> {
  const byDay = new Map<string, EventSlim[]>();
  for (const e of events) {
    const key = dayOf(e);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(e);
  }
  return byDay;
}

/** An event as it appears inside a day cell/row. */
function EventChip({ e, compact }: { e: EventSlim; compact?: boolean }) {
  const place = placeOf(e);
  return (
    <Link
      to={e.path}
      className="cal-chip"
      style={categoryStyle(e.categories) as React.CSSProperties}
    >
      {!e.allDay && <span className="cal-chip__time">{time(e.start)}</span>}
      <span className="cal-chip__title">{e.title}</span>
      {!compact && (
        <span className="cal-chip__where" aria-label={PLACE_META[place].label}>
          {PLACE_META[place].icon}
        </span>
      )}
    </Link>
  );
}

/**
 * WEEK view — one block per week, seven day rows each, scrolling on forever.
 */
export function WeekView({
  events,
  from,
  weeks,
}: {
  events: EventSlim[];
  /** First day to show ('YYYY-MM-DD'); its week is the first block. */
  from: string;
  weeks: number;
}) {
  const byDay = groupByDay(events);
  const today = ymd(new Date());
  const start = atMidnight(from);
  // Back up to Sunday so each block is a real calendar week.
  const firstSunday = addDays(start, -start.getDay());

  return (
    <div className="cal-weeks">
      {Array.from({ length: weeks }, (_, w) => {
        const weekStart = addDays(firstSunday, w * 7);
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        const weekEnd = days[6];
        const label = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(
          "en-US",
          {
            month:
              weekStart.getMonth() === weekEnd.getMonth() ? undefined : "short",
            day: "numeric",
          },
        )}`;
        const count = days.reduce(
          (n, d) => n + (byDay.get(ymd(d))?.length ?? 0),
          0,
        );
        return (
          <section className="cal-week" key={ymd(weekStart)}>
            <h2 className="cal-week__head">
              {label}
              <span className="muted">
                {count === 0
                  ? "nothing scheduled"
                  : `${count} event${count === 1 ? "" : "s"}`}
              </span>
            </h2>
            <ol className="cal-week__days">
              {days.map((d) => {
                const key = ymd(d);
                const list = byDay.get(key) ?? [];
                const past = key < today;
                return (
                  <li
                    key={key}
                    className={`cal-day${list.length ? "" : " is-empty"}${
                      key === today ? " is-today" : ""
                    }${past ? " is-past" : ""}`}
                  >
                    <div className="cal-day__label">
                      <span className="dow">{WEEKDAY_LABELS[d.getDay()]}</span>
                      <span className="dom">{d.getDate()}</span>
                    </div>
                    <div className="cal-day__events">
                      {list.length ? (
                        list.map((e) => <EventChip key={e.id} e={e} />)
                      ) : (
                        <span className="cal-day__none">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/**
 * MONTH view — one 7-column grid per month, stacked vertically.
 */
export function MonthView({
  events,
  from,
  months,
}: {
  events: EventSlim[];
  from: string;
  months: number;
}) {
  const byDay = groupByDay(events);
  const today = ymd(new Date());
  const first = atMidnight(from);

  return (
    <div className="cal-months">
      {Array.from({ length: months }, (_, m) => {
        const monthStart = new Date(
          first.getFullYear(),
          first.getMonth() + m,
          1,
        );
        const monthEnd = new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() + 1,
          0,
        );
        // Pad to whole weeks (Sunday-start) so the grid is rectangular…
        let gridStart = addDays(monthStart, -monthStart.getDay());
        // …but for the CURRENT month, start at this week rather than the 1st:
        // this is an upcoming-events calendar, so weeks that are entirely in
        // the past would otherwise open the view on rows of empty cells.
        if (m === 0) {
          const thisWeek = addDays(first, -first.getDay());
          if (thisWeek > gridStart) gridStart = thisWeek;
        }
        const cells = daysBetween(gridStart, monthEnd) + 1;
        const weekRows = Math.ceil(cells / 7);

        return (
          <table className="cal-month" key={ymd(monthStart)}>
            <caption>
              {monthStart.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </caption>
            <thead>
              <tr>
                {WEEKDAY_LABELS.map((d) => (
                  <th scope="col" key={d}>
                    {/* Full name normally; a single letter only where there's
                        no room — but the full name stays in the accessibility
                        tree, since "S" and "T" are ambiguous read aloud. */}
                    <span className="dow-full">{d}</span>
                    <span className="dow-min" aria-hidden="true">
                      {d[0]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: weekRows }, (_, row) => (
                <tr key={row}>
                  {Array.from({ length: 7 }, (_, col) => {
                    const d = addDays(gridStart, row * 7 + col);
                    const key = ymd(d);
                    const outside = d.getMonth() !== monthStart.getMonth();
                    const list = outside ? [] : (byDay.get(key) ?? []);
                    return (
                      <td
                        key={key}
                        // `is-today` only inside its own month — otherwise the
                        // padding cells of the NEXT month also light up today.
                        className={`${outside ? "is-outside" : ""}${
                          !outside && key === today ? " is-today" : ""
                        }${!outside && key < today ? " is-past" : ""}`}
                      >
                        {!outside && (
                          <>
                            <span className="cal-cell__date">
                              {d.getDate()}
                            </span>
                            {list.map((e) => (
                              <EventChip key={e.id} e={e} compact />
                            ))}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
