import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { postsIndex, upcomingEvents } from "~/lib/data";
import { dateParts, isUpcoming, shortDate, time } from "~/lib/format";
import { useNow } from "~/lib/useNow";
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
  const now = useNow();
  // Next few events relative to the client's current day (see useNow); before
  // hydration (now === null) render the build snapshot.
  const nextEvents = (
    now
      ? upcomingEvents.filter((e) => isUpcoming(e.start, now))
      : upcomingEvents
  ).slice(0, 4);
  const latest = postsIndex.slice(0, 3);

  return (
    <main id="main">
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__logo">
            <img
              src="/svdsa-logo.svg"
              alt="Silicon Valley DSA rose emblem"
              width={190}
              height={269}
            />
          </div>
          <div className="plate">
            <h1 className="plate__wordmark">
              <span className="sv">Silicon Valley</span>
              <span className="dsa">Democratic Socialists of America</span>
            </h1>
            <hr />
            <p>
              We believe economies and societies should be run{" "}
              <strong>democratically</strong> to meet the needs of the many, not
              the few. We're <em>not</em> a political party… we're a community
              building <strong>working class power</strong> while fighting for a{" "}
              <strong>radically equitable</strong> society. DSA is the{" "}
              <strong>largest socialist organization in America</strong>, with{" "}
              <strong>100,000+ members</strong> nationwide.
            </p>
            <p>
              Come join us in supporting key local causes, all while{" "}
              <strong>building community</strong> in new and meaningful ways.
            </p>
            <p>
              We'd love to see you at one of our{" "}
              <Link to="/calendar">
                <strong>events</strong>
              </Link>
              ! To stay in touch,{" "}
              <a href={EXTERNAL.newsletter}>
                <strong>sign up</strong>
              </a>{" "}
              for our newsletter. <strong>Solidarity Forever!</strong>
            </p>
            <div className="hero__actions">
              <Link className="btn btn-primary" to="/join/">
                Join us
              </Link>
              <Link className="btn btn-outline" to="/calendar">
                Upcoming events
              </Link>
              <a className="btn btn-outline" href={EXTERNAL.donate}>
                Donate
              </a>
            </div>
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
            energy is. No experience required.
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
      <section className="section section--dark">
        <div className="container">
          <div className="section__head">
            <h2>Dispatches</h2>
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
