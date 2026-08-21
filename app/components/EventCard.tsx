/**
 * One event, as it appears in the agenda (list view) and on the home page.
 *
 * Carries the event's category colour and a place marker (online / in person /
 * hybrid) so a member can scan the calendar without opening anything.
 */

import { Link } from "react-router";
import type { EventSlim } from "~/lib/data";
import {
  categoryHue,
  categoryIcon,
  categoryStyle,
  PLACE_META,
  placeOf,
} from "~/lib/eventStyle";
import { time } from "~/lib/format";
import { DayShift } from "~/components/DayShift";
import { useTimeZone } from "~/lib/timezone";

export function EventCard({
  e,
  compact,
}: {
  e: EventSlim;
  /** Home page: drop the excerpt, keep it to a line or two. */
  compact?: boolean;
}) {
  const { zone } = useTimeZone();
  const place = placeOf(e);
  const meta = PLACE_META[place];
  const tags = e.categories.filter((c) => c !== "SV DSA").slice(0, 3);

  return (
    <Link
      to={e.path}
      className="ecard"
      style={categoryStyle(e.categories) as React.CSSProperties}
    >
      <span className="ecard__time">
        {e.allDay ? (
          "all day"
        ) : (
          <>
            {time(e.start, zone)}
            <DayShift at={e.start} zone={zone} />
          </>
        )}
      </span>
      <span className="ecard__body">
        <span className="ecard__title">{e.title}</span>
        <span className={`ecard__place ecard__place--${place}`}>
          <span aria-hidden="true">{meta.icon}</span> {meta.label}
          {place !== "online" && e.venue && e.venue !== "Zoom" && (
            <span className="ecard__venue"> · {e.venue}</span>
          )}
        </span>
        {!compact && e.excerpt && (
          <span className="ecard__excerpt">
            {e.excerpt.slice(0, 150)}
            {e.excerpt.length > 150 ? "…" : ""}
          </span>
        )}
        {tags.length > 0 && (
          <span className="ecard__tags">
            {tags.map((c) => (
              <span
                key={c}
                className="tag tag--cat"
                style={{ ["--cat-hue" as string]: String(categoryHue(c)) }}
              >
                {categoryIcon(c) && (
                  <span aria-hidden="true">{categoryIcon(c)} </span>
                )}
                {c}
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}
