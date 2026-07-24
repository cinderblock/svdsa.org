/**
 * Grouped content browser: pages / posts (by year) / events (by year) / config
 * as collapsible sections instead of one giant flat list. Year groups are
 * collapsed except the most recent; filtering searches everything and
 * auto-expands groups with matches.
 */

import { useMemo, useState } from "react";
import type { ChangedFile } from "./api";

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

const label = (p: string) => (p.split("/").pop() ?? p).replace(/\.md$/, "");

export function FileList({
  items,
  selected,
  changed,
  onOpen,
}: {
  items: string[];
  selected: string | null;
  changed: ChangedFile[];
  onOpen: (path: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const changedSet = useMemo(
    () => new Set(changed.map((f) => f.path)),
    [changed],
  );

  const groups = useMemo(() => {
    const q = filter.toLowerCase();
    const kept = q ? items.filter((p) => p.toLowerCase().includes(q)) : items;
    return groupItems(kept);
  }, [items, filter]);

  const sections = SECTION_ORDER.filter((s) => groups[s]).concat(
    Object.keys(groups).filter((s) => !SECTION_ORDER.includes(s)),
  );

  return (
    <aside id="list">
      <input
        className="f"
        placeholder="filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {sections.map((section) => {
        const subs = Object.keys(groups[section]).sort().reverse();
        const total = subs.reduce((n, s) => n + groups[section][s].length, 0);
        return (
          <details key={section} open>
            <summary>
              {section} <span className="count">{total}</span>
            </summary>
            {subs.map((sub, i) =>
              sub === "" ? (
                <div key="flat" className="entries">
                  {groups[section][sub].map((p) => (
                    <Entry
                      key={p}
                      path={p}
                      selected={selected === p}
                      edited={changedSet.has(p)}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              ) : (
                <details key={sub} className="year" open={i === 0 || !!filter}>
                  <summary>
                    {sub}{" "}
                    <span className="count">{groups[section][sub].length}</span>
                  </summary>
                  <div className="entries">
                    {groups[section][sub].map((p) => (
                      <Entry
                        key={p}
                        path={p}
                        selected={selected === p}
                        edited={changedSet.has(p)}
                        onOpen={onOpen}
                      />
                    ))}
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

function Entry({
  path,
  selected,
  edited,
  onOpen,
}: {
  path: string;
  selected: boolean;
  edited: boolean;
  onOpen: (path: string) => void;
}) {
  return (
    <a
      className={`${selected ? "sel" : ""}${edited ? " edited" : ""}`}
      onClick={() => onOpen(path)}
    >
      {edited && <span className="dot" aria-label="has draft edits" />}
      {label(path)}
    </a>
  );
}
