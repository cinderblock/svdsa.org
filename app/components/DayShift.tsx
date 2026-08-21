/**
 * "+1" next to a time whose date moved when the reader changed timezone.
 *
 * The calendar groups by the CHAPTER's calendar day — that is what the date
 * headings and grid cells mean. So for a reader in a zone far enough ahead, a
 * late meeting shows an early-morning time filed under the previous day. The
 * marker is the difference between that being confusing and it being obvious.
 */

import { dayShift } from "~/lib/format";

export function DayShift({ at, zone }: { at: string; zone: string }) {
  const shift = dayShift(at, zone);
  if (shift === 0) return null;
  const sign = shift > 0 ? "+" : "−";
  return (
    <span className="dayshift">
      <span aria-hidden="true">
        {sign}
        {Math.abs(shift)}
      </span>
      <span className="sr-only">
        {" "}
        ({shift > 0 ? "the next day" : "the previous day"} where you are)
      </span>
    </span>
  );
}
