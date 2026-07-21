import { useEffect, useState } from "react";

/**
 * Current time for time-relative UI (what counts as "upcoming").
 *
 * Returns `null` on the server and on the first client render, so the
 * prerendered HTML and hydration agree (no mismatch); components treat `null`
 * as "show the build-time snapshot." After mount it's the real clock and
 * refreshes at the next local midnight and whenever the tab regains
 * focus/visibility — so a page left open self-corrects as the date changes.
 */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();

    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      const d = new Date();
      const nextMidnight = new Date(d);
      nextMidnight.setHours(24, 0, 0, 0);
      timer = setTimeout(
        () => {
          update();
          scheduleMidnight();
        },
        nextMidnight.getTime() - d.getTime() + 1000,
      );
    };
    scheduleMidnight();

    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", update);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", update);
    };
  }, []);

  return now;
}
