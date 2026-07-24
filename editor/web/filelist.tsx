/**
 * Grouped content browser: pages / posts (by year) / events (by year) / config
 * as collapsible sections. Entries show the item's frontmatter TITLE (fetched
 * lazily per group, one GraphQL round-trip each, cached per base) with the
 * date from the filename as a prefix where present; the raw path stays
 * available via the filter (which searches both). Year groups are collapsed
 * except the most recent; filtering auto-expands matches.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ChangedFile } from "./api";

interface Groups {
  [section: string]: { [sub: string]: string[] };
}

const SECTION_ORDER = ["pages", "posts", "events", "config"];

function groupItems(items: string[]): Groups {
  const g: Groups = {};
  for (const p of items) {
    const [, section, ...rest] = p.split("/"); // content/<section>/...
    const sub = rest.length > 1 ? rest[0] : ""; // year bucket (posts/events)
    ((g[section] ??= {})[sub] ??= []).push(p);
  }
  return g;
}

const stem = (p: string) => (p.split("/").pop() ?? p).replace(/\.md$/, "");
const dateOf = (p: string) => stem(p).match(/\d{4}-\d{2}-\d{2}/)?.[0];

export function FileList({
  base,
  items,
  selected,
  changed,
  onOpen,
}: {
  base: string;
  items: string[];
  selected: string | null;
  changed: ChangedFile[];
  onOpen: (path: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  // Titles are per-base; drop the cache when the base changes.
  useEffect(() => {
    requested.current = new Set();
    setTitles({});
  }, [base]);

  const ensureTitles = (dir: string) => {
    if (!base || requested.current.has(dir)) return;
    requested.current.add(dir);
    api
      .titles(dir, base)
      .then((d) => setTitles((cur) => ({ ...cur, ...d.titles })))
      .catch(() => requested.current.delete(dir));
  };

  const changedSet = useMemo(
    () => new Set(changed.map((f) => f.path)),
    [changed],
  );

  const groups = useMemo(() => {
    const q = filter.toLowerCase();
    const kept = q
      ? items.filter(
          (p) =>
            p.toLowerCase().includes(q) ||
            (titles[p] ?? "").toLowerCase().includes(q),
        )
      : items;
    return groupItems(kept);
  }, [items, filter, titles]);

  const sections = SECTION_ORDER.filter((s) => groups[s]).concat(
    Object.keys(groups).filter((s) => !SECTION_ORDER.includes(s)),
  );

  // Load titles for the groups that render expanded by default.
  useEffect(() => {
    if (!items.length) return;
    const g = groupItems(items);
    for (const section of Object.keys(g)) {
      const subs = Object.keys(g[section]).sort().reverse();
      // Flat entries (pages, config, recurring-event series) always show, so
      // always load their titles; plus the newest year bucket (expanded).
      if (subs.includes("")) ensureTitles(`content/${section}`);
      const newestYear = subs.find((s) => s !== "");
      if (newestYear) ensureTitles(`content/${section}/${newestYear}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, base]);

  const entry = (p: string) => {
    const title = titles[p];
    const date = dateOf(p);
    return (
      <a
        key={p}
        className={`${selected === p ? "sel" : ""}${changedSet.has(p) ? " edited" : ""}`}
        onClick={() => onOpen(p)}
      >
        {changedSet.has(p) && (
          <span className="dot" aria-label="has draft edits" />
        )}
        {title ? (
          <>
            {date && <span className="date">{date}</span>}
            {title}
          </>
        ) : (
          stem(p)
        )}
      </a>
    );
  };

  return (
    <aside id="list">
      <input
        className="f"
        placeholder="filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {sections.map((section) => {
        // Flat entries (recurring series, pages) first, then years newest-first.
        const subs = Object.keys(groups[section]).sort((a, b) =>
          a === "" ? -1 : b === "" ? 1 : b.localeCompare(a),
        );
        const total = subs.reduce((n, s) => n + groups[section][s].length, 0);
        const firstYear = subs.find((s) => s !== "");
        return (
          <details key={section} open>
            <summary>
              {section} <span className="count">{total}</span>
            </summary>
            {subs.map((sub, i) =>
              sub === "" ? (
                <div key="flat" className="entries">
                  {groups[section][sub].map(entry)}
                </div>
              ) : (
                <details
                  key={sub}
                  className="year"
                  open={sub === firstYear || !!filter}
                  onToggle={(e) => {
                    if ((e.target as HTMLDetailsElement).open)
                      ensureTitles(`content/${section}/${sub}`);
                  }}
                >
                  <summary>
                    {sub}{" "}
                    <span className="count">{groups[section][sub].length}</span>
                  </summary>
                  <div className="entries">
                    {groups[section][sub].map(entry)}
                  </div>
                </details>
              ),
            )}
          </details>
        );
      })}
    </aside>
  );
}
