/**
 * Glyphs for the chapter's accounts, drawn as paths rather than fetched as
 * images.
 *
 * The original footer uses one uploaded PNG per network. Inline SVG instead:
 * it inherits `currentColor`, so the same glyph works black on the footer's
 * grey and white on a red hover without a second file, and it costs no
 * requests. Paths are the networks' own marks, which is what a link to them is
 * allowed to use.
 *
 * Keyed by the `label` in `content/config/socials.yaml`. An account with no
 * glyph here still renders — see `SocialIcon`'s fallback — so adding one to the
 * config never produces a blank circle.
 */

const PATHS: Record<string, string> = {
  instagram:
    "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.1A6.7 6.7 0 1 0 18.7 12 6.7 6.7 0 0 0 12 5.3zm0 11A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11.2a1.6 1.6 0 1 1-1.6-1.6 1.6 1.6 0 0 1 1.6 1.6z",
  facebook:
    "M13.5 21.9v-8.6h2.9l.4-3.4h-3.3V7.8c0-1 .3-1.6 1.7-1.6h1.8V3.1a24 24 0 0 0-2.6-.1c-2.6 0-4.4 1.6-4.4 4.5v2.4H7.1v3.4h2.9v8.6z",
  bluesky:
    "M5.8 4.3C8.4 6.2 11.1 10.2 12 12.3c.9-2.1 3.6-6.1 6.2-8 1.9-1.4 4.9-2.5 4.9.9 0 .7-.4 5.7-.6 6.5-.7 2.8-3.6 3.6-6.1 3.1 4.4.8 5.5 3.2 3.1 5.7-4.6 4.7-6.6-1.2-7.1-2.7-.1-.3-.2-.4-.2-.3s-.1.1-.2.3c-.5 1.5-2.5 7.4-7.1 2.7-2.4-2.5-1.3-4.9 3.1-5.7-2.5.5-5.4-.3-6.1-3.1-.2-.8-.6-5.8-.6-6.5 0-3.4 3-2.3 4.9-.9z",
  youtube:
    "M23 7.5a2.9 2.9 0 0 0-2-2C19.2 5 12 5 12 5s-7.2 0-9 .5a2.9 2.9 0 0 0-2 2A30 30 0 0 0 .5 12 30 30 0 0 0 1 16.5a2.9 2.9 0 0 0 2 2c1.8.5 9 .5 9 .5s7.2 0 9-.5a2.9 2.9 0 0 0 2-2 30 30 0 0 0 .5-4.5 30 30 0 0 0-.5-4.5zM9.8 15.3V8.7l6 3.3z",
  "twitter / x":
    "M17.5 3h3.1l-6.8 7.7L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.2-8.3L2.2 3h6.4l4.4 5.8zm-1.1 16.1h1.7L7.7 4.8H5.9z",
  linktree:
    "M10.7 2h2.6v5.2l3.7-3.7 1.8 1.9-3.8 3.7H20v2.6h-5l3.8 3.8-1.8 1.8-5-5.1-5 5.1-1.8-1.8L9 11.7H4V9.1h5L5.2 5.4 7 3.5l3.7 3.7zm0 14.2h2.6V22h-2.6z",
  "dsa national":
    "M11.5 21.5c-3.6-1.4-6-4.4-6-7.6 0-2.4 1.6-3.9 3.6-3.9 1.3 0 2.3.6 2.9 1.6-.4-3.3.9-6.3 3.4-8.1 1.6-1.2 3.6-1.8 5.6-1.9-1.2 1.6-1.4 3.2-1 4.6.4 1.5 1.4 2.8 1.4 4.6 0 3.2-2.7 5.6-6 5.6-1.2 0-2.3-.3-3.2-.9.6 2 1.9 3.9 3.6 5.3z",
  email:
    "M3 5h18a1 1 0 0 1 1 1v.4l-10 5.9L2 6.4V6a1 1 0 0 1 1-1zm-1 3.7 9.5 5.6a1 1 0 0 0 1 0L22 8.7V18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z",
};

/**
 * The mark for an account, or its initial if we have no mark for it.
 *
 * The fallback matters: `socials.yaml` is chapter-editable, so a new account can
 * appear here before anyone adds a path, and a circle with a letter in it reads
 * as an account rather than as a bug.
 */
export function SocialIcon({ label }: { label: string }) {
  const d = PATHS[label.toLowerCase()];
  if (!d) {
    return (
      <span className="socials__initial" aria-hidden="true">
        {label.slice(0, 1)}
      </span>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
