# Dispute Club

Dispute Club is an AI debate app where two historical figures argue a modern topic in character, turn by turn.

This repo is a monorepo built for the Cloudflare + ElevenLabs challenge.

## Project Structure
- `apps/worker`: Cloudflare Worker API + Durable Object session engine + Workers AI/ElevenLabs integration
- `apps/web`: Next.js frontend (setup page + live debate page)

## Current MVP Features
- Create a debate session with topic + two figures.
- Run a fixed 6-turn alternating debate.
- Persist session state in Durable Objects.
- Stream updates to frontend using SSE.
- Generate text with:
1. Workers AI (preferred, via Cloudflare REST credentials)
2. fallback character generator (if Workers AI credentials are missing)
- Generate voice audio with ElevenLabs when API key + voice IDs are configured.

## Included Historical Figures
- Socrates
- Napoleon
- Newton
- Gandhi
- Shakespeare
- Confucius

## Local Setup
1. Install dependencies from repo root.
   - `npm install`
2. Create worker env file at `apps/worker/.dev.vars`.
3. Create web env file at `apps/web/.env.local`.
4. Start both apps.
   - `npm run dev`
5. Open `http://localhost:3000`.

## Environment Variables

### Worker (`apps/worker/.dev.vars`)
Required for real LLM output:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Required for voice output:
- `ELEVENLABS_API_KEY`

Optional worker settings:
- `ELEVENLABS_BASE_URL` (default: `https://api.elevenlabs.io`)
- `ELEVENLABS_MODEL_ID` (default: `eleven_multilingual_v2`)
- `WORKERS_AI_MODEL` (default in `wrangler.toml`)
- `DEFAULT_MAX_TURNS` (default in `wrangler.toml`)
- `MAX_TURN_CHARS` (default in `wrangler.toml`)

Voice mapping variables (one per figure):
- `VOICE_SOCRATES`
- `VOICE_NAPOLEON`
- `VOICE_NEWTON`
- `VOICE_GANDHI`
- `VOICE_SHAKESPEARE`
- `VOICE_CONFUCIUS`

### Web (`apps/web/.env.local`)
- `NEXT_PUBLIC_WORKER_URL=http://127.0.0.1:8787`

## API Endpoints
- `GET /api/figures`
- `POST /api/session`
- `GET /api/session/:id`
- `POST /api/session/:id/start`
- `POST /api/session/:id/pause`
- `POST /api/session/:id/resume`
- `GET /api/session/:id/stream`

## Build and Deploy

### Worker
1. Login to Cloudflare:
   - `npx wrangler login`
2. Deploy:
   - `npm run deploy:worker`

### Web (Next.js)
Recommended current path is Cloudflare Pages dashboard:
1. Create a Pages project from this repo.
2. Set root directory to `apps/web`.
3. Build command: `npm run build`.
4. Output directory: `.next`.
5. Set `NEXT_PUBLIC_WORKER_URL` to deployed Worker URL.

## Troubleshooting
- If debate text looks repetitive/template-like, verify `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set in `apps/worker/.dev.vars` and restart worker.
- If browser shows `Failed to fetch`, confirm worker is running on `127.0.0.1:8787` and web uses matching `NEXT_PUBLIC_WORKER_URL`.
- If audio is missing, verify `ELEVENLABS_API_KEY` and all `VOICE_*` IDs are valid.
