import { Link, NavLink } from "react-router";
import {
  NAV,
  isGroup,
  type NavGroup,
  type NavLink as NavLinkT,
} from "~/lib/site";

/**
 * The chapter's name, once, beside the rose — as the original sets it. It was
 * two stacked lines here for a while; the live top bar has never had a second
 * line, and the wordmark that spells the name out in full is the hero's job.
 */
function Brand() {
  return (
    <Link to="/" className="brand">
      <img
        className="brand__mark"
        src="/dsa-rose-mark.svg"
        alt=""
        width={35}
        height={35}
      />
      <span className="brand__name">Silicon Valley DSA</span>
    </Link>
  );
}

/** An off-site target (dues, merch) still belongs in the menu it belongs in. */
const isExternal = (to: string) => /^[a-z]+:/i.test(to);

function Leaf({
  item,
  className,
  children,
}: {
  item: NavLinkT;
  className?: string;
  children?: React.ReactNode;
}) {
  const label = (
    <>
      {item.icon && (
        <span className="nav__icon" aria-hidden="true">
          {item.icon}
        </span>
      )}
      {item.label}
      {children}
    </>
  );
  return isExternal(item.to) ? (
    <a className={className} href={item.to}>
      {label}
    </a>
  ) : (
    <NavLink className={className} to={item.to}>
      {label}
    </NavLink>
  );
}

/**
 * One menu entry, at any depth.
 *
 * `depth` only decides which way a submenu opens — down from the bar, sideways
 * from inside a menu — so the recursion carries no other knowledge of where it
 * is.
 */
function Entry({ node, depth }: { node: NavLinkT | NavGroup; depth: number }) {
  const group = isGroup(node) ? node : null;
  const link = node as NavLinkT;
  return (
    <li className={depth === 0 ? "nav__item" : undefined}>
      {node.to ? (
        <Leaf item={link} className={depth === 0 ? "nav__link" : undefined}>
          {/* About is both a page and a menu. The caret is the only thing
              saying there is more under it, so a link that opens one gets it
              too — the original marks every menu the same way. */}
          {group && <span aria-hidden="true"> ▾</span>}
        </Leaf>
      ) : (
        <span
          className={depth === 0 ? "nav__link" : "nav__parent"}
          aria-haspopup="true"
        >
          {node.label} ▾
        </span>
      )}
      {group && (
        <ul className={depth === 0 ? "nav__menu" : "nav__menu nav__menu--sub"}>
          {group.children!.map((c) => (
            <Entry key={c.label} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The same tree, indented rather than flown out, for the mobile panel. */
function PanelEntry({ node }: { node: NavLinkT | NavGroup }) {
  const group = isGroup(node) ? node : null;
  return (
    <li>
      {node.to ? (
        <Leaf item={node as NavLinkT} />
      ) : (
        <strong>{node.label}</strong>
      )}
      {group && (
        <ul className="sub">
          {group.children!.map((c) => (
            <PanelEntry key={c.label} node={c} />
          ))}
        </ul>
      )}
    </li>
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
              <Entry key={group.label} node={group} depth={0} />
            ))}
          </ul>
        </nav>

        {/* Mobile nav — native disclosure, no JS */}
        <details className="nav-toggle">
          <summary aria-label="Menu">☰ Menu</summary>
          <div className="nav-panel">
            <ul>
              {NAV.map((group) => (
                <PanelEntry key={group.label} node={group} />
              ))}
            </ul>
          </div>
        </details>
      </div>
    </header>
  );
}
