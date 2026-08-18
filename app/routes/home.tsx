import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { expandEvents, postsIndex, upcomingEvents } from "~/lib/data";
import { isUpcoming, shortDate } from "~/lib/format";
import { useNow } from "~/lib/useNow";
import { EventCard } from "~/components/EventCard";
// Every word on this page comes through these, so the browser editor can render
// this very component with live values and make each one editable in place.
import { HomeBody, Slot } from "~/components/HomeSlot";
import { CHAPTER_PHOTOS, EXTERNAL, SITE, WORKING_GROUPS } from "~/lib/site";
import { chapterDay, isTodayOrLater } from "~/lib/today";

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
      ? expandEvents(chapterDay(now), 120).filter((e) =>
          isTodayOrLater(e.start, now),
        )
      : upcomingEvents
  ).slice(0, 4);
  const latest = postsIndex.slice(0, 3);

  return (
    <main id="main">
      <section className="hero">
        {/* The live site's frontispiece: emblem on the red at the left, and a
            white plate card at the right carrying the welcome. Every word in
            the plate is still a <Slot>, so the browser editor edits this
            layout in place exactly as it does red's. */}
        <div className="container hero__grid">
          <div className="hero__logo">
            <img
              src="/svdsa-logo.svg"
              alt="Silicon Valley DSA emblem"
              width={190}
              height={269}
            />
          </div>
          <div className="plate">
            {/* The wordmark, the rule and the welcome paragraphs are all one
                document — content/pages/home.md's body — because that is what
                they are on the original, where the plate holds the Welcome
                page's entry-content. Bold, italics and links come free. */}
            <HomeBody />
            <div className="hero__actions">
              <Link className="btn btn-primary" to="/join/">
                <Slot k="ctaPrimary" />
              </Link>
              <Link className="btn btn-outline" to="/calendar">
                <Slot k="ctaEvents" />
              </Link>
              <a className="btn btn-outline" href={EXTERNAL.donate}>
                <Slot k="ctaDonate" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Latest dispatches — the dark band sits directly under the
          frontispiece, as it does on the live site: what the chapter has been
          saying is the first thing after who the chapter is. */}
      <section className="section section--dark">
        <div className="container">
          <div className="section__head">
            <h2>
              <Slot k="dispatchesHeading" />
            </h2>
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

      {CHAPTER_PHOTOS.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section__head">
              <h2>
                <Slot k="photosHeading" />
              </h2>
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
            <h2>
              <Slot k="eventsHeading" />
            </h2>
            <Link to="/calendar">Full calendar →</Link>
          </div>
          <div className="stack">
            {nextEvents.map((e) => (
              <EventCard key={e.id} e={e} compact />
            ))}
          </div>
        </div>
      </section>

      {/* Working groups */}
      <section className="section section--alt">
        <div className="container">
          <div className="section__head">
            <h2>
              <Slot k="groupsHeading" />
            </h2>
            <Link to="/about/">About the chapter →</Link>
          </div>
          <p
            className="muted"
            style={{ maxWidth: "44rem", marginTop: "-0.75rem" }}
          >
            <Slot k="groupsIntro" />
          </p>
          <div className="grid grid--cards" style={{ marginTop: "1.5rem" }}>
            {WORKING_GROUPS.map((w) => (
              <Link
                key={w.to}
                to={w.to}
                className="card"
                style={{ textDecoration: "none" }}
              >
                <h3>
                  {w.icon && (
                    <span className="card__icon" aria-hidden="true">
                      {w.icon}
                    </span>
                  )}
                  {w.label}
                </h3>
                <span className="card__more">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Join CTA. Plain rather than `--alt`: with Dispatches moved up, the
          working groups above are the tinted band, and two `--alt` sections in
          a row read as one long gray block split by a hairline. */}
      <section className="section">
        <div className="container text-center">
          <h2>
            <Slot k="closingHeading" />
          </h2>
          <p
            className="muted"
            style={{ maxWidth: "38rem", margin: "0 auto 1.5rem" }}
          >
            <Slot k="closingIntro" />
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
