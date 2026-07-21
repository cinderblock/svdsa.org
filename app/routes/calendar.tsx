import type { MetaFunction } from "react-router";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { upcomingEvents } from "~/lib/data";
import { dateParts, longDate, time } from "~/lib/format";
import { SITE } from "~/lib/site";

export const meta: MetaFunction = () => [
  { title: `Calendar · ${SITE.name}` },
  {
    name: "description",
    content:
      "Upcoming Silicon Valley DSA meetings, actions, and social events.",
  },
];

type FilterKey = "all" | "wg" | "committee" | "social" | "newbie" | "online";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "wg", label: "Working Groups" },
  { key: "committee", label: "Committees" },
  { key: "social", label: "Social" },
  { key: "newbie", label: "Newbie-friendly" },
  { key: "online", label: "Online" },
];

function matches(ev: (typeof upcomingEvents)[number], key: FilterKey): boolean {
  const cats = ev.categories.map((c) => c.toLowerCase());
  switch (key) {
    case "all":
      return true;
    case "wg":
      return cats.some((c) => c.startsWith("wg"));
    case "committee":
      return cats.some((c) => c.includes("committee"));
    case "social":
      return cats.some((c) => c.includes("social"));
    case "newbie":
      return cats.some((c) => c.includes("newbie"));
    case "online":
      return ev.isVirtual || ev.venue === "Zoom";
  }
}

export default function Calendar() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return upcomingEvents.filter(
      (e) =>
        matches(e, filter) &&
        (!needle || e.title.toLowerCase().includes(needle)),
    );
  }, [filter, q]);

  let lastMonth = "";

  return (
    <main id="main">
      <div className="container page-head">
        <h1>Calendar</h1>
        <p className="muted">
          {upcomingEvents.length} upcoming events. All times Pacific.
        </p>
      </div>

      <div className="container" style={{ paddingBottom: "3rem" }}>
        <div className="filters">
          {FILTERS.map((f) => (
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
