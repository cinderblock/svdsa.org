import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { EmbedFrame } from "~/components/EmbedFrame";
import { EXTERNAL, SITE } from "~/lib/site";

export const meta: MetaFunction = () => [
  { title: `Donate · ${SITE.name}` },
  {
    name: "description",
    content:
      "Support Silicon Valley DSA. Your contribution funds local organizing, mutual aid, and events.",
  },
];

export default function Donate() {
  return (
    <main id="main">
      <div className="container page-head">
        <h1>Fund the fight</h1>
        <p className="lead muted">
          We're funded by working people, not corporations. Your contribution
          pays for organizing, mutual aid, printing, and events — 100% of it
          stays local.
        </p>
      </div>

      <div className="container" style={{ paddingBottom: "3rem" }}>
        <EmbedFrame
          src={EXTERNAL.donate}
          title="Donate to Silicon Valley DSA"
          height={760}
        />
        <p className="muted" style={{ marginTop: "1rem" }}>
          Prefer to become a member? <Link to="/join/">Join the chapter →</Link>
        </p>
      </div>
    </main>
  );
}
