# Repository Guidelines

## Project Overview

Homeschool Hub is a small vanilla Node.js app for homeschool community classes. It serves static pages from the repository root and handles API routes in `server.js`. The app can store data either in local JSON files under `data/` or in Neon Postgres when `DATABASE_URL` is set.

## Key Files

- `server.js` contains the HTTP server, static file serving, API routing, session handling, JSON persistence, and Neon persistence.
- `api/[...slug].js` is the Vercel serverless adapter. Keep it thin and route API behavior through `server.js`.
- `index.html`, `script.js`, and `styles.css` power the public class browsing and registration experience.
- `dashboard.html` and `dashboard.js` power the signed-in organizer/user dashboard.
- `data/*.json` are local development data files and fallback storage when Neon is not configured.
- `scripts/migrate-json-to-neon.js` copies the local JSON data into Neon.

## Commands

- Install dependencies: `npm install`
- Run locally: `npm start`
- Open the app: `http://localhost:3000`
- Migrate JSON data to Neon: `DATABASE_URL=<connection-string> npm run migrate:neon`

There is currently no configured automated test suite. After changes, run `npm start` and manually verify the affected flow in the browser. For API changes, exercise the relevant endpoint with the local server running.

## Runtime And Data Notes

- `PORT` controls the local server port and defaults to `3000`.
- `DATABASE_URL` enables Neon Postgres. Without it, the app reads and writes `data/users.json`, `data/classes.json`, and `data/support_requests.json`.
- On Vercel, JSON fallback data is written under `/tmp/homeschool-hub-data`, so it is ephemeral. Persistent production data should use Neon.
- Do not commit `.env`, `.vercel`, or `node_modules`; they are ignored intentionally.
- Treat `data/*.json` as development fixtures. Avoid destructive edits unless the task explicitly calls for fixture changes.

## Code Style

- This repo uses CommonJS (`require`, `module.exports`) and plain browser JavaScript. Keep new code in that style unless a larger migration is requested.
- Prefer small helper functions inside `server.js` over introducing a framework for narrow route changes.
- Keep API responses JSON-shaped and use the existing `jsonResponse` helper.
- Preserve the current static asset approach: root-level HTML/CSS/JS files served by `serveStatic`.
- Keep comments sparse and only add them when they clarify non-obvious behavior.

## API And Persistence Guidelines

- Add new API routes in `handleApi(req, res)` and return `true` after a route handles the request.
- Use `requireSession` for authenticated endpoints and `getSessionUser` when authentication is optional.
- When adding persisted fields, update both JSON normalization paths and Neon insert/select logic so local and production modes behave the same.
- Keep `ensureDatabase()` idempotent. Schema changes should use `CREATE TABLE IF NOT EXISTS` or compatible `ALTER TABLE` patterns.
- If a change affects classes, users, or support requests, verify both the local JSON path and the Neon path where practical.

## Deployment Notes

- Local execution uses `server.js` directly.
- Vercel execution enters through `api/[...slug].js`, which only delegates API requests to `handleApi`.
- Static assets remain at the repo root for local serving. If deployment behavior changes, update both local serving and Vercel routing assumptions together.

