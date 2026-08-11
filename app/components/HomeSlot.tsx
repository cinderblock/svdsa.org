/**
 * The home page's editable slots.
 *
 * `<Slot k="headline" />` is a read of the home copy that the browser editor can
 * intercept. On the site nobody provides the context, so a slot renders exactly
 * the string it always did — no wrapper element, identical markup.
 *
 * In the editor, `HomeCopyProvider` supplies live (unsaved) values plus a
 * `render` function that wraps each one in a contenteditable region. That is
 * what lets the editor render `app/routes/home.tsx` ITSELF rather than a
 * lookalike: the route has no idea it is being edited, and the two can't drift.
 *
 * See plans/svdsa-home-inplace-editing.md.
 */

import { createContext, useContext, type ReactNode } from "react";
import { HOME, type HomeCopy } from "~/lib/home";

/** Given a slot's key and its resolved value, render it however you like. */
export type SlotRenderer = (key: keyof HomeCopy, value: string) => ReactNode;

interface HomeCopyValue {
  copy: HomeCopy;
  render?: SlotRenderer;
}

/** The site's case: build-time copy, rendered as plain text. */
const HomeCopyContext = createContext<HomeCopyValue>({ copy: HOME });

export function HomeCopyProvider({
  copy,
  render,
  children,
}: HomeCopyValue & { children: ReactNode }) {
  // Deliberately not memoised. This provider exists only in the editor, where
  // every re-render IS a copy change, so a stable identity would buy nothing.
  return (
    <HomeCopyContext.Provider value={{ copy, render }}>
      {children}
    </HomeCopyContext.Provider>
  );
}

export function Slot({ k }: { k: keyof HomeCopy }) {
  const { copy, render } = useContext(HomeCopyContext);
  return <>{render ? render(k, copy[k]) : copy[k]}</>;
}
