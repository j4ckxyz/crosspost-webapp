# Crosspost Web App

Clean self-hosted web client for `crosspost-backend-gateway`.

- Vite + React + TypeScript + shadcn-style UI
- Auto light/dark mode (`system` by default)
- Keyboard-first workflow (`Cmd/Ctrl+K`, `Cmd/Ctrl+Enter`, `?`)
- Local helper process that stores credentials in your OS keychain (no password prompt each publish)

## Architecture

This project runs as two pieces:

1. **Frontend** (`src/*`) for compose, scheduling, and queue management
2. **Local helper** (`helper/server.mjs`) that:
   - stores secrets in OS keychain via `keytar`
   - proxies requests to the backend gateway
   - injects credentials server-side

Flow:

```text
Browser UI -> /api/* (local helper) -> /v1/* (crosspost-backend-gateway) -> X/Bluesky/Mastodon
```

## Security Model (Important)

Safe-by-default behavior:

- Helper binds to `127.0.0.1` by default
- Secrets are **not** stored in localStorage
- Secrets are stored in OS keychain:
  - Windows Credential Manager
  - macOS Keychain
  - Linux Secret Service
- Frontend never reads back raw secrets after save

If you expose this app beyond localhost, protect access with TLS + authentication at your reverse proxy.

## Prerequisites

- Node.js 20+
- npm 10+
- A running `crosspost-backend-gateway`

## Version Compatibility (Pinned)

To avoid Fastify plugin mismatch issues, this project pins a known-good pair:

- `fastify@5.7.4`
- `@fastify/multipart@9.4.0`

`package.json` also includes `overrides` to force this pair if transitive resolution drifts.

Tested startup:

- Node `20.x`
- Node `22.x`

## Quick Start (Local Machine)

### 1) Run backend gateway

Example `.env` for gateway:

```dotenv
API_KEYS=replace-with-long-random-key
SCHEDULER_ENCRYPTION_KEY=replace-with-32-byte-random-secret
HOST=127.0.0.1
PORT=38081
```

Generate strong random values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start gateway:

```bash
npm install
npm run build
npm start
```

### 2) Run this web app

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

### 3) First-time setup in UI

1. Go to **Settings**
2. Set gateway base URL (default: `http://127.0.0.1:38081`)
3. Save gateway API key
4. Save platform credentials you want to use
5. Go to **Compose** and publish

## Production Mode

Build and run helper + built frontend from one process:

```bash
npm run build
npm run start
```

Serves app on `http://127.0.0.1:43123` by default.

Optional env vars:

```bash
HELPER_HOST=127.0.0.1
HELPER_PORT=43123
```

## Self-Hosting Patterns

### Option A: Local/LAN only

- Keep helper on `127.0.0.1` if you only access locally
- If exposing on LAN, use firewall allowlist for trusted subnets only

### Option B: Tailscale (recommended for personal self-hosting)

- Keep helper bound locally and proxy through a Tailscale-accessible reverse proxy
- Restrict access via Tailscale ACLs

### Option C: Public internet (hardened)

Use reverse proxy + HTTPS + access control. Do **not** expose helper port directly.

Example Caddy config with Basic Auth:

```caddy
crosspost.example.com {
  encode zstd gzip

  basicauth {
    admin $2a$14$replace_with_caddy_hash
  }

  reverse_proxy 127.0.0.1:43123

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
    X-Content-Type-Options "nosniff"
  }
}
```

Create the Basic Auth hash:

```bash
caddy hash-password --plaintext "your-strong-password"
```

## Systemd Example (Helper App)

```ini
[Unit]
Description=Crosspost Web App Helper
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/crosspost-webapp
Environment=NODE_ENV=production
Environment=HELPER_HOST=127.0.0.1
Environment=HELPER_PORT=43123
ExecStart=/usr/bin/node helper/server.mjs
Restart=always
RestartSec=5
User=crosspost
Group=crosspost
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## Useful Health Checks

Helper health:

```bash
curl http://127.0.0.1:43123/api/health
```

Gateway status page:

```bash
curl http://127.0.0.1:38081/status
```

Gateway limits via helper:

```bash
curl http://127.0.0.1:43123/api/limits
```

## Keyboard Shortcuts

- `Cmd/Ctrl + K`: command palette
- `Cmd/Ctrl + 1/2/3`: switch tabs
- `Cmd/Ctrl + Enter`: publish now
- `Cmd/Ctrl + Shift + Enter`: schedule
- `Cmd/Ctrl + S`: save draft
- `?`: shortcut help dialog

## Validation Coverage

Before sending, client mirrors gateway rules:

- X segment char limit
- Bluesky segment char limit
- Bluesky media rule: `1 video` OR `1-4 images` per segment
- Mastodon limits from `/v1/limits` when available

## Privacy and Personal Data Notes

- This repository does not include your saved credentials
- Runtime secrets stay in local OS keychain and are machine/user-specific
- Local helper config (`~/.crosspost-webapp/config.json`) contains gateway URL only

## Troubleshooting

### "Helper connection failed"

- Ensure helper is running (`npm run dev` or `npm run start`)
- Check `http://127.0.0.1:43123/api/health`

### `TypeError: Cannot read properties of undefined (reading 'entries')`

This indicates a Fastify + multipart incompatibility in your installed tree.

Use these recovery steps:

macOS/Linux:

```bash
rm -rf node_modules package-lock.json
npm install
npm ls fastify @fastify/multipart
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
npm ls fastify @fastify/multipart
```

Expected output includes:

```text
fastify@5.7.4
@fastify/multipart@9.4.0
```

Then re-test helper startup:

```bash
npm run start
```

### "Missing credentials"

- Open **Settings** and save required credentials for selected targets

### Limits fail to load

- Confirm gateway URL and API key are correct
- Verify gateway responds to `/v1/limits` with your bearer key

## Developer Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Key Files

- `helper/server.mjs`: keychain-backed helper + gateway proxy
- `src/App.tsx`: app shell, command palette, global shortcuts
- `src/components/compose-pane.tsx`: compose + validation + publish
- `src/components/queue-pane.tsx`: scheduled jobs list/cancel
- `src/components/settings-pane.tsx`: gateway + credentials + theme
