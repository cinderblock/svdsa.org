/**
 * Full event detail — imported ONLY by the event route so the ~660 KB of
 * descriptions/venues never loads on the calendar or any other page.
 */

import eventsFullData from "../../content/generated/events-full.json";

export interface EventFull {
  /** WordPress numeric id for one-offs; `<seriesId>-<date>` for expanded
   * recurring instances (see scripts/expand-recurring.ts). */
  id: string | number;
  path: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  descriptionHtml: string;
  cost: string | null;
  website: string | null;
  isVirtual: boolean;
  virtualUrl: string | null;
  venue: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  organizer: string | null;
  categories: string[];
  image: string | null;
}

export const eventsFull = eventsFullData as EventFull[];

const normalize = (p: string) => (p.endsWith("/") ? p : p + "/");

export function getEvent(pathname: string): EventFull | undefined {
  const want = normalize(pathname);
  return eventsFull.find((e) => normalize(e.path) === want);
}
