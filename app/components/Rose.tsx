/** Minimal rose mark — the DSA emblem, simplified. */
export function Rose({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="brand__mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 21c-4.5-2.2-7-5.2-7-8.6C5 9.4 6.9 8 9 8c1.4 0 2.4.6 3 1.6C12.6 8.6 13.6 8 15 8c2.1 0 4 1.4 4 4.4 0 3.4-2.5 6.4-7 8.6Z"
        fill="var(--red)"
      />
      <path
        d="M12 9.6V21"
        stroke="var(--red-900)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M9 14c-1.6 0-2.8-.5-3.6-1.6M15 14c1.6 0 2.8-.5 3.6-1.6"
        stroke="var(--red-900)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
