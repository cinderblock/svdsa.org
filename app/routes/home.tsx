import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { postsIndex, upcomingEvents } from "~/lib/data";
import { dateParts, shortDate, time } from "~/lib/format";
import { CHAPTER_PHOTOS, EXTERNAL, SITE, WORKING_GROUPS } from "~/lib/site";

export const meta: MetaFunction = () => {
  const title = `${SITE.name} — ${SITE.tagline}`;
  return [
    { title },
    { name: "description", content: SITE.description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: SITE.description },
    { name: "twitter:card", content: "summary" },
  ];
};

export default function Home() {
  const nextEvents = upcomingEvents.slice(0, 4);
  const latest = postsIndex.slice(0, 3);

  return (
    <main id="main">
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <p className="kicker">Silicon Valley · South Bay</p>
            <h1>
              Building working-class power,
              <br />
              for the many — not the few.
            </h1>
            <p className="lead">
              We're not a political party — we're a community building
              working-class power while fighting for a radically equitable
              society. DSA is the largest socialist organization in America,
              with 100,000+ members nationwide.
            </p>
            <div className="hero__actions">
              <Link className="btn btn-primary" to="/join/">
                Join us
              </Link>
              <Link className="btn btn-outline" to="/calendar">
                See upcoming events
              </Link>
              <a className="btn btn-outline" href={EXTERNAL.donate}>
                Donate
              </a>
            </div>
          </div>
          <div className="hero__art">
            <img
              src="/solidarity.svg"
              alt="Illustration of a crowd raising fists in solidarity"
              width={800}
              height={600}
            />
          </div>
        </div>
      </section>

      {CHAPTER_PHOTOS.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section__head">
              <h2>In the streets</h2>
            </div>
            <div className="photo-strip">
              {CHAPTER_PHOTOS.map((p) => (
                <figure key={p.src}>
                  <img src={p.src} alt={p.alt} loading="lazy" />
                  {p.caption && <figcaption>{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Upcoming events */}
      <section className="section">
        <div className="container">
          <div className="section__head">
            <h2>Upcoming events</h2>
            <Link to="/calendar">Full calendar →</Link>
          </div>
          <div className="stack">
            {nextEvents.map((e) => {
              const { month, day } = dateParts(e.start);
              return (
                <Link className="event-row" key={e.id} to={e.path}>
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
                      {e.isVirtual || e.venue === "Zoom" ? "🖥 Online" : "📍 "}
                      {e.venue && e.venue !== "Zoom" ? e.venue : ""}
                    </p>
                    {e.categories.slice(0, 2).map((c) => (
                      <span className="tag" key={c}>
                        {c}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Working groups */}
      <section className="section section--alt">
        <div className="container">
          <div className="section__head">
            <h2>Where the work happens</h2>
            <Link to="/about/">About the chapter →</Link>
          </div>
          <p
            className="muted"
            style={{ maxWidth: "44rem", marginTop: "-0.75rem" }}
          >
            Members organize through working groups. Jump in wherever your
            energy is — no experience required.
          </p>
          <div className="grid grid--cards" style={{ marginTop: "1.5rem" }}>
            {WORKING_GROUPS.map((w) => (
              <Link
                key={w.to}
                to={w.to}
                className="card"
                style={{ textDecoration: "none" }}
              >
                <h3>{w.label}</h3>
                <span className="card__more">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Latest dispatches */}
      <section className="section">
        <div className="container">
          <div className="section__head">
            <h2>Latest dispatches</h2>
            <Link to="/blog">All posts →</Link>
          </div>
          <div className="grid grid--cards">
            {latest.map((p) => (
              <Link
                key={p.id}
                to={p.path}
                className="card"
                style={{ textDecoration: "none" }}
              >
                <div className="meta">{shortDate(p.date)}</div>
                <h3>{p.title}</h3>
                <p>{p.excerpt.slice(0, 140)}…</p>
                <span className="card__more">Read →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Join CTA */}
      <section className="section section--alt">
        <div className="container text-center">
          <h2>Ready to get organized?</h2>
          <p
            className="muted"
            style={{ maxWidth: "38rem", margin: "0 auto 1.5rem" }}
          >
            Come to an event, sign up for the newsletter, or become a member
            today. Solidarity Forever!
          </p>
          <div className="hero__actions" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" to="/join/">
              Join DSA
            </Link>
            <a className="btn btn-outline" href={EXTERNAL.newsletter}>
              Newsletter signup
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
