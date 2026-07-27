import type { MetaFunction } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { upcomingEvents } from "~/lib/data";
import { FACETS, matchesFacet, type FacetKey } from "~/lib/eventFacets";
import { dateParts, isUpcoming, longDate, time } from "~/lib/format";
import { useNow } from "~/lib/useNow";
import { SITE } from "~/lib/site";

export const meta: MetaFunction = () => [
  { title: `Calendar · ${SITE.name}` },
  {
    name: "description",
    content:
      "Upcoming Silicon Valley DSA meetings, actions, and social events.",
  },
  // Feed autodiscovery for calendar clients.
  {
    tagName: "link",
    rel: "alternate",
    type: "text/calendar",
    href: "/calendar/all.ics",
    title: `${SITE.name} events`,
  },
];

/** Absolute origin, available only after mount (keeps prerender/hydrate equal). */
function useOrigin(): string | null {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export default function Calendar() {
  const [filter, setFilter] = useState<FacetKey>("all");
  const [q, setQ] = useState("");
  const now = useNow();
  const origin = useOrigin();

  // Drop events that have already passed, relative to the *client's* current
  // day — so the list stays correct between deploys and as a left-open tab
  // crosses midnight. Before hydration (now === null) show the build snapshot.
  const upcoming = useMemo(
    () =>
      now
        ? upcomingEvents.filter((e) => isUpcoming(e.start, now))
        : upcomingEvents,
    [now],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return upcoming.filter(
      (e) =>
        matchesFacet(e, filter) &&
        (!needle || e.title.toLowerCase().includes(needle)),
    );
  }, [upcoming, filter, q]);

  // Subscription feed for whatever filter is active (search isn't part of it).
  const facet = FACETS.find((f) => f.key === filter) ?? FACETS[0];
  const feedPath = `/calendar/${facet.slug}.ics`;
  const feedHttps = origin ? `${origin}${feedPath}` : null;
  const feedWebcal = feedHttps
    ? feedHttps.replace(/^https?:/, "webcal:")
    : null;

  let lastMonth = "";

  return (
    <main id="main">
      <div className="container page-head">
        <h1>Calendar</h1>
        <p className="muted">
          {upcoming.length} upcoming events. All times Pacific.
        </p>
      </div>

      <div className="container" style={{ paddingBottom: "3rem" }}>
        <div className="filters">
          {FACETS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search events…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search events"
          style={{
            width: "100%",
            maxWidth: "24rem",
            padding: "0.6rem 0.9rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            color: "var(--text)",
            marginBottom: "1.5rem",
            font: "inherit",
          }}
        />

        <div className="subscribe">
          <div>
            <strong>Subscribe to this calendar</strong>
            <p className="muted">
              {facet.key === "all"
                ? "All chapter events"
                : `Only “${facet.label}”`}{" "}
              — updates automatically in your calendar app. Repeating meetings
              subscribe as real recurring events.
            </p>
          </div>
          <div className="subscribe__links">
            {/* Progressive enhancement: server-renders as a plain .ics link
                (which most OSes hand to the calendar app), then upgrades to
                webcal:// after mount so it subscribes instead of downloading.
                Never depends on JS to exist. */}
            <a className="btn btn-primary" href={feedWebcal ?? feedPath}>
              Subscribe
            </a>
            {feedHttps && (
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedHttps)}`}
                target="_blank"
                rel="noreferrer"
              >
                Google Calendar
              </a>
            )}
            <a href={feedPath} download>
              Download .ics
            </a>
          </div>
        </div>

        {shown.length === 0 && (
          <p className="muted">No events match that filter.</p>
        )}

        {shown.map((e) => {
          const { month, day } = dateParts(e.start);
          const monthLabel = longDate(e.start).replace(/^\w+, /, "");
          const monthKey = monthLabel.replace(/\d+,?\s?/g, "").trim();
          const showDivider = monthKey !== lastMonth;
          lastMonth = monthKey;
          const online = e.isVirtual || e.venue === "Zoom";
          return (
            <div key={e.id}>
              {showDivider && (
                <h2
                  style={{
                    fontSize: "1.1rem",
                    marginTop: "2rem",
                    color: "var(--muted)",
                  }}
                >
                  {monthKey}
                </h2>
              )}
              <Link to={e.path} className="event-row">
                <div className="event-row__date">
                  <div className="m">{month}</div>
                  <div className="d">{day}</div>
                  <div className="t">
                    {e.allDay ? "all day" : time(e.start)}
                  </div>
                </div>
                <div>
                  <h3>{e.title}</h3>
                  <p className="where">
                    {online ? "🖥 Online" : "📍 "}
                    {e.venue && e.venue !== "Zoom" ? e.venue : ""}
                  </p>
                  {e.excerpt && (
                    <p className="muted" style={{ margin: "0.25rem 0 0.5rem" }}>
                      {e.excerpt.slice(0, 160)}
                      {e.excerpt.length > 160 ? "…" : ""}
                    </p>
                  )}
                  {e.categories
                    .filter((c) => c !== "SV DSA")
                    .slice(0, 3)
                    .map((c) => (
                      <span className="tag" key={c}>
                        {c}
                      </span>
                    ))}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </main>
  );
}
