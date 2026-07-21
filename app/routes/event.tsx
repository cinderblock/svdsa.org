import type { MetaFunction } from "react-router";
import { Link, useLocation } from "react-router";
import { getEvent } from "~/lib/events";
import { longDate, time } from "~/lib/format";
import { Prose } from "~/components/Prose";
import { SITE } from "~/lib/site";

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

function locationLabel(ev: NonNullable<ReturnType<typeof getEvent>>): string {
  if (ev.isVirtual || ev.venue?.name === "Zoom") return "Online";
  if (!ev.venue) return "Location TBA";
  const parts = [ev.venue.name, ev.venue.city, ev.venue.state].filter(Boolean);
  return parts.join(", ");
}

export default function Event() {
  const { pathname } = useLocation();
  const ev = getEvent(pathname);

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

        {registerLink && (
          <p style={{ margin: "1.5rem 0" }}>
            <a className="btn btn-primary" href={registerLink}>
              {online ? "Join / register" : "RSVP"}
            </a>
          </p>
        )}

        {ev.descriptionHtml ? (
          <Prose html={ev.descriptionHtml} />
        ) : (
          <p className="muted">No description provided.</p>
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
