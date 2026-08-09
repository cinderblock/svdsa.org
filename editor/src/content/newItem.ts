/**
 * Where a new piece of content goes, and what it starts out as.
 *
 * This is the one place that knows the repo's naming conventions, so no editor
 * ever hand-writes a `path:` or works out which directory a file belongs in.
 * Every convention here was read off the existing corpus, not invented:
 *
 *   page       content/pages/<slug>.md                    → /<slug>/
 *              content/pages/<parent>/<slug>.md           → /<parent>/<slug>/
 *              (pages nest — e.g. political-education/bookclub/rosa-luxemburg)
 *   post       content/posts/<year>/<date>-<slug>.md      → /YYYY/MM/DD/<slug>/
 *   event      content/events/<year>/<date>-<slug>.md     → /event/<date>-<slug>/
 *              (538 one-offs all carry the date INSIDE the slug, which keeps an
 *              annually-repeating event from colliding with itself)
 *   series     content/events/<slug>.md                   → /event/<slug>/
 *              (21 recurring meetings live at the top level and carry a
 *              `recurrence:` rule; occurrences are derived, never stored)
 */

import { isEditablePath, slugify } from "./serialize";

export type NewKind = "page" | "post" | "event" | "series";

export interface NewItemInput {
  kind: NewKind;
  title: string;
  /** YYYY-MM-DD. Required for post, event and series. */
  date?: string;
  /** HH:MM local. Events only. */
  startTime?: string;
  endTime?: string;
  /** Slug of the parent page, for nesting. Pages only. */
  parent?: string;
  /** Override the slug derived from the title. */
  slug?: string;
  categories?: string[];
  /** Online-only, in person, or both. */
  venue?: string;
  isVirtual?: boolean;
  /** Withheld from the build until published. Defaults per base branch. */
  draft?: boolean;
  /** Author's summary; posts use it as the excerpt. */
  summary?: string;
}

export interface PlannedItem {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  /** The URL it will have on the site, for the editor to show. */
  url: string;
}

export class InvalidNewItem extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * A stable numeric id, since every migrated item has one and the app uses it for
 * React keys and iCalendar UIDs.
 *
 * Derived from the path so it is reproducible rather than random — re-planning
 * the same item twice yields the same id. Offset well clear of the WordPress
 * range (5-digit pages/posts, 1000xxxx events) so a new item can never collide
 * with a migrated one. Collisions *between* new items are possible in principle,
 * which is why build-content.ts fails on duplicate ids rather than trusting this.
 */
export function idForPath(path: string): number {
  let h = 0;
  for (const ch of path) h = (h * 31 + ch.charCodeAt(0)) % 100_000_000;
  return 900_000_000 + h;
}

function requireDate(input: NewItemInput): string {
  if (!input.date || !DATE_RE.test(input.date))
    throw new InvalidNewItem(`${input.kind} needs a date as YYYY-MM-DD`);
  return input.date;
}

/** "18:30" → " 18:30:00", matching the corpus's `start:` format. */
function at(date: string, time: string | undefined, fallback: string): string {
  const t = time && TIME_RE.test(time) ? time : fallback;
  return `${date} ${t}:00`;
}

export function planNewItem(input: NewItemInput): PlannedItem {
  const title = input.title.trim();
  if (!title) throw new InvalidNewItem("a title is required");

  const stem = slugify(input.slug || title);
  if (!stem)
    throw new InvalidNewItem(
      "could not make a URL from that title — add a slug",
    );

  const common = {
    title,
    ...(input.draft ? { draft: true } : {}),
  };

  let planned: PlannedItem;

  switch (input.kind) {
    case "page": {
      // Parent is a page slug path, not a URL; normalize either spelling.
      const parent = (input.parent ?? "")
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean)
        .map((s) => slugify(s))
        .join("/");
      const rel = parent ? `${parent}/${stem}` : stem;
      const url = `/${rel}/`;
      planned = {
        path: `content/pages/${rel}.md`,
        url,
        frontmatter: {
          id: idForPath(url),
          slug: stem,
          path: url,
          ...common,
        },
        body: `Write the page here.`,
      };
      break;
    }

    case "post": {
      const date = requireDate(input);
      const [y, m, d] = date.split("-");
      const url = `/${y}/${m}/${d}/${stem}/`;
      planned = {
        path: `content/posts/${y}/${date}-${stem}.md`,
        url,
        frontmatter: {
          id: idForPath(url),
          slug: stem,
          path: url,
          ...common,
          date: `${date}T09:00:00`,
          ...(input.summary ? { excerpt: input.summary } : {}),
          categories: input.categories ?? [],
          tags: [],
        },
        body: `Write the post here.`,
      };
      break;
    }

    case "event":
    case "series": {
      const date = requireDate(input);
      const isSeries = input.kind === "series";
      // A one-off carries its date in the slug; a series must not, since the
      // series outlives any single date.
      const slug = isSeries ? stem : `${date}-${stem}`;
      const url = `/event/${slug}/`;
      const year = date.slice(0, 4);
      planned = {
        path: isSeries
          ? `content/events/${slug}.md`
          : `content/events/${year}/${slug}.md`,
        url,
        frontmatter: {
          id: idForPath(url),
          slug,
          path: url,
          ...common,
          start: at(date, input.startTime, "18:00"),
          end: at(date, input.endTime, "19:30"),
          allDay: false,
          timezone: "America/Los_Angeles",
          isVirtual: input.isVirtual ?? false,
          ...(input.venue ? { venue: { name: input.venue } } : {}),
          organizer: "Silicon Valley DSA",
          categories: input.categories ?? [],
          // The recurrence editor fills this in; a series without a rule is
          // just a one-off in the wrong directory, so seed a weekly default.
          ...(isSeries
            ? { recurrence: { rrule: `FREQ=WEEKLY;BYDAY=${weekdayOf(date)}` } }
            : {}),
        },
        body: `Describe the event here — what it is, who it's for, what to bring.`,
      };
      break;
    }
  }

  // Belt and braces: the wizard builds these paths, but the Worker's write
  // boundary is the thing that matters, so assert we stayed inside it.
  if (!isEditablePath(planned.path))
    throw new InvalidNewItem(`refusing to create outside content: ${planned.path}`);
  return planned;
}

/** iCalendar weekday code for a date, e.g. "SA". */
function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][
    new Date(y, m - 1, d).getDay()
  ];
}
