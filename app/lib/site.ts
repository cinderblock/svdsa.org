/**
 * Site information architecture and external integrations.
 *
 * The editable DATA lives in committed config files under `content/config/`
 * (so a future in-browser editor can round-trip it, and edits are traceable in
 * git). This module just types that data and composes the nav. Structure and
 * layout stay in code — only the lists/values are content.
 *
 * All nav targets are real pages in content/pages/ or the external services the
 * chapter already uses (Action Network, Zeffy, national DSA, Google Forms).
 */

import siteData from "../../content/config/site.json";
import externalData from "../../content/config/external.json";
import socialsData from "../../content/config/socials.json";
import navData from "../../content/config/navigation.json";
import photosData from "../../content/config/photos.json";

export interface SiteInfo {
  name: string;
  tagline: string;
  description: string;
}
export const SITE = siteData as SiteInfo;

/** External services the chapter already uses (verified from the live site). */
export interface External {
  joinNational: string;
  duesWaiver: string;
  localDues: string;
  donate: string;
  newsletter: string;
  /** General enquiries. The chapter has no contact FORM — it uses email. */
  email: string;
  /** Harassment grievances (a distinct, sensitive flow) + the policy doc. */
  grievanceForm: string;
  grievancePolicy: string;
}
export const EXTERNAL = externalData as External;

export interface Social {
  label: string;
  href: string;
}
export const SOCIALS = socialsData as Social[];

export interface ChapterPhoto {
  src: string;
  alt: string;
  caption?: string;
}

/**
 * Photos of the chapter in action, shown in the home-page "In the streets"
 * strip (content/config/photos.json). Empty by default: member/action photos
 * are the chapter's to clear (consent + safety — e.g. face exposure at ICE
 * actions), so they aren't scraped in automatically. To add: drop files in
 * `public/photos/` and add entries like
 *   { "src": "/photos/rally-2026.jpg", "alt": "Members marching", "caption": "…" }
 * The strip only renders when the array is non-empty.
 */
export const CHAPTER_PHOTOS = photosData as ChapterPhoto[];

export interface NavLink {
  label: string;
  to: string;
  /** Emoji marker for working groups / committees (content/config/navigation.json). */
  icon?: string;
}
export interface NavGroup {
  label: string;
  to?: string;
  children?: NavLink[];
}

const nav = navData as {
  workingGroups: NavLink[];
  committees: NavLink[];
  resources: NavLink[];
};
export const WORKING_GROUPS = nav.workingGroups;
export const COMMITTEES = nav.committees;
export const RESOURCES = nav.resources;

/**
 * Emoji by page path, for the working-group / committee pages. Chapter-owned
 * data (navigation.json) so adding a group means editing content, not code.
 */
export const PAGE_ICONS: Record<string, string> = Object.fromEntries(
  [...WORKING_GROUPS, ...COMMITTEES]
    .filter((l) => l.icon)
    .map((l) => [l.to, l.icon as string]),
);

/** Primary nav composition (structure in code; the lists above are content). */
export const NAV: NavGroup[] = [
  { label: "Calendar", to: "/calendar" },
  {
    label: "About",
    to: "/about/",
    children: [
      { label: "About Us", to: "/about/" },
      { label: "Bylaws", to: "/bylaws/" },
      { label: "Contact", to: "/contact/" },
      ...COMMITTEES,
    ],
  },
  { label: "Working Groups", children: WORKING_GROUPS },
  { label: "Resources", children: RESOURCES },
  { label: "Blog", to: "/blog" },
];
