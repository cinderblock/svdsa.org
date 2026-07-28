/**
 * Visual vocabulary for events: category colours and place markers.
 *
 * Colours are assigned per category so the calendar reads at a glance — a
 * Housing meeting always looks the same wherever it appears. Working groups and
 * committees reuse the emoji already chosen for them in
 * `content/config/navigation.json`, so there's one source of truth for "what
 * does Housing look like".
 */

import { COMMITTEES, WORKING_GROUPS } from "./site";

/**
 * Hue per category. Deliberately a fixed table rather than a hash of the name:
 * categories are few and long-lived, and a hash would reshuffle every colour
 * whenever one is renamed.
 */
const CATEGORY_HUES: Record<string, number> = {
  "wg - housing": 24,
  "wg - labor": 45,
  "wg - transit": 200,
  "wg - community safety": 8,
  "wg - ecosocialist": 140,
  "wg - healthcare": 320,
  "wg - international solidarity": 220,
  "wg - liberation and justice": 265,
  "wg - mutual aid": 170,
  "wg - political education": 285,
  "wg - socialist feminist": 340,
  "wg - electoral": 95,
  "committee - communications": 190,
  "committee - tech and data": 210,
  "committee - social": 300,
  "committee - finance": 60,
  "committee - membership": 350,
  "steering committee": 355,
  "general meeting": 355,
  external: 30,
  social: 300,
  "newbie-friendly": 120,
};

/** The category that should define an event's colour (most specific wins). */
export function primaryCategory(categories: string[]): string | null {
  const ranked = [...categories].sort((a, b) => rank(b) - rank(a));
  return ranked.find((c) => rank(c) > 0) ?? null;
}
function rank(c: string): number {
  const k = c.toLowerCase();
  if (k.startsWith("wg -")) return 4;
  if (k.startsWith("committee -")) return 3;
  if (k === "steering committee" || k === "general meeting") return 2;
  if (k in CATEGORY_HUES) return 1;
  return 0;
}

/** A stable hue for any category, falling back to a spread of the name. */
export function categoryHue(category: string): number {
  const key = category.toLowerCase();
  if (key in CATEGORY_HUES) return CATEGORY_HUES[key];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Inline custom property consumers turn into background/border colours. */
export function categoryStyle(
  categories: string[],
): Record<string, string> | undefined {
  const cat = primaryCategory(categories);
  return cat ? { ["--cat-hue"]: String(categoryHue(cat)) } : undefined;
}

/** Emoji for a category, reusing the group's own icon where there is one. */
const GROUP_ICONS: Record<string, string> = Object.fromEntries(
  [...WORKING_GROUPS, ...COMMITTEES]
    .filter((g) => g.icon)
    .map((g) => [g.label.toLowerCase().replace(/\s*&\s*/g, " and "), g.icon!]),
);

export function categoryIcon(category: string): string | undefined {
  const k = category.toLowerCase();
  const bare = k.replace(/^(wg|committee)\s*-\s*/, "");
  return GROUP_ICONS[bare] ?? GROUP_ICONS[k];
}

export type Place = "online" | "in-person" | "hybrid";

/**
 * Where an event happens. "Hybrid" is the interesting case for this chapter —
 * most meetings are in a room AND on Zoom, and members need to know they can
 * join remotely without reading the description.
 */
export function placeOf(ev: {
  isVirtual?: boolean;
  venue?: string | null;
  virtualUrl?: string | null;
}): Place {
  const venue = (ev.venue ?? "").trim();
  const hasRoom = venue !== "" && venue.toLowerCase() !== "zoom";
  const online =
    Boolean(ev.isVirtual) ||
    venue.toLowerCase() === "zoom" ||
    Boolean(ev.virtualUrl);
  if (hasRoom && online) return "hybrid";
  return hasRoom ? "in-person" : "online";
}

export const PLACE_META: Record<Place, { icon: string; label: string }> = {
  online: { icon: "💻", label: "Online" },
  "in-person": { icon: "📍", label: "In person" },
  hybrid: { icon: "🔀", label: "In person + online" },
};
