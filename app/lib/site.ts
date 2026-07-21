/**
 * Site information architecture and external integrations.
 *
 * The nav is curated (content/structure clone of siliconvalleydsa.org) rather
 * than auto-generated, so ordering and grouping stay intentional. All targets
 * are real pages in content/pages.json or the external services the chapter
 * already uses (Action Network, Zeffy, national DSA, Google Forms).
 */

export const SITE = {
  name: "Silicon Valley DSA",
  tagline: "Solidarity Forever.",
  description:
    "Silicon Valley Democratic Socialists of America — building working-class power in the South Bay.",
};

/** External services the chapter already uses (verified from the live site). */
export const EXTERNAL = {
  joinNational: "https://www.dsausa.org/join",
  duesWaiver: "https://act.dsausa.org/survey/dueswaiver/",
  localDues: "https://www.zeffy.com/embed/donation-form/sv-dsa-local-dues",
  donate: "https://www.zeffy.com/embed/donation-form/sv-dsa-local-dues",
  newsletter: "https://actionnetwork.org/forms/sv-dsa-newsletter",
  contactForm:
    "https://docs.google.com/forms/d/1YGZIftsaZGCvtPY2HN4sVb91CakMTiIfVtLKiZfiOo0/viewform",
};

export interface ChapterPhoto {
  src: string;
  alt: string;
  caption?: string;
}

/**
 * Photos of the chapter in action, shown in the home-page "In the streets"
 * strip. Intentionally EMPTY by default: member/action photos are the
 * chapter's to clear (consent + safety — e.g. face exposure at ICE actions),
 * so they aren't scraped in automatically.
 *
 * To add real photos: drop files in `public/photos/` and list them here, e.g.
 *   { src: "/photos/rally-2026.jpg", alt: "Members marching with a banner",
 *     caption: "No Kings rally, Gilroy" }
 * The strip only renders when this array is non-empty.
 */
export const CHAPTER_PHOTOS: ChapterPhoto[] = [];

export const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/silicon_valley_dsa/" },
  { label: "Facebook", href: "https://www.facebook.com/svdsa/" },
  { label: "Twitter / X", href: "https://twitter.com/SV_DSA" },
];

export interface NavLink {
  label: string;
  to: string;
}
export interface NavGroup {
  label: string;
  to?: string;
  children?: NavLink[];
}

export const WORKING_GROUPS: NavLink[] = [
  { label: "Housing", to: "/housing/" },
  { label: "Labor", to: "/labor/" },
  { label: "Transit", to: "/transit/" },
  { label: "Community Safety", to: "/community-safety/" },
  { label: "Ecosocialist", to: "/ecosocialist/" },
  { label: "Healthcare", to: "/healthcare/" },
  { label: "International Solidarity", to: "/international-solidarity/" },
  { label: "Liberation & Justice", to: "/liberation-and-justice/" },
  { label: "Mutual Aid", to: "/mutual-aid/" },
  { label: "Political Education", to: "/political-education/" },
  { label: "Socialist Feminist", to: "/socialist-feminist/" },
];

export const COMMITTEES: NavLink[] = [
  { label: "Steering", to: "/steering/" },
  { label: "Communications", to: "/communications/" },
  { label: "Finance", to: "/finance/" },
  { label: "Membership", to: "/membership/" },
  { label: "Electoral", to: "/electoral/" },
  { label: "Tech & Data", to: "/tech-and-data/" },
  { label: "Social", to: "/social/" },
];

export const RESOURCES: NavLink[] = [
  { label: "Voters' Guide", to: "/voters-guide/" },
  { label: "Protest Safety", to: "/protest-safety/" },
  { label: "Strike Solidarity Kit", to: "/strike-solidarity-kit/" },
  { label: "Tenant Union (SVTU)", to: "/svtu/" },
  { label: "SVDSA Links", to: "/links/" },
];

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
