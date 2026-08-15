/**
 * The branch browser — every branch, and the link to its own copy of the site.
 *
 * Per-branch previews are the repo's best feature and were, until this, almost
 * invisible: the draft bar linked yours and nothing linked anyone else's. This
 * lists them all with enough context to tell them apart — what moved last, how
 * far each has drifted from production, and whether a PR is already open.
 *
 * A modal rather than a page: the editor SPA has no router, and this is
 * something you consult *while* editing, so the work underneath stays mounted.
 * Native `<dialog>` + `showModal()` gives the focus trap, the Escape key and
 * top-layer stacking for free, and gets them right.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type BranchInfo } from "./api";

/** "3 days ago" — branch ages are read at a glance, exact stamps are not. */
function ago(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(secs)) return "";
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];
  let n = secs;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  for (const [size, next] of steps) {
    if (Math.abs(n) < size) break;
    n /= size;
    unit = next;
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    -Math.round(n),
    unit,
  );
}

export function BranchBrowser({
  base,
  onPick,
  onClose,
}: {
  /** The branch currently being edited. */
  base: string;
  /** Switch the editor to this branch (the browser does not own `base`). */
  onPick: (branch: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<BranchInfo[] | null>(null);
  const [production, setProduction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.branchInfo();
      setProduction(d.production);
      setRows(d.branches);
    } catch (e) {
      setError(String(e));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    ref.current?.showModal();
    void load();
  }, [load]);

  /**
   * Production first, then real branches newest-first, then everyone's drafts.
   * Drafts are working state, not destinations — they shouldn't crowd out the
   * theme branches just because a draft was saved a minute ago.
   */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (b: BranchInfo) => (b.isProduction ? 0 : b.draft ? 2 : 1);
    return (rows ?? [])
      .filter(
        (b) =>
          !q ||
          b.name.toLowerCase().includes(q) ||
          (b.commit?.subject ?? "").toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (b.commit?.committedDate ?? "").localeCompare(
            a.commit?.committedDate ?? "",
          ),
      );
  }, [rows, query]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createBranch(name, base);
      setNewName("");
      await load();
      onPick(r.branch);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog className="br" ref={ref} onClose={onClose} aria-labelledby="br-h">
      <header className="br__head">
        <h2 id="br-h">Branches</h2>
        <p className="br__blurb">
          Every branch is published as its own complete copy of the site. A
          preview catches up a minute or two after each save.
        </p>
        <button className="br__x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <input
        className="br__filter"
        type="search"
        placeholder="Filter branches…"
        aria-label="Filter branches"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && (
        <p className="br__error" role="alert">
          {error}
        </p>
      )}

      <div className="br__list">
        {rows === null && <p className="br__none">Loading branches…</p>}
        {rows !== null && !shown.length && (
          <p className="br__none">No branches match.</p>
        )}

        {shown.map((b) => (
          <article
            key={b.name}
            className={`br__row${b.name === base ? " is-current" : ""}`}
            // Every row's prose mentions other branch names ("4 behind red"),
            // so tests need an exact handle rather than a text match.
            data-branch={b.name}
            aria-current={b.name === base ? "true" : undefined}
          >
            <div className="br__title">
              <code className="br__name">{b.name}</code>
              {b.isProduction && (
                <span className="br__tag br__tag--live">live site</span>
              )}
              {b.draft?.mine && <span className="br__tag">your draft</span>}
              {b.draft && !b.draft.mine && (
                <span className="br__tag">{b.draft.who}’s draft</span>
              )}
              {b.name === base && <span className="br__tag">editing</span>}
            </div>

            {b.commit && (
              <p className="br__commit">
                {b.commit.subject}
                <span className="br__meta">
                  {" "}
                  — {b.commit.author || "unknown"},{" "}
                  {ago(b.commit.committedDate)}
                </span>
              </p>
            )}

            <p className="br__meta">
              {b.draft && <>branched from {b.draft.base} · </>}
              {b.isProduction ? (
                <>the branch everything else is measured against</>
              ) : b.ahead || b.behind ? (
                <>
                  {b.ahead} ahead, {b.behind} behind {production}
                </>
              ) : (
                <>identical to {production}</>
              )}
            </p>

            <div className="br__actions">
              <a
                className="br__link"
                href={b.previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                {/* Production isn't a preview of anything — it's the site. */}
                {b.isProduction ? "Open live site ↗" : "Open preview ↗"}
              </a>
              {b.pull && (
                <a
                  className="br__link"
                  href={b.pull.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  PR #{b.pull.number}
                  {b.pull.state === "OPEN"
                    ? b.pull.isDraft
                      ? " (draft)"
                      : " (open)"
                    : ` (${b.pull.state.toLowerCase()})`}{" "}
                  ↗
                </a>
              )}
              <button
                className="br__use"
                disabled={b.name === base}
                onClick={() => {
                  onPick(b.name);
                  onClose();
                }}
              >
                {b.name === base ? "Editing this" : "Edit this branch"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <form className="br__new" onSubmit={create}>
        <label htmlFor="br-new">
          New branch off <code>{base}</code>
        </label>
        <input
          id="br-new"
          value={newName}
          placeholder="theme/my-experiment"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={busy || !newName.trim()}>
          {busy ? "creating…" : "Create"}
        </button>
      </form>
    </dialog>
  );
}
