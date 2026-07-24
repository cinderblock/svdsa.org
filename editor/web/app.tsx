import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, type DraftStatus, type ItemDetail } from "./api";
import { FileList } from "./filelist";
import {
  buildFrontmatter,
  classify,
  FrontmatterForm,
  type FieldSpec,
} from "./frontmatter";
import { Wysiwyg, type EditorHandle } from "./editors/wysiwyg";

// Monaco is ~1.5 MB gzip — load it only when the editor switches to Raw mode.
const Raw = lazy(() =>
  import("./editors/raw").then((m) => ({ default: m.Raw })),
);

type Mode = "wysiwyg" | "raw";

/** Group branches by first path segment (theme/, draft/, …); rootless first. */
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
      (folders.get(folder) ?? folders.set(folder, []).get(folder)!).push(b);
    }
  }
  return { root, folders: [...folders.entries()] };
}

export function App() {
  const [email, setEmail] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [base, setBase] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [status, setStatus] = useState<DraftStatus | null>(null);

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [specs, setSpecs] = useState<FieldSpec[]>([]);
  const [fmValues, setFmValues] = useState<Record<string, string | boolean>>(
    {},
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<Mode>("wysiwyg");

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    ok: boolean;
    text: string;
    href?: string;
  } | null>(null);

  const edRef = useRef<EditorHandle>(null);

  const refreshStatus = useCallback((b: string) => {
    api
      .status(b)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    (async () => {
      const [me, b] = await Promise.all([api.me(), api.branches()]);
      setEmail(me.email);
      setBranches(b.branches.filter((x) => !x.startsWith("draft/")));
      setBase(
        (cur) =>
          cur || (b.branches.includes("red") ? "red" : (b.branches[0] ?? "")),
      );
    })().catch((e) => setMsg({ ok: false, text: String(e) }));
  }, []);

  useEffect(() => {
    if (!base) return;
    setItems([]);
    setItem(null);
    api
      .list(base)
      .then((d) => setItems(d.items))
      .catch((e) => setMsg({ ok: false, text: String(e) }));
    refreshStatus(base);
  }, [base, refreshStatus]);

  const grouped = useMemo(() => groupBranches(branches), [branches]);

  async function open(path: string) {
    setMsg(null);
    try {
      const d = await api.item(path, base);
      setItem(d);
      setBody(d.body);
      setMode("wysiwyg");
      setTitle(String(d.frontmatter.title ?? ""));
      setSpecs(classify(d.frontmatter));
      setFmValues({});
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (edRef.current) setBody(edRef.current.getValue());
    setMode(next);
  }

  async function save() {
    if (!item) return;
    setBusy("save");
    setMsg(null);
    try {
      const latestBody = edRef.current?.getValue() ?? body;
      const fm = buildFrontmatter(item.frontmatter, specs, fmValues, true);
      if (title !== String(item.frontmatter.title ?? "")) fm.title = title;
      const r = await api.save({
        base,
        path: item.path,
        frontmatter: fm,
        body: latestBody,
      });
      setMsg({
        ok: true,
        text: `saved to ${r.branch} — preview builds in ~1–2 min`,
        href: r.previewUrl,
      });
      refreshStatus(base);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setMsg(null);
    try {
      const r = await api.publish(base);
      setMsg({
        ok: true,
        text: r.alreadyOpen
          ? `PR #${r.pr.number} already open — review & merge on GitHub`
          : `opened PR #${r.pr.number} — review & merge on GitHub`,
        href: r.pr.url,
      });
      refreshStatus(base);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (
      !window.confirm(
        `Throw away ALL draft edits for '${base}'? (${status?.changed.length ?? 0} changed file(s) — this cannot be undone)`,
      )
    )
      return;
    setBusy("discard");
    setMsg(null);
    try {
      await api.discard(base);
      setMsg({ ok: true, text: "draft discarded" });
      setItem(null);
      refreshStatus(base);
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function newBranch() {
    const name = window.prompt(
      `New branch name (created from '${base}') — e.g. theme/my-experiment:`,
    );
    if (!name) return;
    setBusy("branch");
    try {
      const r = await api.createBranch(name.trim(), base);
      const b = await api.branches();
      setBranches(b.branches.filter((x) => !x.startsWith("draft/")));
      setBase(r.branch);
      setMsg({ ok: true, text: `created branch ${r.branch}` });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  const changed = status?.exists ? status.changed : [];

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
        <button className="ghost" onClick={newBranch} disabled={busy !== null}>
          + branch
        </button>
        <span className="who">{email}</span>
      </header>

      {changed.length > 0 && (
        <div className="draftbar">
          <span>
            <b>{changed.length}</b> drafted change
            {changed.length === 1 ? "" : "s"} on <code>{status!.draft}</code>
          </span>
          {status!.previewUrl && (
            <a href={status!.previewUrl} target="_blank" rel="noreferrer">
              preview
            </a>
          )}
          {status!.pr ? (
            <a href={status!.pr.url} target="_blank" rel="noreferrer">
              PR #{status!.pr.number}
            </a>
          ) : (
            <button onClick={publish} disabled={busy !== null}>
              {busy === "publish" ? "publishing…" : "Publish (open PR)"}
            </button>
          )}
          <button className="danger" onClick={discard} disabled={busy !== null}>
            Discard draft
          </button>
        </div>
      )}

      <div className="wrap">
        <FileList
          items={items}
          selected={item?.path ?? null}
          changed={changed}
          onOpen={open}
        />

        <main id="ed">
          {!item ? (
            <p className="empty">Select a file to edit.</p>
          ) : (
            <>
              <div className="path">
                {item.path}
                {item.fromDraft && <span className="chip">draft version</span>}
              </div>
              <input
                className="title"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <FrontmatterForm
                specs={specs}
                values={fmValues}
                onChange={(k, v) => setFmValues((cur) => ({ ...cur, [k]: v }))}
              />

              <div className="modebar">
                <div className="tabs">
                  <button
                    className={mode === "wysiwyg" ? "on" : ""}
                    onClick={() => switchMode("wysiwyg")}
                  >
                    Rich text
                  </button>
                  <button
                    className={mode === "raw" ? "on" : ""}
                    onClick={() => switchMode("raw")}
                  >
                    Markdown
                  </button>
                </div>
                <button
                  className="save"
                  disabled={busy !== null}
                  onClick={save}
                >
                  {busy === "save" ? "saving…" : "Save draft"}
                </button>
              </div>

              <div className="pane">
                {mode === "wysiwyg" ? (
                  <Wysiwyg
                    key={`${item.path}:${item.sha}:wysiwyg`}
                    ref={edRef}
                    initial={body}
                  />
                ) : (
                  <Suspense fallback={<p className="empty">loading editor…</p>}>
                    <Raw
                      key={`${item.path}:${item.sha}:raw`}
                      ref={edRef}
                      initial={body}
                    />
                  </Suspense>
                )}
              </div>
            </>
          )}
          {msg && (
            <p className={msg.ok ? "msg ok" : "msg err"}>
              {msg.ok ? "✓ " : "✗ "}
              {msg.text}
              {msg.href && (
                <>
                  {" — "}
                  <a href={msg.href} target="_blank" rel="noreferrer">
                    {msg.href}
                  </a>
                </>
              )}
            </p>
          )}
        </main>
      </div>
    </>
  );
}
