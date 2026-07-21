import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  const title = "My Site";
  const description = "A static site built with React Router and Vite.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export default function Home() {
  return (
    <main className="container">
      <section className="hero">
        <h1>Hello, World</h1>
        <p className="subtitle">
          Edit <code>app/routes/home.tsx</code> to get started.
        </p>
      </section>
    </main>
  );
}
