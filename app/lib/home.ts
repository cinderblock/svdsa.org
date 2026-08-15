/**
 * Home-page copy — content, not code.
 *
 * Lives in `content/pages/home.md` frontmatter so a chapter editor can change
 * the headline, the intro, the section headings and the button labels from the
 * browser, exactly like any other page. Structure and layout stay in
 * `app/routes/home.tsx`; only the words are editable.
 *
 * Every field falls back to the shipped default, so an editor can't break the
 * page by clearing one. Note the cost of that kindness: when the WXR re-import
 * deleted home.md, the page kept rendering three strings shorter and nothing
 * complained (see plans/svdsa-home-inplace-editing.md).
 *
 * The route reads these through `<Slot>` (app/components/HomeSlot.tsx) rather
 * than touching HOME directly, which is what lets the browser editor render the
 * real route with live values and make each slot editable in place.
 */

import homeData from "../../content/generated/home.json";

export interface HomeCopy {
  kicker: string;
  headline: string;
  headlineTwo: string;
  lead: string;
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
 * them — so that an editor sees "Second line" rather than `headlineTwo`. Keeping
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

export const HOME_SLOTS: HomeSlot[] = [
  { key: "kicker", label: "Kicker", section: "Hero" },
  { key: "headline", label: "Headline", section: "Hero" },
  // Not "Headline, second line": these labels become accessible names, and one
  // that starts with another's full text makes both harder to address.
  { key: "headlineTwo", label: "Second line", section: "Hero" },
  { key: "lead", label: "Lead paragraph", section: "Hero", multiline: true },
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

// The `faithful` theme's hero is the live site's frontispiece, so its defaults
// are the wordmark rather than red's marketing couplet: `headline` and
// `headlineTwo` are the two lines of the chapter's name. A cleared field falls
// back here, and falling back to red's copy would set "Building working-class
// power," in the wordmark's monospace.
export const DEFAULTS: HomeCopy = {
  kicker: "Welcome",
  headline: "Silicon Valley",
  headlineTwo: "Democratic Socialists of America",
  lead: "We believe economies and societies should be run democratically to meet the needs of the many, not the few. We're not a political party — we're a community building working class power while fighting for a radically equitable society.",
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
