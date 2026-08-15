/**
 * The home page's editable words.
 *
 * `<Slot k="ctaDonate" />` is a read of the home copy that the browser editor
 * can intercept, and `<HomeBody />` is the same for the plate's welcome prose.
 * On the site nobody provides the context, so both render exactly what they
 * always did — no wrapper element, identical markup.
 *
 * In the editor, `HomeCopyProvider` supplies live (unsaved) values plus a
 * `render` function that wraps each string in a contenteditable region, and the
 * HTML it has re-rendered from the unsaved markdown body. That is what lets the
 * editor render `app/routes/home.tsx` ITSELF rather than a lookalike: the route
 * has no idea it is being edited, and the two can't drift.
 *
 * See plans/svdsa-home-inplace-editing.md.
 */

import { createContext, useContext, type ReactNode } from "react";
import { HOME, HOME_HTML, type HomeCopy } from "~/lib/home";
import { Prose } from "~/components/Prose";

/** Given a slot's key and its resolved value, render it however you like. */
export type SlotRenderer = (key: keyof HomeCopy, value: string) => ReactNode;

interface HomeCopyValue {
  copy: HomeCopy;
  /** The plate's welcome, as rendered HTML. */
  html: string;
  render?: SlotRenderer;
}

/** The site's case: build-time copy, rendered as plain text. */
const HomeCopyContext = createContext<HomeCopyValue>({
  copy: HOME,
  html: HOME_HTML,
});

export function HomeCopyProvider({
  copy,
  html,
  render,
  children,
}: HomeCopyValue & { children: ReactNode }) {
  // Deliberately not memoised. This provider exists only in the editor, where
  // every re-render IS a copy change, so a stable identity would buy nothing.
  return (
    <HomeCopyContext.Provider value={{ copy, html, render }}>
      {children}
    </HomeCopyContext.Provider>
  );
}

export function Slot({ k }: { k: keyof HomeCopy }) {
  const { copy, render } = useContext(HomeCopyContext);
  return <>{render ? render(k, copy[k]) : copy[k]}</>;
}

/**
 * The plate's welcome copy.
 *
 * Not editable in place: it is a document, and the editor already has a rich
 * text mode that handles bold, italics and links properly. Typing on it here
 * would mean a second, worse implementation of that.
 */
export function HomeBody() {
  const { html } = useContext(HomeCopyContext);
  return <Prose html={html} />;
}
