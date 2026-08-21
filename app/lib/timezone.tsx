/**
 * Which timezone the reader sees event times in.
 *
 * Every stored event time is Pacific wall-clock (see app/lib/today.ts), and
 * that is what the site renders by default — the chapter meets in San Jose, so
 * "6:30pm" means 6:30pm there. But a member reading from a laptop in New York,
 * or a comrade travelling, wants their own clock, and until now the site
 * silently gave them the WRONG one: `new Date("2026-08-19 18:30:00")` is parsed
 * in the browser's zone, so a Pacific evening meeting displayed as 6:30pm in
 * New York too — three hours off, with nothing on the page to say so.
 *
 * So: times are labelled (PDT, EST, …) and the label is the control. Pick a
 * zone and it sticks, per browser, in localStorage.
 *
 * HYDRATION. The choice can only be read in the browser, and the HTML is
 * prerendered — so `useTimeZone()` returns the CHAPTER's zone on the server and
 * on the first client render, exactly like useNow(). The stored preference is
 * applied in an effect, which re-renders every time on the page at once. That
 * costs a flash of Pacific time for readers who have chosen otherwise, and buys
 * a prerendered site that is correct for everyone who hasn't.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CHAPTER_TIMEZONE } from "./today";

const STORAGE_KEY = "svdsa:timezone";

/** `null` means "the chapter's zone" — the default, and not stored. */
export type ZoneChoice = string | null;

interface TimeZoneState {
  /** The zone to format in. Never null; falls back to the chapter's. */
  zone: string;
  /** What the reader picked, or null for the chapter default. */
  choice: ZoneChoice;
  choose: (next: ZoneChoice) => void;
  /** What this device thinks it's in, for the "your time" shortcut. */
  device: string;
  /** False until the effect has run, so UI can avoid claiming a stored value. */
  ready: boolean;
}

const Ctx = createContext<TimeZoneState | null>(null);

/** Best-effort device zone; some environments report nothing useful. */
function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || CHAPTER_TIMEZONE;
  } catch {
    return CHAPTER_TIMEZONE;
  }
}

/** A zone string is only usable if Intl accepts it — stored values can rot. */
export function isUsableZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function TimeZoneProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoice] = useState<ZoneChoice>(null);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState(CHAPTER_TIMEZONE);

  useEffect(() => {
    setDevice(deviceZone());
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode, or storage disabled. Chapter time it is.
    }
    // A zone that no longer exists (renamed, or written by an older build)
    // must not wedge the whole site into throwing on every format call.
    if (stored && isUsableZone(stored)) setChoice(stored);
    setReady(true);
  }, []);

  const choose = useCallback((next: ZoneChoice) => {
    setChoice(next);
    try {
      if (next === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is survivable; the choice still holds for this page.
    }
  }, []);

  const value = useMemo<TimeZoneState>(
    () => ({ zone: choice ?? CHAPTER_TIMEZONE, choice, choose, device, ready }),
    [choice, choose, device, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The zone to format in, plus the controls to change it.
 *
 * Usable outside the provider (returns the chapter default), so a component
 * can't crash a page just by rendering somewhere unexpected.
 */
/** Hoisted, so a component outside the provider doesn't see a new object
 *  identity on every render. */
const OUTSIDE_PROVIDER: TimeZoneState = {
  zone: CHAPTER_TIMEZONE,
  choice: null,
  choose: () => {},
  device: CHAPTER_TIMEZONE,
  ready: false,
};

export function useTimeZone(): TimeZoneState {
  return useContext(Ctx) ?? OUTSIDE_PROVIDER;
}

/** Every zone this browser knows, for the full picker. Empty if unsupported. */
export function allZones(): string[] {
  const supported = (
    Intl as unknown as {
      supportedValuesOf?: (k: string) => string[];
    }
  ).supportedValuesOf;
  try {
    return supported ? supported("timeZone") : [];
  } catch {
    return [];
  }
}

/** "America/Los_Angeles" → "Los Angeles" — readable in a menu. */
export function zoneLabel(tz: string): string {
  const city = tz.split("/").pop() ?? tz;
  return city.replace(/_/g, " ");
}
