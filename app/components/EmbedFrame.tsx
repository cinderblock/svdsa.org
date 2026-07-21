/**
 * Responsive iframe for third-party forms (Action Network, Zeffy, Google
 * Forms). A titled <iframe> keeps the site static while delegating the dynamic
 * form handling to the service the chapter already uses.
 */
export function EmbedFrame({
  src,
  title,
  height = 720,
}: {
  src: string;
  title: string;
  height?: number;
}) {
  return (
    <div className="embed-frame">
      <iframe
        src={src}
        title={title}
        height={height}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="embed-frame__fallback muted">
        Trouble seeing the form?{" "}
        <a href={src} target="_blank" rel="noreferrer">
          Open it in a new tab
        </a>
        .
      </p>
    </div>
  );
}
