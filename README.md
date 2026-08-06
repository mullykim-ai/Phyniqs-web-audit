# Phyniqs Web Auditor

Phyniqs is a browser-rendered typography intelligence platform. The repository contains the hosted dashboard and API gateway, the Railway Playwright scanner, and native desktop/mobile clients that use the same scan data.

## Applications

- `app/`: existing Next-compatible dashboard and API gateway.
- `services/scanner/`: Dockerized Playwright API and background worker for Railway.
- `packages/core/`: shared TypeScript contracts and authenticated API client.
- `apps/desktop/`: Tauri 2 application for macOS and Windows.
- `apps/mobile/`: Expo/React Native application for iOS and Android.

The native applications never connect directly to PostgreSQL, Redis, object storage, or privileged scanner routes. They use the separately authenticated `/api/native` surface on Railway's `scanner-api`; the internal service token is never exposed.

## Native API setup

Generate a strong token and set the same value only in the hosted dashboard environment and in each authorized native installation:

```bash
openssl rand -hex 32
```

Configure the resulting value as `PHYNIQS_NATIVE_API_TOKEN` on Railway's `scanner-api` service. Users enter it once in the desktop or mobile app. Mobile stores it in the operating system secure credential store. Rotate the token immediately if a device is lost.

Native endpoints:

- `POST /api/native/scans` — enqueue a real Playwright scan.
- `GET /api/native/scans/:id` — retrieve progress and completed typography evidence.
- `POST /api/native/report` — generate the detailed PDF report with screenshots.

## Desktop development

Prerequisites are Node.js 22, Rust stable, and the platform-specific Tauri prerequisites.

```bash
npm install --prefix apps/desktop
npm --prefix apps/desktop run tauri -- dev
```

Use `npm --prefix apps/desktop run build` to validate the React application. Enable Tauri bundling and add signing identities when producing store or enterprise installers.

## Mobile development

Install Expo Go on a test phone, then run:

```bash
npm install --prefix apps/mobile
npm --prefix apps/mobile run start
```

Use an Expo development build for production testing. The bundle identifiers are `online.phyniqscrawler.auditor` on iOS and Android. App Store and Play Store signing credentials are intentionally supplied through the respective secure build systems, never committed to this repository.

## Verify all clients

```bash
npm run build
npm run native:check
npm test --prefix services/scanner
```

The web dashboard runs on [vinext](https://github.com/cloudflare/vinext).

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
