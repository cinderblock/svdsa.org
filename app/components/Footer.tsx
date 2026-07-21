import { Link } from "react-router";
import {
  COMMITTEES,
  EXTERNAL,
  RESOURCES,
  SOCIALS,
  WORKING_GROUPS,
} from "~/lib/site";
import { useNow } from "~/lib/useNow";
import site from "../../content/generated/site.json";

export function Footer() {
  // Build year in the prerendered HTML (stable across server + first client
  // render), then the live year after hydration — avoids a year-boundary
  // hydration mismatch.
  const now = useNow();
  const year = now ? now.getFullYear() : site.buildYear;
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div>
          <h4>Silicon Valley DSA</h4>
          <p className="muted" style={{ margin: "0 0 0.5rem" }}>
            Building working-class power in the South Bay. Not a political party
            — a community fighting for a radically equitable society.
          </p>
          <div className="socials">
            {SOCIALS.map((s) => (
              <a key={s.label} href={s.href}>
                {s.label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4>Working Groups</h4>
          <ul>
            {WORKING_GROUPS.slice(0, 6).map((w) => (
              <li key={w.to}>
                <Link to={w.to}>{w.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Committees</h4>
          <ul>
            {COMMITTEES.slice(0, 6).map((c) => (
              <li key={c.to}>
                <Link to={c.to}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Get Involved</h4>
          <ul>
            <li>
              <Link to="/join/">Join DSA</Link>
            </li>
            <li>
              <a href={EXTERNAL.donate}>Donate</a>
            </li>
            <li>
              <Link to="/calendar">Calendar</Link>
            </li>
            <li>
              <Link to="/contact/">Contact</Link>
            </li>
            {RESOURCES.slice(0, 2).map((r) => (
              <li key={r.to}>
                <Link to={r.to}>{r.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="site-footer__bar">
        <div className="container">
          © {year} Silicon Valley DSA · In solidarity ·{" "}
          <Link to="/bylaws/">Bylaws</Link>
        </div>
      </div>
    </footer>
  );
}
