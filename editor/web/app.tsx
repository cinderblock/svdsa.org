import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, type ItemDetail } from "./api";
import { Wysiwyg, type EditorHandle } from "./editors/wysiwyg";

// Monaco is ~1.5 MB gzip — load it only when the editor switches to Raw mode.
const Raw = lazy(() =>
  import("./editors/raw").then((m) => ({ default: m.Raw })),
);

type Mode = "wysiwyg" | "raw";

/** Group branches by first path segment (theme/, draft/, …); rootless ones first. */
function groupBranches(branches: string[]): {
  root: string[];
  folders: [string, string[]][];
} {
  const root: string[] = [];
  const folders = new Map<string, string[]>();
  for (const b of [...branches].sort()) {
    const i = b.indexOf("/");
    if (i === -1) root.push(b);
    else {
      const folder = b.slice(0, i);
      const list = folders.get(folder) ?? [];
      list.push(b);
      folders.set(folder, list);
    }
  }
  return { root, folders: [...folders.entries()] };
}

/** Primitive frontmatter values are editable as form fields; the rest pass through. */
function primitiveEntries(
  fm: Record<string, unknown>,
): [string, string | number | boolean][] {
  return Object.entries(fm).filter(
    ([, v]) =>
      typeof v === "string" || typeof v === "number" || typeof v === "boolean",
  ) as [string, string | number | boolean][];
}

export function App() {
  const [email, setEmail] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [base, setBase] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [filter, setFilter] = useState("");

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [fm, setFm] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<Mode>("wysiwyg");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; html: string } | null>(null);

  const edRef = useRef<EditorHandle>(null);

  // Bootstrap: identity + branches, then the file list for the default base.
  useEffect(() => {
    (async () => {
      const [me, b] = await Promise.all([api.me(), api.branches()]);
      setEmail(me.email);
      setBranches(b.branches);
      setBase((cur) => cur || b.branches[0] || "");
    })().catch((e) => setMsg({ ok: false, html: String(e) }));
  }, []);

  useEffect(() => {
    if (!base) return;
    setItems([]);
    api
      .list(base)
      .then((d) => setItems(d.items))
      .catch((e) => setMsg({ ok: false, html: String(e) }));
  }, [base]);

  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    return items.filter((p) => p.toLowerCase().includes(q));
  }, [items, filter]);

  const grouped = useMemo(() => groupBranches(branches), [branches]);

  async function open(path: string) {
    setMsg(null);
    const d = await api.item(path, base);
    setItem(d);
    setBody(d.body);
    setMode("wysiwyg");
    const strings: Record<string, string> = {};
    for (const [k, v] of primitiveEntries(d.frontmatter))
      strings[k] = String(v);
    setFm(strings);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (edRef.current) setBody(edRef.current.getValue()); // preserve edits
    setMode(next);
  }

  async function save() {
    if (!item) return;
    setSaving(true);
    setMsg(null);
    try {
      const latestBody = edRef.current?.getValue() ?? body;
      // Rebuild frontmatter: keep originals, override edited primitives (coerced).
      const merged: Record<string, unknown> = { ...item.frontmatter };
      for (const [k, orig] of primitiveEntries(item.frontmatter)) {
        const edited = fm[k];
        if (edited === undefined) continue;
        merged[k] =
          typeof orig === "number"
            ? Number(edited)
            : typeof orig === "boolean"
              ? edited === "true"
              : edited;
      }
      const r = await api.save({
        base,
        path: item.path,
        frontmatter: merged,
        body: latestBody,
      });
      setMsg({
        ok: true,
        html: `saved to <code>${r.branch}</code> — preview builds in ~1–2 min: <a target="_blank" rel="noreferrer" href="${r.previewUrl}">${r.previewUrl}</a>`,
      });
    } catch (e) {
      setMsg({ ok: false, html: String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header>
        <b>🌹 SVDSA Editor</b>
        <label>
          base{" "}
          <select value={base} onChange={(e) => setBase(e.target.value)}>
            {grouped.root.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            {grouped.folders.map(([folder, list]) => (
              <optgroup key={folder} label={`${folder}/`}>
                {list.map((b) => (
                  <option key={b} value={b}>
                    {b.slice(folder.length + 1)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <span className="who">{email}</span>
      </header>

      <div className="wrap">
        <aside id="list">
          <input
            className="f"
            placeholder="filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {shown.map((p) => (
            <a
              key={p}
              className={item?.path === p ? "sel" : ""}
              onClick={() => open(p)}
            >
              {p.replace(/^content\//, "")}
            </a>
          ))}
        </aside>

        <main id="ed">
          {!item ? (
            <p className="empty">Select a file to edit.</p>
          ) : (
            <>
              <div className="path">{item.path}</div>
              <div className="fm">
                {Object.keys(fm).map((k) => (
                  <label key={k} className="fmField">
                    <span>{k}</span>
                    <input
                      value={fm[k]}
                      onChange={(e) =>
                        setFm((cur) => ({ ...cur, [k]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="modebar">
                <div className="tabs">
                  <button
                    className={mode === "wysiwyg" ? "on" : ""}
                    onClick={() => switchMode("wysiwyg")}
                  >
                    WYSIWYG
                  </button>
                  <button
                    className={mode === "raw" ? "on" : ""}
                    onClick={() => switchMode("raw")}
                  >
                    Raw
                  </button>
                </div>
                <button className="save" disabled={saving} onClick={save}>
                  {saving ? "saving…" : "Save draft"}
                </button>
              </div>

              <div className="pane">
                {mode === "wysiwyg" ? (
                  <Wysiwyg
                    key={`${item.path}:wysiwyg`}
                    ref={edRef}
                    initial={body}
                  />
                ) : (
                  <Suspense fallback={<p className="empty">loading editor…</p>}>
                    <Raw key={`${item.path}:raw`} ref={edRef} initial={body} />
                  </Suspense>
                )}
              </div>

              {msg && (
                <div
                  className={msg.ok ? "msg ok" : "msg err"}
                  dangerouslySetInnerHTML={{
                    __html: (msg.ok ? "✓ " : "✗ ") + msg.html,
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
