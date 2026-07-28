/**
 * Home-page copy — content, not code.
 *
 * Lives in `content/pages/home.md` frontmatter so a chapter editor can change
 * the headline, the intro, the section headings and the button labels from the
 * browser, exactly like any other page. Structure and layout stay in
 * `app/routes/home.tsx`; only the words are editable.
 *
 * Every field falls back to the shipped default, so an editor can't break the
 * page by clearing one.
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

const DEFAULTS: HomeCopy = {
  kicker: "Silicon Valley · South Bay",
  headline: "Building working-class power,",
  headlineTwo: "for the many — not the few.",
  lead: "We're not a political party — we're a community building working-class power while fighting for a radically equitable society.",
  ctaPrimary: "Join us",
  ctaEvents: "See upcoming events",
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

const raw = homeData as Partial<Record<keyof HomeCopy, unknown>>;

export const HOME: HomeCopy = { ...DEFAULTS };
for (const key of Object.keys(DEFAULTS) as (keyof HomeCopy)[]) {
  const v = raw[key];
  if (typeof v === "string" && v.trim()) HOME[key] = v;
}
