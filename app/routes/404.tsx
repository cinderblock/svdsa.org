import type { MetaFunction } from "react-router";
import { Link } from "react-router";

export const meta: MetaFunction = () => {
  return [
    { title: "Page Not Found" },
    {
      name: "description",
      content: "The page you're looking for doesn't exist.",
    },
  ];
};

export default function NotFound() {
  return (
    <main className="container">
      <section className="hero">
        <h1>404</h1>
        <p className="tagline">Page Not Found</p>
        <p className="intro">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="back-link">
          Go back home
        </Link>
      </section>
    </main>
  );
}
