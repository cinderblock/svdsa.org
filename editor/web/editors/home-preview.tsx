/**
 * The home page, edited by typing on it.
 *
 * The home page is not a document — it is a fixed layout with fourteen short
 * string slots, kept in `content/pages/home.md`'s frontmatter. Shown through the
 * generic editor that is fourteen unlabelled text boxes beside an empty body, so
 * this pane replaces all three normal modes for that one file.
 *
 * Fidelity comes from rendering the site's OWN route, not a lookalike:
 *
 *   Home        app/routes/home.tsx — the actual component that ships
 *   Slot        app/components/HomeSlot.tsx — the route reads its words through
 *               a context, which is the seam this pane hooks into
 *   resolveHomeCopy
 *               app/lib/home.ts — the same blank-falls-back-to-default rule the
 *               build applies, so a cleared field looks here like it will there
 *
 * Imported by relative path, so there is one home page and it cannot drift.
 *
 * ---------------------------------------------------------------------------
 * Why an iframe, and why this one is same-origin
 *
 * An iframe for the reasons `preview.tsx` gives — the site's stylesheet would
 * otherwise fight the editor's, and `<base href>` makes assets resolve as they
 * do in production. One reason more that matters here: media queries inside an
 * iframe answer to the FRAME's width. This page is a hero grid and two card
 * grids, so a shadow root (which would answer to the editor window) would show a
 * responsive layout that is simply a lie.
 *
 * But unlike `preview.tsx` this frame is same-origin and runs scripts. That
 * pane renders `rehype-raw` output — migrated WordPress markdown carrying real
 * embeds, forms and scripts — and `sandbox=""` is exactly right for it. This
 * pane renders our own React components against plain strings; there is no raw
 * HTML anywhere on the home page (post excerpts are text nodes, `Prose` is never
 * used). So the frame executes only editor code, at the editor's own trust
 * level. `preview.tsx` keeps its sandbox; these are two panes with two threat
 * models, deliberately not merged.
 *
 * See plans/svdsa-home-inplace-editing.md.
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
// The site's own stylesheet, as text — `?inline` keeps Vite from injecting it
// into the EDITOR's document, where it would collide with the editor's styles.
import siteCss from "../../../app/styles/global.css?inline";
import { HomeCopyProvider } from "../../../app/components/HomeSlot";
import {
  HOME_SLOTS,
  resolveHomeCopy,
  type HomeCopy,
} from "../../../app/lib/home";
import Home from "../../../app/routes/home";

const SLOTS = new Map(HOME_SLOTS.map((s) => [s.key, s]));

/**
 * Editor chrome, injected into the frame alongside the site's CSS.
 *
 * A permanent hairline is the point: the first question anyone has is "which of
 * these words can I change?", and the page should answer it without being
 * hovered. Everything else on the page is deliberately left looking untouched.
 */
const SLOT_CSS = `
  body { margin: 0; }
  .ed-slot {
    outline: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
    outline-offset: 3px;
    border-radius: 2px;
    cursor: text;
  }
  .ed-slot:hover {
    outline-color: color-mix(in srgb, currentColor 70%, transparent);
    background: color-mix(in srgb, currentColor 7%, transparent);
  }
  .ed-slot:focus {
    outline: 2px solid currentColor;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
`;

/**
 * Firefox only shipped `contenteditable="plaintext-only"` in 136. An unsupported
 * value leaves the element not editable AT ALL, which is a much worse failure
 * than losing the guarantee, so detect rather than assume.
 */
const PLAINTEXT_OK = (() => {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "plaintext-only");
  return el.contentEditable === "plaintext-only";
})();

function EditableSlot({
  k,
  value,
  onEdit,
}: {
  k: keyof HomeCopy;
  value: string;
  onEdit: (key: string, value: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const focused = useRef(false);
  const slot = SLOTS.get(k);

  /**
   * The element has NO React children, on purpose. Text is written imperatively
   * so React never re-renders a node the caret is sitting in — and never while
   * it has focus, because your own keystrokes are already in the DOM.
   */
  const sync = () => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  };
  useEffect(() => {
    if (!focused.current) sync();
  });

  return (
    <span
      ref={ref}
      className="ed-slot"
      contentEditable={PLAINTEXT_OK ? "plaintext-only" : true}
      suppressContentEditableWarning
      role="textbox"
      aria-label={slot ? `${slot.section}: ${slot.label}` : k}
      spellCheck
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        // Clearing a slot falls back to the shipped default (app/lib/home.ts).
        // Putting that default back the moment you leave the field is how an
        // editor learns "blank means the default" instead of "blank means I
        // broke it" — and it matches what the page will actually render.
        sync();
      }}
      onInput={(e) => onEdit(k, e.currentTarget.textContent ?? "")}
      onKeyDown={(e) => {
        // Every slot is a YAML scalar. A newline in one is never what was meant,
        // including in the paragraphs — `lead` is a folded scalar on one logical
        // line. Enter does nothing rather than silently producing broken YAML.
        if (e.key === "Enter") e.preventDefault();
      }}
      onPaste={(e) => {
        // Needed even with plaintext-only, which still carries newlines through.
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s+/g, " ");
        e.currentTarget.ownerDocument.execCommand("insertText", false, text);
      }}
    />
  );
}

/**
 * Memoised because `Home` takes no props, and every keystroke pushes a new copy
 * object into the frame. Without this, each character re-runs the route's body —
 * including `expandEvents(…, 120)`, which walks 21 recurrence rules over four
 * months to find the four cards it shows.
 *
 * The slots still update: `Slot` is the context consumer, and a context change
 * reaches consumers regardless of a memo boundary above them.
 */
const MemoHome = memo(Home);

/** The site's own route, with every slot swapped for an editable one. */
function EditableHome({
  copy,
  onEdit,
}: {
  copy: HomeCopy;
  onEdit: (key: string, value: string) => void;
}) {
  return (
    <HomeCopyProvider
      copy={copy}
      render={(k, value) => (
        <EditableSlot k={k} value={value} onEdit={onEdit} />
      )}
    >
      <MemoHome />
    </HomeCopyProvider>
  );
}

export function HomePreview({
  frontmatter,
  siteOrigin,
  onChange,
}: {
  /** The item's frontmatter with any unsaved edits already laid over it. */
  frontmatter: Record<string, unknown>;
  /** Live site origin, so assets and fonts resolve as they do in production. */
  siteOrigin: string;
  onChange: (key: string, value: string) => void;
}) {
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  const rootRef = useRef<Root | null>(null);
  // Kept in a ref so a new handler identity from the parent doesn't force the
  // whole page to re-render inside the frame.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const copy = useMemo(() => resolveHomeCopy(frontmatter), [frontmatter]);

  const shell = useMemo(
    () =>
      [
        "<!doctype html><html><head><meta charset='utf-8'>",
        // Assets, fonts and relative links resolve against the real site.
        siteOrigin ? `<base href="${siteOrigin}/">` : "",
        `<style>${siteCss}</style>`,
        `<style>${SLOT_CSS}</style>`,
        "</head><body></body></html>",
      ].join(""),
    [siteOrigin],
  );

  // A React root INSIDE the frame, rather than a portal from the editor's root.
  // React attaches its listeners to the root container, and a portal's listeners
  // would sit in the editor's document — where events raised inside the frame
  // never arrive. Nothing would be typeable.
  useEffect(() => {
    if (!frameDoc) return;
    const root = createRoot(frameDoc.body);
    rootRef.current = root;
    return () => {
      rootRef.current = null;
      // Unmounting synchronously from inside a commit is what React warns about.
      queueMicrotask(() => root.unmount());
    };
  }, [frameDoc]);

  useEffect(() => {
    rootRef.current?.render(
      <EditableHome copy={copy} onEdit={(k, v) => onChangeRef.current(k, v)} />,
    );
  }, [copy, frameDoc]);

  return (
    <iframe
      className="preview"
      title="The home page, with its editable words"
      srcDoc={shell}
      onLoad={(e) => setFrameDoc(e.currentTarget.contentDocument)}
    />
  );
}
