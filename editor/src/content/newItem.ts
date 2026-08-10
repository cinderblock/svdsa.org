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

/**
 * The URL a content file will have on the site — the inverse of the conventions
 * above, derived from the filename alone.
 *
 * That it works from the filename with no frontmatter is what makes link
 * checking cheap: the Worker already has the file list, so it can build the set
 * of valid addresses without reading a thousand files.
 *
 * Returns null for anything without a public URL (config, drafts we can't see
 * from the path).
 */
export function urlForContentPath(path: string): string | null {
  const page = path.match(/^content\/pages\/(.+)\.md$/);
  if (page) return `/${page[1]}/`;

  const post = path.match(
    /^content\/posts\/\d{4}\/(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/,
  );
  if (post) return `/${post[1]}/${post[2]}/${post[3]}/${post[4]}/`;

  // Both a top-level series and a year-bucketed one-off address as /event/<slug>/.
  const event = path.match(/^content\/events\/(?:\d{4}\/)?([^/]+)\.md$/);
  if (event) return `/event/${event[1]}/`;

  return null;
}

/**
 * Where an item moves to when its address changes.
 *
 * Derived from the OLD path so the structure that isn't being changed survives:
 * a post keeps its year bucket and date prefix, a one-off event keeps its year
 * directory, a series stays at the top level. Only the human-chosen part of the
 * address moves.
 */
export function planRename(
  oldPath: string,
  next: { slug?: string; parent?: string },
): { path: string; url: string; slug: string } {
  const wanted = slugify(next.slug ?? "");
  if (!wanted) throw new InvalidNewItem("a new address is required");

  let planned: { path: string; url: string; slug: string };

  const page = oldPath.match(/^content\/pages\/(.+)\.md$/);
  const post = oldPath.match(/^content\/posts\/(\d{4})\/(\d{4}-\d{2}-\d{2})-.+\.md$/);
  const dated = oldPath.match(/^content\/events\/(\d{4})\/.+\.md$/);
  const series = oldPath.match(/^content\/events\/([^/]+)\.md$/);

  if (page) {
    // `parent` is optional: undefined keeps the page where it is, "" moves it
    // to the top level. Those are different intentions, so don't conflate them.
    const current = page[1].split("/").slice(0, -1).join("/");
    const parent = (next.parent ?? current)
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)
      .map(slugify)
      .join("/");
    const rel = parent ? `${parent}/${wanted}` : wanted;
    planned = {
      path: `content/pages/${rel}.md`,
      url: `/${rel}/`,
      slug: wanted,
    };
  } else if (post) {
    const [, year, date] = post;
    const [y, m, d] = date.split("-");
    planned = {
      path: `content/posts/${year}/${date}-${wanted}.md`,
      url: `/${y}/${m}/${d}/${wanted}/`,
      slug: wanted,
    };
  } else if (dated) {
    planned = {
      path: `content/events/${dated[1]}/${wanted}.md`,
      url: `/event/${wanted}/`,
      slug: wanted,
    };
  } else if (series) {
    planned = {
      path: `content/events/${wanted}.md`,
      url: `/event/${wanted}/`,
      slug: wanted,
    };
  } else {
    throw new InvalidNewItem(`don't know how to rename ${oldPath}`);
  }

  if (!isEditablePath(planned.path))
    throw new InvalidNewItem(`refusing to move outside content: ${planned.path}`);
  if (planned.path === oldPath)
    throw new InvalidNewItem("that is already its address");
  return planned;
}

/** iCalendar weekday code for a date, e.g. "SA". */
function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][
    new Date(y, m - 1, d).getDay()
  ];
}
