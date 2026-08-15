import { EXTERNAL, SOCIALS } from "~/lib/site";
import { SocialIcon } from "~/components/SocialIcon";
import { useNow } from "~/lib/useNow";
import site from "../../content/generated/site.json";

/**
 * The chapter's footer, which is the original's: a row of circular account
 * buttons, one loud invitation to the newsletter, and the copyright.
 *
 * It carried four columns of links for a while — working groups, committees,
 * get involved. The live site has never had them, and they were a second,
 * quietly diverging copy of the nav that is two feet above them in the header.
 * The nav is the nav; this is the sign-off.
 */
export function Footer() {
  // Build year in the prerendered HTML (stable across server + first client
  // render), then the live year after hydration — avoids a year-boundary
  // hydration mismatch.
  const now = useNow();
  const year = now ? now.getFullYear() : site.buildYear;
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <ul className="socials">
          {SOCIALS.map((s) => (
            <li key={s.label}>
              {/* The accessible name is the only place the network is named,
                  so it says what the link does, not just where it goes. */}
              <a href={s.href} aria-label={`Silicon Valley DSA on ${s.label}`}>
                <SocialIcon label={s.label} />
              </a>
            </li>
          ))}
          <li>
            <a href={`mailto:${EXTERNAL.email}`} aria-label="Email the chapter">
              <SocialIcon label="Email" />
            </a>
          </li>
        </ul>

        <div className="site-footer__signup">
          <a className="btn btn-primary btn-lg" href={EXTERNAL.newsletter}>
            Sign up for our newsletter!
          </a>
        </div>
      </div>
      <div className="site-footer__bar">
        <div className="container">© {year} Silicon Valley DSA.</div>
      </div>
    </footer>
  );
}
