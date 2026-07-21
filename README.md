# SSG Base

A boilerplate for static sites built with React Router 7, Vite, and TypeScript.

## Stack

- **React 19** + **React Router 7** — UI and routing
- **Vite** — build tool and dev server
- **TypeScript** — strict mode
- **Bun** — package manager and runtime
- **Playwright** — end-to-end testing
- **oxfmt** + **lefthook** — code formatting and pre-commit hooks
- **Cloudflare Pages** — deployment (via GitHub Actions)

## Getting Started

```sh
bun install
bun run dev
```

## Scripts

| Script              | Description                  |
| ------------------- | ---------------------------- |
| `bun run dev`       | Start dev server             |
| `bun run build`     | Build static site            |
| `bun run preview`   | Preview built site           |
| `bun run test`      | Run Playwright tests         |
| `bun run test:ui`   | Run tests with Playwright UI |
| `bun run fmt`       | Format all files with oxfmt  |
| `bun run fmt:check` | Check formatting             |
| `bun run typecheck` | Type check                   |

## Project Structure

```
app/
  root.tsx          — HTML shell and layout
  routes.ts         — Route definitions
  routes/
    home.tsx        — Index page
    404.tsx         — Not found page
  styles/
    global.css      — Global styles (light/dark mode)
public/
  favicon-light.svg — Favicon for light mode
  favicon-dark.svg  — Favicon for dark mode
tests/
  home.spec.ts      — E2E tests
```

## Deployment

The included GitHub Actions workflow deploys to Cloudflare Pages on push to `master` and runs CI on pull requests.

Set up these secrets/variables in your repo:

- **Secret**: `CLOUDFLARE_API_TOKEN`
- **Variable**: `CLOUDFLARE_ACCOUNT_ID`

Update the `--project-name` in `.github/workflows/deploy.yml` to match your Cloudflare Pages project.

## Adding Routes

1. Create a new file in `app/routes/`
2. Add it to `app/routes.ts`

All routes are automatically pre-rendered during build (configured via `prerender: true` in `react-router.config.ts`).

## Development Tips

- Append `?light` to any URL during development to force light mode (e.g., `http://localhost:5173/?light`).
- Favicons automatically adapt to the user's light/dark mode preference. Replace the SVGs in `public/` with your own.
