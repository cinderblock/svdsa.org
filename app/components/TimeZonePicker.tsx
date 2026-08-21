/**
 * The zone label beside a time — "PDT" — which is also the control.
 *
 * Times on this site are the chapter's, in Pacific. Saying so is the point:
 * an unlabelled "6:30pm" is a guess for anyone not in California. Clicking the
 * label opens a small menu to switch to the reader's own zone, or any other;
 * the choice is remembered in localStorage and applied on every later load.
 *
 * Deliberately a real button and a real menu, not a `title=` tooltip: this has
 * to work on a phone, where hover does not exist.
 */

import { useEffect, useId, useRef, useState } from "react";
import { zoneAbbr } from "~/lib/format";
import {
  allZones,
  useTimeZone,
  zoneLabel,
  type ZoneChoice,
} from "~/lib/timezone";
import { CHAPTER_TIMEZONE } from "~/lib/today";

export function TimeZonePicker({
  /** An instant to label — zone names are seasonal (PST vs PDT). */
  at,
  className,
}: {
  at: string;
  className?: string;
}) {
  const { zone, choice, choose, device } = useTimeZone();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const menuId = useId();

  // Close on outside click and on Escape — a menu you can't dismiss with the
  // gesture you already know is worse than no menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const pick = (next: ZoneChoice) => {
    choose(next);
    setOpen(false);
  };

  const deviceIsChapter = device === CHAPTER_TIMEZONE;
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? allZones()
        .filter((z) => z.toLowerCase().includes(needle))
        .slice(0, 40)
    : [];

  return (
    <span className={`tzpick${className ? " " + className : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="tzpick__btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {zoneAbbr(at, zone)}
        <span className="tzpick__caret" aria-hidden="true">
          ▾
        </span>
        <span className="sr-only"> — change timezone</span>
      </button>

      {open && (
        // A <span>, not a <div>: the picker sits inline inside a <p> (the
        // calendar's "All times PDT." line, the event page's When block), and
        // a <div> there is invalid HTML the browser silently repairs by
        // closing the paragraph early — which breaks hydration and the layout
        // with it. CSS gives it back its block behaviour.
        <span className="tzpick__menu" id={menuId} role="menu">
          <span className="tzpick__note">
            Times are the chapter's, in Pacific. Show them in:
          </span>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={choice === null}
            className="tzpick__opt"
            onClick={() => pick(null)}
          >
            <span className="tzpick__optname">Chapter time</span>
            <span className="tzpick__optzone">
              {zoneLabel(CHAPTER_TIMEZONE)} · {zoneAbbr(at, CHAPTER_TIMEZONE)}
            </span>
          </button>

          {/* Pointless when the reader is already in Pacific — it would offer
              them the option they're on, labelled differently. */}
          {!deviceIsChapter && (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={choice === device}
              className="tzpick__opt"
              onClick={() => pick(device)}
            >
              <span className="tzpick__optname">Your time</span>
              <span className="tzpick__optzone">
                {zoneLabel(device)} · {zoneAbbr(at, device)}
              </span>
            </button>
          )}

          <label className="tzpick__search">
            <span className="sr-only">Search all timezones</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Any other timezone…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          {needle && matches.length === 0 && (
            <span className="tzpick__note">No timezone matches that.</span>
          )}

          {matches.map((z) => (
            <button
              key={z}
              type="button"
              role="menuitemradio"
              aria-checked={choice === z}
              className="tzpick__opt"
              onClick={() => pick(z)}
            >
              <span className="tzpick__optname">{zoneLabel(z)}</span>
              <span className="tzpick__optzone">
                {z} · {zoneAbbr(at, z)}
              </span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
