import type { MetaFunction } from "react-router";
import { Link, useLocation } from "react-router";
import { getEvent } from "~/lib/events";
import { longDate, time } from "~/lib/format";
import { describeRecurrence } from "~/lib/recurrence";
import { useNow } from "~/lib/useNow";
import { Prose } from "~/components/Prose";
import { SITE } from "~/lib/site";
import { chapterDay } from "~/lib/today";

export const meta: MetaFunction = ({ location }) => {
  const ev = getEvent(location.pathname);
  const title = ev ? `${ev.title} · ${SITE.name}` : `Event · ${SITE.name}`;
  return [
    { title },
    {
      name: "description",
      content: ev?.descriptionHtml
        ? ev.descriptionHtml.replace(/<[^>]*>/g, "").slice(0, 160)
        : "Silicon Valley DSA event.",
    },
    { property: "og:type", content: "event" },
    { property: "og:title", content: ev?.title ?? "Event" },
  ];
};

/** '2026-08-15 14:00:00' → '20260815T140000' (local wall clock, for Google). */
const stamp = (s: string) =>
  s.slice(0, 19).replace(/[-:]/g, "").replace(" ", "T");

/** The prerendered per-event .ics: /event/mawg/2026-07-28/ → mawg-2026-07-28. */
const icsStem = (path: string) =>
  path
    .replace(/^\/event\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, "-");

function googleTemplate(
  ev: NonNullable<ReturnType<typeof getEvent>>,
  where: string,
): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${stamp(ev.start)}/${stamp(ev.end || ev.start)}`,
    ctz: ev.timezone || "America/Los_Angeles",
    details: ev.descriptionHtml.replace(/<[^>]*>/g, "").slice(0, 900),
    location: where,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function locationLabel(ev: NonNullable<ReturnType<typeof getEvent>>): string {
  if (ev.isVirtual || ev.venue?.name === "Zoom") return "Online";
  if (!ev.venue) return "Location TBA";
  const parts = [ev.venue.name, ev.venue.city, ev.venue.state].filter(Boolean);
  return parts.join(", ");
}

export default function Event() {
  const { pathname } = useLocation();
  const now = useNow();
  // Resolve against the client's date once hydrated, so a series page shows the
  // genuinely-next occurrence rather than the one that was next at build time.
  const ev = getEvent(pathname, now ? chapterDay(now) : undefined);

  if (!ev) {
    return (
      <main id="main" className="container section text-center">
        <p className="kicker" style={{ color: "var(--red)" }}>
          Event not found
        </p>
        <h1>This event isn't on the calendar</h1>
        <p className="muted">
          It may have already happened or been rescheduled.
        </p>
        <p>
          <Link className="btn btn-primary" to="/calendar">
            Back to calendar
          </Link>
        </p>
      </main>
    );
  }

  const online = ev.isVirtual || ev.venue?.name === "Zoom";
  const registerLink = ev.website || ev.virtualUrl;

  return (
    <main id="main">
      <div className="container page-head">
        <p className="breadcrumb">
          <Link to="/calendar">Calendar</Link> ·{" "}
          {ev.categories.filter((c) => c !== "SV DSA")[0] ?? "Event"}
        </p>
        <h1>{ev.title}</h1>
      </div>

      <div className="container">
        <div className="event-detail-meta">
          <div>
            <h4>When</h4>
            <p>
              {longDate(ev.start)}
              <br />
              {ev.allDay
                ? "All day"
                : `${time(ev.start)} – ${time(ev.end)}`}{" "}
              <span className="muted">Pacific</span>
            </p>
            {ev.recurrence && (
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                🔁 {describeRecurrence(ev.recurrence)}
              </p>
            )}
          </div>
          <div>
            <h4>Where</h4>
            <p>{online ? "🖥 Online" : "📍 " + locationLabel(ev)}</p>
            {ev.venue?.address && !online && (
              <p className="muted">{ev.venue.address}</p>
            )}
          </div>
          {ev.organizer && (
            <div>
              <h4>Hosted by</h4>
              <p>{ev.organizer}</p>
            </div>
          )}
          {ev.cost && (
            <div>
              <h4>Cost</h4>
              <p>{ev.cost}</p>
            </div>
          )}
        </div>

        <p
          style={{
            margin: "1.5rem 0",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {registerLink && (
            <a className="btn btn-primary" href={registerLink}>
              {online ? "Join / register" : "RSVP"}
            </a>
          )}
          <a
            className="btn"
            href={`/calendar/event/${icsStem(ev.path)}.ics`}
            download
          >
            Add to calendar
          </a>
          <a
            href={googleTemplate(ev, online ? "Online" : locationLabel(ev))}
            target="_blank"
            rel="noreferrer"
          >
            Google Calendar
          </a>
        </p>

        {ev.descriptionHtml ? (
          <Prose html={ev.descriptionHtml} />
        ) : (
          <p className="muted">No description provided.</p>
        )}

        {ev.upcomingDates && ev.upcomingDates.length > 1 && (
          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Upcoming dates</h2>
            <ul className="occurrences">
              {ev.upcomingDates.map((d) => (
                <li key={d}>
                  <Link to={`${ev.path}${d}/`}>{longDate(d)}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div style={{ margin: "1.5rem 0" }}>
          {ev.categories
            .filter((c) => c !== "SV DSA")
            .map((c) => (
              <span className="tag tag--red" key={c}>
                {c}
              </span>
            ))}
        </div>

        <p style={{ marginTop: "2rem" }}>
          <Link to="/calendar">← Back to calendar</Link>
        </p>
      </div>
    </main>
  );
}
