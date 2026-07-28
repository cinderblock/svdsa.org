/**
 * Content browser, organised the way the SITE is — not the way the repo is.
 *
 * An editor looking for "the Housing page" shouldn't have to know it lives at
 * `content/pages/housing.md`. Pages are therefore grouped using the site's own
 * navigation (`content/config/navigation.json`, shipped with the file list):
 * Main pages, Working Groups, Committees, Resources, then anything left over.
 * Events and posts keep their year buckets, newest first.
 *
 * Each row shows the item's title plus a second line of detail (its URL on the
 * site, or the event's date), and every group can be sorted.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ChangedFile, type ItemMeta, type SiteNav } from "./api";

export type SortKey = "site" | "title" | "date" | "recent";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "site", label: "Site order" },
  { key: "title", label: "A–Z" },
  { key: "date", label: "Date" },
  { key: "recent", label: "Newest" },
];

interface Group {
  id: string;
  label: string;
  icon: string;
  items: string[];
  /** Collapsed unless it's small or the editor opened it. */
  openByDefault: boolean;
}

const stem = (p: string) => (p.split("/").pop() ?? p).replace(/\.md$/, "");
const dateInName = (p: string) => stem(p).match(/\d{4}-\d{2}-\d{2}/)?.[0];

/** content/pages/housing.md → /housing/ (the tree mirrors the URL). */
const urlForPage = (p: string) =>
  "/" + p.replace(/^content\/pages\//, "").replace(/\.md$/, "") + "/";

/**
 * Build the group list. Pages follow the site's nav; everything else keeps the
 * structure the repo already has (years for events/posts).
 */
function buildGroups(items: string[], nav: SiteNav | null): Group[] {
  const pages = items.filter((p) => p.startsWith("content/pages/"));
  const used = new Set<string>();
  const groups: Group[] = [];

  const bySection = (
    id: string,
    label: string,
    icon: string,
    links: { to: string }[] | undefined,
  ) => {
    if (!links?.length) return;
    const wanted = new Set(links.map((l) => l.to));
    const found = pages.filter((p) => wanted.has(urlForPage(p)));
    found.forEach((p) => used.add(p));
    if (found.length)
      groups.push({ id, label, icon, items: found, openByDefault: true });
  };

  // The handful of pages the site's top level points at.
  const MAIN = ["/", "/about/", "/join/", "/donate/", "/contact/", "/bylaws/"];
  const main = pages.filter((p) => MAIN.includes(urlForPage(p)));
  main.forEach((p) => used.add(p));
  if (main.length)
    groups.push({
      id: "main",
      label: "Main pages",
      icon: "🏠",
      items: main,
      openByDefault: true,
    });

  bySection("wg", "Working groups", "✊", nav?.workingGroups);
  bySection("cmte", "Committees", "🗂", nav?.committees);
  bySection("res", "Resources", "📎", nav?.resources);

  const other = pages.filter((p) => !used.has(p));
  if (other.length)
    groups.push({
      id: "other",
      label: "Other pages",
      icon: "📄",
      items: other,
      openByDefault: false,
    });

  // Events: recurring series live at the top level, one-offs in year folders.
  const events = items.filter((p) => p.startsWith("content/events/"));
  const series = events.filter((p) => p.split("/").length === 3);
  if (series.length)
    groups.push({
      id: "series",
      label: "Recurring meetings",
      icon: "🔁",
      items: series,
      openByDefault: true,
    });
  byYear(
    events.filter((p) => !series.includes(p)),
    "Events",
    "📅",
    groups,
  );
  byYear(
    items.filter((p) => p.startsWith("content/posts/")),
    "Blog posts",
    "📰",
    groups,
  );

  const config = items.filter((p) => p.startsWith("content/config/"));
  if (config.length)
    groups.push({
      id: "config",
      label: "Site settings",
      icon: "⚙️",
      items: config,
      openByDefault: false,
    });

  return groups;
}

function byYear(items: string[], label: string, icon: string, out: Group[]) {
  const years = new Map<string, string[]>();
  for (const p of items) {
    const y = p.split("/")[2] ?? "";
    (years.get(y) ?? years.set(y, []).get(y)!).push(p);
  }
  const sorted = [...years.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  sorted.forEach(([year, list], i) =>
    out.push({
      id: `${label}-${year}`,
      label: `${label} · ${year}`,
      icon,
      items: list,
      openByDefault: i === 0,
    }),
  );
}

export function FileList({
  base,
  items,
  nav,
  selected,
  changed,
  onOpen,
}: {
  base: string;
  items: string[];
  nav: SiteNav | null;
  selected: string | null;
  changed: ChangedFile[];
  onOpen: (path: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("site");
  const [meta, setMeta] = useState<Record<string, ItemMeta>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    requested.current = new Set();
    setMeta({});
  }, [base]);

  /** Metadata is fetched per repo directory (one round-trip each). */
  const ensureMeta = (paths: string[]) => {
    const dirs = new Set(paths.map((p) => p.slice(0, p.lastIndexOf("/"))));
    for (const dir of dirs) {
      if (!base || requested.current.has(dir)) continue;
      requested.current.add(dir);
      api
        .meta(dir, base)
        .then((d) => setMeta((cur) => ({ ...cur, ...d.meta })))
        .catch(() => requested.current.delete(dir));
    }
  };

  const changedSet = useMemo(
    () => new Set(changed.map((f) => f.path)),
    [changed],
  );

  const groups = useMemo(() => buildGroups(items, nav), [items, nav]);

  // Load metadata for groups that start open, so their labels aren't paths.
  useEffect(() => {
    for (const g of groups) if (g.openByDefault) ensureMeta(g.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, base]);

  const q = filter.trim().toLowerCase();
  const matches = (p: string) =>
    !q ||
    p.toLowerCase().includes(q) ||
    (meta[p]?.title ?? "").toLowerCase().includes(q) ||
    (meta[p]?.url ?? "").toLowerCase().includes(q);

  const sortItems = (list: string[]) => {
    const copy = [...list];
    const dateOf = (p: string) => meta[p]?.date ?? dateInName(p) ?? "";
    const titleOf = (p: string) => (meta[p]?.title ?? stem(p)).toLowerCase();
    if (sort === "title")
      copy.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    else if (sort === "date")
      copy.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    else if (sort === "recent")
      copy.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    else copy.sort((a, b) => a.localeCompare(b)); // "site" = repo/nav order
    return copy;
  };

  return (
    <aside id="list">
      <input
        className="f"
        placeholder="Search pages, events, posts…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Search content"
      />
      <label className="sortbar">
        <span>Sort</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort content"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {groups.map((g) => {
        const shown = sortItems(g.items.filter(matches));
        if (!shown.length) return null;
        return (
          <details
            key={g.id}
            className={`grp grp--${g.id.split("-")[0]}`}
            open={g.openByDefault || !!q}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) ensureMeta(g.items);
            }}
          >
            <summary>
              <span className="grp__icon" aria-hidden="true">
                {g.icon}
              </span>
              {g.label}
              <span className="count">{shown.length}</span>
            </summary>
            <div className="entries">
              {shown.map((p) => {
                const m = meta[p];
                const detail =
                  m?.date?.slice(0, 16).replace("T", " ") ??
                  m?.url ??
                  (p.startsWith("content/pages/") ? urlForPage(p) : stem(p));
                return (
                  <button
                    type="button"
                    key={p}
                    aria-current={selected === p}
                    className={`entry${selected === p ? " sel" : ""}`}
                    onClick={() => onOpen(p)}
                  >
                    <span className="entry__title">
                      {changedSet.has(p) && (
                        <span className="dot" aria-label="has draft edits" />
                      )}
                      {m?.recurs && (
                        <span aria-hidden="true" className="entry__recurs">
                          🔁
                        </span>
                      )}
                      {m?.title ?? stem(p)}
                    </span>
                    <span className="entry__detail">{detail}</span>
                  </button>
                );
              })}
            </div>
          </details>
        );
      })}
    </aside>
  );
}
