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

**Do not mount `/app/api` or all of `/app/public`.** Those overlays hide image updates, so Force Update still shows old JS. Only persist data and media:

```bash
docker run -d \
  --name='event-portal' \
  --net='bridge' \
  --pids-limit 2048 \
  -e TZ="Australia/Sydney" \
  -e ADMIN_TOKEN="pick-a-long-secret" \
  -p '4546:3000/tcp' \
  -v '/mnt/user/appdata/EventPortal/data':'/app/data':'rw' \
  -v '/mnt/user/appdata/EventPortal/public/images':'/app/public/images':'rw' \
  -v '/mnt/user/appdata/EventPortal/public/music':'/app/public/music':'rw' \
  'ghcr.io/matda59/event-portal:latest'
```

After a pull, confirm the new image with `http://<unraid>:4546/api/version` — `sha` should match the latest GitHub commit. Container logs also print `Build → <sha>`.

## Guest flags

In `/admin` → Event:

- **draft** — hidden from guests (same 404 as a missing slug)
- **active** — live at `/e/<slug>`
- **ended** — guests see “this event has ended”
- **Enable quiz** off — e-card and welcome only
- **Enable leaderboard** off — personal score still shows; Hall of Fame is hidden and nothing is posted
