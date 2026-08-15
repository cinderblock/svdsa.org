/**
 * Home-page copy — content, not code.
 *
 * The page's words come from `content/pages/home.md` in two shapes, matching
 * the original the rebuild is faithful to:
 *
 *   the BODY      the welcome inside the hero's plate card. On the WordPress
 *                 site this is the Welcome page's `entry-content` — a wordmark,
 *                 a rule, and three paragraphs thick with bold, italics and
 *                 links. None of that survives a YAML scalar, so it stays a
 *                 markdown body and the editor edits it with the same rich text
 *                 mode as any other page. Rendered to `HOME_HTML`.
 *   FRONTMATTER   the short strings the layout arranges around it — section
 *                 headings and button labels. These are the `<Slot>`s.
 *
 * Structure and layout stay in `app/routes/home.tsx`; only the words are
 * editable.
 *
 * Every frontmatter field falls back to the shipped default, so an editor can't
 * break the page by clearing one. Note the cost of that kindness: when the WXR
 * re-import deleted home.md, the page kept rendering three strings shorter and
 * nothing complained (see plans/svdsa-home-inplace-editing.md).
 *
 * The route reads all of it through `app/components/HomeSlot.tsx` rather than
 * touching HOME directly, which is what lets the browser editor render the real
 * route with live values and make each slot editable in place.
 */

import homeData from "../../content/generated/home.json";

export interface HomeCopy {
  ctaPrimary: string;
  ctaEvents: string;
  ctaDonate: string;
  photosHeading: string;
  eventsHeading: string;
  groupsHeading: string;
  groupsIntro: string;
  dispatchesHeading: string;
  closingHeading: string;
  closingIntro: string;
}

/**
 * The page's slots, in the order a reader meets them.
 *
 * `label` and `section` exist for the browser editor — the site never renders
 * them — so that an editor sees "Donate button" rather than `ctaDonate`. Keeping
 * them here rather than in the editor means adding a slot is one edit, and a
 * slot can't end up in the editor without copy or vice versa.
 */
export interface HomeSlot {
  key: keyof HomeCopy;
  label: string;
  /** Heading this slot sits under in the editor's outline. */
  section: string;
  /** A paragraph rather than a line — the editor lets it wrap. */
  multiline?: boolean;
}

// The hero's prose is not here — it is the markdown body (see HOME_HTML), so
// the words in the plate are edited in the plate, with bold and links intact.
export const HOME_SLOTS: HomeSlot[] = [
  { key: "ctaPrimary", label: "Join button", section: "Hero" },
  { key: "ctaEvents", label: "Events button", section: "Hero" },
  { key: "ctaDonate", label: "Donate button", section: "Hero" },
  { key: "photosHeading", label: "Heading", section: "Photos" },
  { key: "eventsHeading", label: "Heading", section: "Upcoming events" },
  { key: "groupsHeading", label: "Heading", section: "Working groups" },
  {
    key: "groupsIntro",
    label: "Intro",
    section: "Working groups",
    multiline: true,
  },
  { key: "dispatchesHeading", label: "Heading", section: "Dispatches" },
  { key: "closingHeading", label: "Heading", section: "Closing" },
  { key: "closingIntro", label: "Intro", section: "Closing", multiline: true },
];

export const DEFAULTS: HomeCopy = {
  ctaPrimary: "Join us",
  ctaEvents: "Upcoming events",
  ctaDonate: "Donate",
  photosHeading: "In the streets",
  eventsHeading: "Upcoming events",
  groupsHeading: "Where the work happens",
  groupsIntro: "Members organize through working groups.",
  dispatchesHeading: "Latest dispatches",
  closingHeading: "Ready to get organized?",
  closingIntro:
    "Come to an event, sign up for the newsletter, or become a member today.",
};

/**
 * Lay stored frontmatter over the shipped defaults.
 *
 * A blank or non-string value falls back, so a cleared field is a no-op rather
 * than an empty heading.
 *
 * Exported because the browser editor resolves live, unsaved frontmatter through
 * this same function. If it didn't, clearing a field would look different in the
 * editor than it does on the page — which is exactly the kind of drift the whole
 * render-the-real-route approach exists to prevent.
 */
export function resolveHomeCopy(
  raw: Partial<Record<keyof HomeCopy, unknown>>,
): HomeCopy {
  const out: HomeCopy = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof HomeCopy)[]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) out[key] = v;
  }
  return out;
}

export const HOME: HomeCopy = resolveHomeCopy(
  homeData as Partial<Record<keyof HomeCopy, unknown>>,
);

/**
 * The welcome inside the hero's plate card, as rendered HTML.
 *
 * There is no default: unlike a heading, a shipped fallback for a page of prose
 * would quietly paper over the body going missing — which is exactly how the
 * WXR re-import managed to delete home.md without anyone noticing. An empty
 * body renders an empty plate, and the home tests fail.
 */
export const HOME_HTML: string =
  typeof (homeData as { html?: unknown }).html === "string"
    ? (homeData as { html: string }).html
    : "";
