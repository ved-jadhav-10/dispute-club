# Dispute Club

Monorepo MVP scaffold for the ElevenLabs x Cloudflare challenge.

## Apps
- `apps/worker`: Cloudflare Worker + Durable Object debate engine (SSE)
- `apps/web`: Next.js frontend

## Quick Start
1. Install dependencies:
   - `npm install`
2. Run Worker + Web together:
   - `npm run dev`
4. Open the Next.js app URL and start a debate.

## Worker Env
Set these via Wrangler or `.dev.vars` in `apps/worker`:
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_BASE_URL` (optional, default `https://api.elevenlabs.io`)
- `ELEVENLABS_MODEL_ID` (optional, default `eleven_multilingual_v2`)
- Optional AI binding for Workers AI (`AI`) to replace fallback text generation.

## Web Env
Create `apps/web/.env.local` with:
- `NEXT_PUBLIC_WORKER_URL=http://127.0.0.1:8787`

## Current Figure Set
- Socrates
- Napoleon
- Newton
- Gandhi
- Shakespeare
- Confucius

## Deploy Commands
### Worker
1. Authenticate Wrangler:
   - `npx wrangler login`
2. Deploy worker:
   - `npm run deploy:worker`

### Next.js (Cloudflare Pages)
Use Cloudflare dashboard for the fastest path:
1. Create a Pages project from this repo.
2. Set Root directory to `apps/web`.
3. Build command: `npm run build`.
4. Build output directory: `.next`.
5. Add env var `NEXT_PUBLIC_WORKER_URL` pointing to deployed Worker URL.

If you want, I can add OpenNext + CLI deploy wiring next so Pages deployment is fully scriptable from terminal.
