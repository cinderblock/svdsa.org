import type { MetaFunction } from "react-router";
import { Prose } from "~/components/Prose";
import { getPage } from "~/lib/content";
import { EXTERNAL, SITE, SOCIALS } from "~/lib/site";

export const meta: MetaFunction = () => [
  { title: `Contact · ${SITE.name}` },
  {
    name: "description",
    content: "Get in touch with Silicon Valley DSA.",
  },
];

export default function Contact() {
  // The words are content (content/pages/contact.md), so chapter editors can
  // change them; this route only adds the socials.
  const page = getPage("/contact/");

  return (
    <main id="main">
      <div className="container page-head">
        <h1>{page?.title ?? "Get in touch"}</h1>
        <p className="lead muted">
          Questions, press, or want to plug into the work? Email us at{" "}
          <a href={`mailto:${EXTERNAL.email}`}>{EXTERNAL.email}</a>, or find us
          on social media.
        </p>
      </div>

      <div className="container" style={{ paddingBottom: "3rem" }}>
        {page?.html && <Prose html={page.html} />}

        <h2 style={{ fontSize: "1.25rem", marginTop: "2.5rem" }}>Follow us</h2>
        {/* One list, matching the footer's (content/config/socials.json) —
            the per-branch accounts aren't maintained separately here. */}
        <div className="social-buttons">
          {SOCIALS.map((s) => (
            <a key={s.label} className="btn btn-primary" href={s.href}>
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
