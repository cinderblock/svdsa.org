import { Link, NavLink } from "react-router";
import { EXTERNAL, NAV } from "~/lib/site";

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Silicon Valley DSA — home">
      <img
        className="brand__mark"
        src="/favicon-192.png"
        alt=""
        width={34}
        height={34}
      />
      <span className="brand__name">
        <span>
          <b>Silicon Valley</b>
        </span>
        <small>Democratic Socialists of America</small>
      </span>
    </Link>
  );
}

export function Header() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Brand />

        {/* Desktop nav */}
        <nav className="nav" aria-label="Primary">
          <ul className="nav__list">
            {NAV.map((group) => (
              <li className="nav__item" key={group.label}>
                {group.to ? (
                  <NavLink to={group.to} className="nav__link">
                    {group.label}
                  </NavLink>
                ) : (
                  <span className="nav__link" aria-haspopup="true">
                    {group.label} ▾
                  </span>
                )}
                {group.children && (
                  <ul className="nav__menu">
                    {group.children.map((c) => (
                      <li key={c.to}>
                        <NavLink to={c.to}>{c.label}</NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            <li className="nav__cta">
              <a className="btn btn-outline" href={EXTERNAL.donate}>
                Donate
              </a>
            </li>
            <li>
              <Link className="btn btn-primary" to="/join/">
                Join
              </Link>
            </li>
          </ul>
        </nav>

        {/* Mobile nav — native disclosure, no JS */}
        <details className="nav-toggle">
          <summary aria-label="Menu">☰ Menu</summary>
          <div className="nav-panel">
            <ul>
              {NAV.map((group) => (
                <li key={group.label}>
                  {group.to ? (
                    <NavLink to={group.to}>{group.label}</NavLink>
                  ) : (
                    <strong>{group.label}</strong>
                  )}
                  {group.children && (
                    <ul className="sub">
                      {group.children.map((c) => (
                        <li key={c.to}>
                          <NavLink to={c.to}>{c.label}</NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              <li>
                <Link to="/join/">Join</Link>
              </li>
              <li>
                <a href={EXTERNAL.donate}>Donate</a>
              </li>
            </ul>
          </div>
        </details>
      </div>
    </header>
  );
}
