import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { postsIndex } from "~/lib/data";
import { shortDate } from "~/lib/format";
import { SITE } from "~/lib/site";

export const meta: MetaFunction = () => [
  { title: `Blog · ${SITE.name}` },
  {
    name: "description",
    content:
      "Dispatches, statements, and updates from Silicon Valley DSA members.",
  },
];

export default function Blog() {
  return (
    <main id="main">
      <div className="container page-head">
        <h1>Dispatches</h1>
        <p className="muted">
          Statements, reflections, and updates from the chapter.
        </p>
      </div>
      <div className="container" style={{ paddingBottom: "3rem" }}>
        <div className="grid grid--cards">
          {postsIndex.map((p) => (
            <Link
              key={p.id}
              to={p.path}
              className="card"
              style={{ textDecoration: "none" }}
            >
              <div className="meta">
                {shortDate(p.date)}
                {p.categories[0] ? ` · ${p.categories[0]}` : ""}
              </div>
              <h3>{p.title}</h3>
              <p>
                {p.excerpt.slice(0, 150)}
                {p.excerpt.length > 150 ? "…" : ""}
              </p>
              <span className="card__more">Read →</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
