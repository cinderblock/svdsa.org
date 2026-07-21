import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("calendar", "routes/calendar.tsx"),
  route("blog", "routes/blog.tsx"),
  route("event/*", "routes/event.tsx"),
  // Purpose-built pages that embed the chapter's external services; these
  // override the generic WP-page splat for their paths.
  route("join", "routes/join.tsx"),
  route("donate", "routes/donate.tsx"),
  route("contact", "routes/contact.tsx"),
  // Splat handles every migrated WordPress page and post (matched by pathname)
  // and renders a 404 for anything unknown.
  route("*", "routes/content.tsx"),
] satisfies RouteConfig;
