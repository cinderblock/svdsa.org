/**
 * A stand-in for `react-router`, used only when the editor renders site code.
 *
 * The home-page editor renders `app/routes/home.tsx` itself, so that what you
 * type on cannot drift from what ships. That route (and `EventCard` under it)
 * imports `Link` — but the editor is not a routed app, so there is no Router to
 * provide the context `Link` needs.
 *
 * Adding react-router as a real dependency would ship a router the editor never
 * uses and STILL leave every link needing to be neutralised: a click inside a
 * preview must not navigate the frame away from the document being edited.
 *
 * Wired up in `editor/vite.config.ts`. TypeScript still resolves the real
 * package (hoisted at the workspace root), so the site's types are the ones
 * checked; this only replaces the runtime.
 */

import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * A real `<a>`, because the site's `.btn` and `.card` rules style the element —
 * but with no `href`, so it is inert. `to` is deliberately dropped rather than
 * forwarded to the DOM.
 */
export function Link({
  to: _to,
  children,
  ...rest
}: { to: string; children?: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return <a {...rest}>{children}</a>;
}
