# Event Portal

Multi-event quiz sites. Guests play at `/e/<slug>`. You manage events at `/admin`.

## Local

```bash
npm install
# Windows PowerShell:
$env:ADMIN_TOKEN = 'change-me-min-8-chars'
npm run seed
npm start
```

- Admin: http://localhost:3000/admin (paste the same `ADMIN_TOKEN`)
- Guest quiz: http://localhost:3000/e/naomi40th

`npm run seed` is safe to re-run. It only inserts the sample Naomi event if that slug is missing.

## Docker / Unraid

Image: `ghcr.io/matda59/event-portal:latest` (built on every push to `main`).

Mount these volumes and nothing else — a bind of `/app` or all of `/app/public` hides image updates:

| Host path              | Container path        |
|------------------------|-----------------------|
| appdata SQLite folder  | `/app/data`           |
| photos                 | `/app/public/images`  |
| MP3s                   | `/app/public/music`   |

Set `ADMIN_TOKEN` (minimum 8 characters) as a container variable.

## Guest flags

In `/admin` → Event:

- **draft** — hidden from guests (same 404 as a missing slug)
- **active** — live at `/e/<slug>`
- **ended** — guests see “this event has ended”
- **Enable quiz** off — e-card and welcome only
- **Enable leaderboard** off — personal score still shows; Hall of Fame is hidden and nothing is posted
