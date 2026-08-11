import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  type DraftStatus,
  type ItemDetail,
  type LintFinding,
  type SiteNav,
  SaveConflict,
  type EventCategory,
} from "./api";
import { Wizard } from "./wizard";
import { FileList } from "./filelist";
import { Picker, type PickerOption } from "./picker";
import { BranchBrowser } from "./branches";
import {
  buildFrontmatter,
  classify,
  FrontmatterForm,
  type FieldSpec,
  type FieldValue,
} from "./frontmatter";
import { Wysiwyg, type EditorHandle } from "./editors/wysiwyg";

// Monaco is ~1.5 MB gzip — load it only when the editor switches to Raw mode.
const Raw = lazy(() =>
  import("./editors/raw").then((m) => ({ default: m.Raw })),
);
// Likewise the preview: it pulls in the site's whole remark/rehype pipeline.
const Preview = lazy(() =>
  import("./editors/preview").then((m) => ({ default: m.Preview })),
);

type Mode = "wysiwyg" | "raw" | "preview";

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
  const [siteOrigin, setSiteOrigin] = useState("");
  const [unprotected, setUnprotected] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [base, setBase] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [nav, setNav] = useState<SiteNav | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [wizard, setWizard] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [status, setStatus] = useState<DraftStatus | null>(null);

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [specs, setSpecs] = useState<FieldSpec[]>([]);
  const [fmValues, setFmValues] = useState<Record<string, FieldValue>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<Mode>("wysiwyg");
  /** Blob sha the open file was loaded at — sent back to detect conflicts. */
  const [sha, setSha] = useState<string | undefined>();
  const [conflict, setConflict] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    ok: boolean;
    text: string;
    href?: string;
  } | null>(null);
  const [lint, setLint] = useState<LintFinding[]>([]);

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
      setSiteOrigin(me.siteOrigin ?? "");
      setUnprotected(me.unprotected ?? null);
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
      .then((d) => {
        setItems(d.items);
        setNav(d.nav ?? null);
        setCategories(d.categories ?? []);
      })
      .catch((e) => setMsg({ ok: false, text: String(e) }));
    refreshStatus(base);
  }, [base, refreshStatus]);

  /** Branch picker options: rootless branches first, then one group per folder. */
  const branchOptions = useMemo<PickerOption[]>(() => {
    const g = groupBranches(branches);
    return [
      ...g.root.map((b) => ({ value: b, label: b })),
      ...g.folders.flatMap(([folder, list]) =>
        list.map((b) => ({
          value: b,
          label: b.slice(folder.length + 1),
          group: folder,
        })),
      ),
    ];
  }, [branches]);

  /** Existing page slugs (`about`, `political-education/bookclub`, …). */
  const pageSlugs = useMemo(
    () =>
      items
        .filter((p) => p.startsWith("content/pages/"))
        .map((p) => p.slice("content/pages/".length).replace(/\.md$/, ""))
        .sort(),
    [items],
  );

  /**
   * Deep links. A reader on the live site can append `?edit` to any page and
   * land here with that page already open — `?url=/about/` is resolved against
   * the file list (the pages tree mirrors the site's URLs), and `?path=` opens
   * a repo path directly.
   */
  // `?branches` opens the branch browser straight away, so a link can point
  // someone at the list of previews rather than at a file.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("branches"))
      setBrowsing(true);
  }, []);

  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !items.length) return;
    const q = new URLSearchParams(window.location.search);
    const wantPath = q.get("path");
    const wantUrl = q.get("url");
    if (!wantPath && !wantUrl) return;
    jumped.current = true;
    const target =
      (wantPath && items.find((p) => p === wantPath)) ||
      (wantUrl &&
        items.find(
          (p) =>
            p.startsWith("content/pages/") &&
            "/" +
              p.replace(/^content\/pages\//, "").replace(/\.md$/, "") +
              "/" ===
              (wantUrl.endsWith("/") ? wantUrl : wantUrl + "/"),
        ));
    if (target) void open(target);
    else
      setMsg({
        ok: false,
        text: `No editable file matches ${wantPath ?? wantUrl}`,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function open(path: string) {
    setMsg(null);
    try {
      const d = await api.item(path, base);
      setItem(d);
      setSha(d.sha);
      setConflict(false);
      setLint([]);
      if (d.kind === "yaml") {
        // Config is data, not a document: no title, no frontmatter fields, and
        // never the rich-text editor — it would rewrite the YAML as Markdown.
        setBody(d.text);
        setMode("raw");
        setTitle("");
        setSpecs([]);
      } else {
        setBody(d.body);
        setMode("wysiwyg");
        setTitle(String(d.frontmatter.title ?? ""));
        setSpecs(classify(d.frontmatter));
      }
      setFmValues({});
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    // Pull the live text out of whichever editor owns it before swapping, so
    // preview shows unsaved work and nothing is lost switching back.
    if (edRef.current) setBody(edRef.current.getValue());
    setMode(next);
  }

  async function save() {
    if (!item) return;
    setBusy("save");
    setMsg(null);
    try {
      const latest = edRef.current?.getValue() ?? body;
      const r = await api.save(
        item.kind === "yaml"
          ? { base, path: item.path, sha, text: latest }
          : (() => {
              const fm = buildFrontmatter(
                item.frontmatter,
                specs,
                fmValues,
                true,
              );
              if (title !== String(item.frontmatter.title ?? ""))
                fm.title = title;
              return {
                base,
                path: item.path,
                sha,
                frontmatter: fm,
                body: latest,
              };
            })(),
      );
      setMsg({
        ok: true,
        text:
          `saved to ${r.branch}` +
          (r.autofixed
            ? ` (auto-fixed ${r.autofixed} style issue${r.autofixed === 1 ? "" : "s"})`
            : "") +
          ` — preview builds in ~1–2 min`,
        href: r.previewUrl,
      });
      setSha(r.sha);
      setConflict(false);
      setLint(r.lint ?? []);
      refreshStatus(base);
    } catch (e) {
      if (e instanceof SaveConflict) setConflict(true);
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  /**
   * Change the open item's address. The Worker leaves a 301 behind, so this is
   * safe on published content — but say so, since it's the one edit that
   * changes something outside the site.
   */
  async function rename() {
    if (!item || item.kind !== "markdown") return;
    const currentUrl = String(item.frontmatter.path ?? "");
    const currentSlug =
      String(item.frontmatter.slug ?? "") ||
      (item.path.split("/").pop() ?? "").replace(/\.md$/, "");
    const next = window.prompt(
      `New address for this ${currentUrl ? `page (now ${currentUrl})` : "item"}.

` + `The old address keeps working — a permanent redirect is recorded.`,
      currentSlug,
    );
    if (!next || next.trim() === currentSlug) return;
    setBusy("rename");
    setMsg(null);
    try {
      const r = await api.rename({ base, from: item.path, slug: next.trim() });
      const d = await api.list(base);
      setItems(d.items);
      refreshStatus(base);
      await open(r.path);
      setMsg({
        ok: true,
        text: r.redirected
          ? `moved to ${r.url} — ${r.fromUrl} now redirects there`
          : `moved to ${r.url} (it was never published, so no redirect was needed)`,
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  /** Discard local edits and re-open the file at whatever is there now. */
  async function reloadOpen() {
    if (item) await open(item.path);
  }

  /**
   * Conflict escape hatch: fork the base into a new branch and save there, so
   * BOTH versions survive and the difference can be settled in a PR. Switching
   * base re-points the draft workspace, so the retry lands on the new branch.
   */
  async function saveToNewBranch() {
    const name = window.prompt(
      "Name a branch to keep your version on (from '" + base + "'):",
      `rework/${(item?.path.split("/").pop() ?? "edit").replace(/\.[^.]+$/, "")}`,
    );
    if (!name) return;
    setBusy("branch");
    try {
      const r = await api.createBranch(name.trim(), base);
      const b = await api.branches();
      setBranches(b.branches.filter((x) => !x.startsWith("draft/")));
      setBase(r.branch);
      setConflict(false);
      setMsg({
        ok: true,
        text: `created ${r.branch} — reopen the file here and save your version`,
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
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

  /**
   * Switch the branch being edited. Called by the picker and by the browser;
   * a branch the browser just created won't be in `branches` yet, so add it
   * rather than waiting for a refetch.
   */
  function pickBranch(name: string) {
    setBranches((bs) =>
      bs.includes(name) || name.startsWith("draft/") ? bs : [...bs, name],
    );
    setBase(name);
  }

  const changed = status?.exists ? status.changed : [];

  return (
    <>
      <header>
        <b className="brand">🌹 SVDSA Editor</b>
        <Picker
          className="pick--bar"
          label="Branch"
          value={base}
          options={branchOptions}
          onChange={pickBranch}
          placeholder="Filter branches…"
          footer={(close) => (
            <button
              type="button"
              className="pick__action"
              onClick={() => {
                close();
                setBrowsing(true);
              }}
            >
              Browse all branches &amp; previews…
            </button>
          )}
        />
        <button
          className="primary"
          onClick={() => setWizard(true)}
          disabled={busy !== null || !base}
        >
          + New
        </button>
        <span className="who">{email}</span>
      </header>

      {browsing && (
        <BranchBrowser
          base={base}
          onPick={pickBranch}
          onClose={() => setBrowsing(false)}
        />
      )}

      {unprotected && (
        <div className="alarm" role="alert">
          <b>⚠ This editor is not protected.</b> Anyone who knows the URL can
          edit the site and commit as you — {unprotected}. Put a Cloudflare
          Access application in front of it, set{" "}
          <code>CF_ACCESS_TEAM_DOMAIN</code> and <code>CF_ACCESS_AUD</code>, and
          remove <code>REQUIRE_ACCESS: "false"</code>.
        </div>
      )}

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
          base={base}
          items={items}
          nav={nav}
          selected={item?.path ?? null}
          changed={changed}
          onOpen={open}
        />

        <main id="ed">
          {wizard ? (
            <Wizard
              base={base}
              production="red"
              categories={categories}
              pages={pageSlugs}
              onCancel={() => setWizard(false)}
              onCreated={async (path) => {
                setWizard(false);
                // Refresh the list so the new file is there, then open it.
                const d = await api.list(base);
                setItems(d.items);
                refreshStatus(base);
                await open(path);
              }}
            />
          ) : !item ? (
            <p className="empty">Select a file to edit.</p>
          ) : (
            <>
              <div className="path">
                {item.path}
                {item.fromDraft && <span className="chip">draft version</span>}
                {siteOrigin &&
                  item.kind === "markdown" &&
                  typeof item.frontmatter.path === "string" && (
                    <a
                      className="live"
                      href={`${siteOrigin}${item.frontmatter.path}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      view live ↗
                    </a>
                  )}
                {item.kind === "markdown" && (
                  <button
                    className="ghost tiny"
                    onClick={rename}
                    disabled={busy !== null}
                  >
                    {busy === "rename" ? "moving…" : "change address"}
                  </button>
                )}
              </div>

              {item.kind === "markdown" ? (
                <>
                  <input
                    className="title"
                    placeholder="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <FrontmatterForm
                    specs={specs}
                    values={fmValues}
                    anchorStart={String(item.frontmatter.start ?? "")}
                    onChange={(k, v) =>
                      setFmValues((cur) => ({ ...cur, [k]: v }))
                    }
                  />
                </>
              ) : (
                <p className="confignote">
                  <b>Site settings.</b> This is a settings file, not a page, so
                  it is edited as YAML — indentation matters. The comments at
                  the top say what it controls. A file that doesn&rsquo;t parse
                  is refused on save, so you can&rsquo;t break the site by typo.
                </p>
              )}

              {conflict && (
                <div className="conflict" role="alert">
                  <span>
                    <b>Someone else&rsquo;s version is newer.</b> Your changes
                    are still here, unsaved.
                  </span>
                  <button onClick={reloadOpen} disabled={busy !== null}>
                    Discard mine &amp; reload
                  </button>
                  <button onClick={saveToNewBranch} disabled={busy !== null}>
                    Save mine to a new branch
                  </button>
                </div>
              )}

              <div className="modebar">
                <div className="tabs">
                  {item.kind === "markdown" ? (
                    <>
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
                        Source
                      </button>
                      <button
                        className={mode === "preview" ? "on" : ""}
                        onClick={() => switchMode("preview")}
                      >
                        Preview
                      </button>
                    </>
                  ) : (
                    <button className="on" disabled>
                      YAML
                    </button>
                  )}
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
                {mode === "preview" && item.kind === "markdown" ? (
                  <Suspense
                    fallback={<p className="empty">rendering preview…</p>}
                  >
                    <Preview
                      body={body}
                      siteOrigin={siteOrigin}
                      title={title}
                    />
                  </Suspense>
                ) : mode === "wysiwyg" && item.kind === "markdown" ? (
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
                      language={item.kind === "yaml" ? "yaml" : "markdown"}
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
          {lint.length > 0 && (
            <ul className="lint">
              {lint.map((f, i) => (
                <li key={i} className={f.level}>
                  {f.level === "error" ? "✗" : "⚠"} line {f.line}: {f.message}
                  {f.suggest !== undefined && (
                    <>
                      {" "}
                      — <s>{f.match}</s> → <b>{f.suggest}</b>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </>
  );
}
