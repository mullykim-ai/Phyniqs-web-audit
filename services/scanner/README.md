# Phyniqs Playwright Scanner

Railway service for asynchronous, browser-rendered typography audits.

## Railway topology

Create Railway PostgreSQL and Redis services, an S3-compatible object-storage bucket, and two services from this repository:

1. `scanner-api`: root directory `/`, Dockerfile `services/scanner/Dockerfile`, start command `node dist/server.js`, pre-deploy command `node dist/migrate.js`, health check `/health`, public networking enabled.
2. `scanner-worker`: the same Dockerfile, start command `node dist/worker.js`, no public networking.

Give both services the variables in `.env.example`. Railway's PostgreSQL and Redis reference variables should supply `DATABASE_URL` and `REDIS_URL`. Use one generated UUID for `PHYNIQS_PROJECT_ID` in both worker services and the frontend gateway. Use one randomly generated secret of at least 32 characters for `SERVICE_API_TOKEN`; the dashboard receives the same value as `RAILWAY_SCANNER_TOKEN`.

The migration creates the normalized schema and the initial project row. The worker launches real Playwright Chromium for every job, waits for DOM content, network idle, and `document.fonts.ready`, traverses visible rendered text (including open shadow roots), captures computed typography, FontFaceSet entries, font network traffic, full-page screenshots and diagnostics, and persists the results. JSON scan reports and screenshots are uploaded to object storage. The API streams progress from Redis over authenticated Server-Sent Events.

Do not expose PostgreSQL, Redis, or the worker publicly. Only the scanner API needs a Railway domain.
