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
      if (!host.current) return;
      const c = new Crepe({ root: host.current, defaultValue: initial });
      crepe.current = c;
      c.create();
      return () => {
        c.destroy();
        crepe.current = null;
      };
      // Recreate only if the source doc identity changes (new file opened).
    }, [initial]);

    return <div className="wysiwyg" ref={host} />;
  },
);
