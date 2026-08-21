import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "@fontsource-variable/archivo/index.css";
import "@fontsource-variable/roboto-slab/index.css";
import "./styles/global.css";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { TimeZoneProvider } from "~/lib/timezone";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/favicon-192.png"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Meta />
        <Links />
        {/* Add `?light` to any page to force the light palette regardless of
            the OS setting. Ships everywhere, not just dev: reviewing a branch
            preview from a dark-mode machine is exactly when you need it, and
            a design you can only see one of two ways is half a preview. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if(new URLSearchParams(location.search).has('light'))document.documentElement.dataset.forceLight=''`,
          }}
        />
        {/* Add `?edit` to any page to jump straight to editing it. The editor
            lives on a sibling Worker (`edit.<subdomain>`), is behind Cloudflare
            Access, and resolves ?url= back to the content file. Runs before
            paint so it never flashes the page first. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `if(new URLSearchParams(location.search).has('edit')){` +
              `var h=location.host.split('.');h[0]='edit';` +
              `location.replace('https://'+h.join('.')+'/?url='+encodeURIComponent(location.pathname));}`,
          }}
        />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // Wraps everything so one localStorage read drives every time on the page,
  // and picking a zone re-renders all of them at once.
  return (
    <TimeZoneProvider>
      <Outlet />
    </TimeZoneProvider>
  );
}
