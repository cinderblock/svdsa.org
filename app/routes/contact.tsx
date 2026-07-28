import type { MetaFunction } from "react-router";
import { EmbedFrame } from "~/components/EmbedFrame";
import { EXTERNAL, SITE, SOCIALS } from "~/lib/site";

export const meta: MetaFunction = () => [
  { title: `Contact · ${SITE.name}` },
  {
    name: "description",
    content: "Get in touch with Silicon Valley DSA.",
  },
];

const contactFormEmbed = EXTERNAL.contactForm.includes("?")
  ? `${EXTERNAL.contactForm}&embedded=true`
  : `${EXTERNAL.contactForm}?embedded=true`;

export default function Contact() {
  return (
    <main id="main">
      <div className="container page-head">
        <h1>Get in touch</h1>
        <p className="lead muted">
          Questions, press, or want to plug into the work? Send us a note or
          find us on social media.
        </p>
      </div>

      <div className="container" style={{ paddingBottom: "3rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>Follow us</h2>
        {/* One list, matching the footer's (content/config/socials.json) —
            the per-branch accounts aren't maintained separately here. */}
        <div className="social-buttons">
          {SOCIALS.map((s) => (
            <a key={s.label} className="btn btn-primary" href={s.href}>
              {s.label}
            </a>
          ))}
        </div>
        <EmbedFrame
          src={contactFormEmbed}
          title="Contact Silicon Valley DSA"
          height={900}
        />
      </div>
    </main>
  );
}
