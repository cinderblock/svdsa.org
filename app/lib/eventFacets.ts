/**
 * Calendar filter facets — the single definition shared by the calendar UI
 * (`routes/calendar.tsx`) and the static `.ics` feed generator
 * (`scripts/build-content.ts`), so a subscribed feed always contains exactly
 * what the matching on-site filter shows.
 *
 * Deliberately dependency-free (no content imports) so the build script can
 * use it too.
 */

export type FacetKey =
  | "all"
  | "wg"
  | "committee"
  | "social"
  | "newbie"
  | "online";

export interface Facet {
  key: FacetKey;
  label: string;
  /** Feed filename stem under /calendar/ (omitted for "all" → all.ics). */
  slug: string;
}

export const FACETS: Facet[] = [
  { key: "all", label: "All", slug: "all" },
  { key: "wg", label: "Working Groups", slug: "working-groups" },
  { key: "committee", label: "Committees", slug: "committees" },
  { key: "social", label: "Social", slug: "social" },
  { key: "newbie", label: "Newbie-friendly", slug: "newbie-friendly" },
  { key: "online", label: "Online", slug: "online" },
];

/** The minimum an event needs to be filtered. Both slim and full shapes fit. */
export interface FacetableEvent {
  categories: string[];
  isVirtual: boolean;
  /** Venue NAME (the slim shape) — full events pass `venue?.name`. */
  venue: string | null;
}

export function matchesFacet(ev: FacetableEvent, key: FacetKey): boolean {
  const cats = ev.categories.map((c) => c.toLowerCase());
  switch (key) {
    case "all":
      return true;
    case "wg":
      return cats.some((c) => c.startsWith("wg"));
    case "committee":
      return cats.some((c) => c.includes("committee"));
    case "social":
      return cats.some((c) => c.includes("social"));
    case "newbie":
      return cats.some((c) => c.includes("newbie"));
    case "online":
      return ev.isVirtual || ev.venue === "Zoom";
  }
}

/** URL/file-safe slug for a category name ("WG - Housing" → "wg-housing"). */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
