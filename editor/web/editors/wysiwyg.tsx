/**
 * WYSIWYG body editor — Milkdown Crepe (ProseMirror + remark).
 *
 * Emits clean Markdown, so git diffs stay readable. Initialized once from the
 * `initial` markdown; the current value is pulled imperatively via the ref
 * (see app.tsx — the App owns `body`, editors hand it back on save/toggle).
 */
// Crepe theme CSS is imported in styles.css (media-scoped for dark mode).
import { Crepe } from "@milkdown/crepe";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface EditorHandle {
  getValue(): string;
}

export const Wysiwyg = forwardRef<EditorHandle, { initial: string }>(
  function Wysiwyg({ initial }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const crepe = useRef<Crepe | null>(null);

    useImperativeHandle(ref, () => ({
      getValue: () => crepe.current?.getMarkdown() ?? initial,
    }));

    useEffect(() => {
      const parent = host.current;
      if (!parent) return;
      // Crepe.create() and .destroy() are both async, so a mount/unmount pair
      // can interleave (React StrictMode does exactly this in dev). Two guards
      // keep that safe: each instance owns its OWN container element, so one
      // instance's teardown can never remove another's DOM; and destroy waits
      // for create to finish, so we never tear down a half-built editor.
      const root = parent.appendChild(document.createElement("div"));
      const c = new Crepe({ root, defaultValue: initial });
      crepe.current = c;
      const ready = c.create();
      return () => {
        if (crepe.current === c) crepe.current = null;
        void ready.then(() => c.destroy()).finally(() => root.remove());
      };
      // Recreate only if the source doc identity changes (new file opened).
    }, [initial]);

    return <div className="wysiwyg" ref={host} />;
  },
);
