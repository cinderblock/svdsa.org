import type { MetaFunction } from "react-router";
import { Link, useLocation } from "react-router";
import { getPage, getPost } from "~/lib/content";
import { shortDate } from "~/lib/format";
import { Prose } from "~/components/Prose";
import { PAGE_ICONS, SITE } from "~/lib/site";

export const meta: MetaFunction = ({ location }) => {
  const post = getPost(location.pathname);
  const page = post ?? getPage(location.pathname);
  const title = page
    ? `${page.title} · ${SITE.name}`
    : `Not found · ${SITE.name}`;
  const description = page?.excerpt || SITE.description;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: page?.title ?? "Page not found" },
    { property: "og:description", content: description },
    { property: "og:type", content: post ? "article" : "website" },
  ];
};

function NotFound() {
  return (
    <main id="main" className="container section text-center">
      <p className="kicker" style={{ color: "var(--red)" }}>
        404
      </p>
      <h1>Page not found</h1>
      <p className="muted">
        That page doesn't exist or has moved. It may have lived on the old site.
      </p>
      <p>
        <Link className="btn btn-primary" to="/">
          Back home
        </Link>
      </p>
    </main>
  );
}

export default function Content() {
  const { pathname } = useLocation();

  const post = getPost(pathname);
  if (post) {
    return (
      <main id="main">
        <div className="container page-head">
          <p className="breadcrumb">
            <Link to="/blog">Blog</Link> · {post.categories[0] ?? "Dispatch"}
          </p>
          <h1>{post.title}</h1>
          <p className="muted">{shortDate(post.date)}</p>
        </div>
        <article className="container">
          <Prose html={post.html} />
          <p style={{ marginTop: "2rem" }}>
            <Link to="/blog">← All dispatches</Link>
          </p>
        </article>
      </main>
    );
  }

  const page = getPage(pathname);
  if (page) {
    // Working-group / committee pages carry the group's emoji (navigation.json).
    const icon = PAGE_ICONS[page.path];
    return (
      <main id="main">
        <div className="container page-head">
          <h1>
            {icon && (
              <span className="page-icon" aria-hidden="true">
                {icon}
              </span>
            )}
            {page.title}
          </h1>
        </div>
        <article className="container">
          <Prose html={page.html} />
        </article>
      </main>
    );
  }

  return <NotFound />;
}
