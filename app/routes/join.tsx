import type { MetaFunction } from "react-router";
import { EmbedFrame } from "~/components/EmbedFrame";
import { EXTERNAL, SITE } from "~/lib/site";

export const meta: MetaFunction = () => [
  { title: `Join · ${SITE.name}` },
  {
    name: "description",
    content:
      "Join Silicon Valley DSA — become a national DSA member, pay local dues, and sign up for our newsletter.",
  },
];

export default function Join() {
  return (
    <main id="main">
      <div className="container page-head">
        <h1>Join the movement</h1>
        <p className="lead muted">
          Membership is the backbone of the chapter. There are two steps —
          become a national DSA member, then chip in local dues so we can
          organize here in the South Bay.
        </p>
      </div>

      <div className="container stack" style={{ paddingBottom: "3rem" }}>
        <section>
          <h2>1. Become a DSA member</h2>
          <p>
            National membership connects you to 100,000+ socialists and
            automatically plugs you into our chapter.
          </p>
          <p className="hero__actions">
            <a className="btn btn-primary" href={EXTERNAL.joinNational}>
              Join DSA nationally
            </a>
            <a className="btn btn-outline" href={EXTERNAL.duesWaiver}>
              Request a dues waiver
            </a>
          </p>
          <p className="muted">
            Cost is a barrier for no one — if national dues are out of reach,
            use the waiver above and still join us.
          </p>
        </section>

        <section>
          <h2>2. Pay local chapter dues</h2>
          <p>
            Local dues fund our organizing directly — printing, events, mutual
            aid, and more. Any amount helps.
          </p>
          <EmbedFrame
            src={EXTERNAL.localDues}
            title="Silicon Valley DSA local dues"
            height={760}
          />
        </section>

        <section>
          <h2>Stay in the loop</h2>
          <p>Not ready to join yet? Sign up for our newsletter.</p>
          <EmbedFrame
            src={EXTERNAL.newsletter}
            title="Silicon Valley DSA newsletter signup"
            height={520}
          />
        </section>
      </div>
    </main>
  );
}
