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
import { time } from "~/lib/format";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const online = e.isVirtual || e.venue === "Zoom";
  return (
    <Link to={e.path} className="cal-chip">
      {!e.allDay && <span className="cal-chip__time">{time(e.start)}</span>}
      <span className="cal-chip__title">{e.title}</span>
      {!compact && (
        <span className="cal-chip__where">
          {online ? "🖥" : e.venue ? "📍" : ""}
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
  const firstSunday = new Date(start.getTime() - start.getDay() * DAY_MS);

  return (
    <div className="cal-weeks">
      {Array.from({ length: weeks }, (_, w) => {
        const weekStart = new Date(firstSunday.getTime() + w * 7 * DAY_MS);
        const days = Array.from(
          { length: 7 },
          (_, i) => new Date(weekStart.getTime() + i * DAY_MS),
        );
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
        let gridStart = new Date(
          monthStart.getTime() - monthStart.getDay() * DAY_MS,
        );
        // …but for the CURRENT month, start at this week rather than the 1st:
        // this is an upcoming-events calendar, so weeks that are entirely in
        // the past would otherwise open the view on rows of empty cells.
        if (m === 0) {
          const thisWeek = new Date(first.getTime() - first.getDay() * DAY_MS);
          if (thisWeek > gridStart) gridStart = thisWeek;
        }
        const cells = Math.ceil(
          (monthEnd.getTime() - gridStart.getTime()) / DAY_MS + 1,
        );
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
                    const d = new Date(
                      gridStart.getTime() + (row * 7 + col) * DAY_MS,
                    );
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
