# Dispute Club MVP Implementation Plan

## Objective
Deliver a 48-hour MVP that proves the core wow moment:
- user selects two figures + topic,
- debate starts instantly,
- text/audio stream in real time,
- state persists and can be resumed/shared.

## MVP Scope (Strict)
- 6 historical figures total.
- 1 debate mode: alternating turn-based (fixed 6 turns default).
- 1 transport for MVP: SSE (text events + audio URL events).
- Audio generation: ElevenLabs TTS per turn (non-blocking pipeline).
- Persistence: Durable Object per session with transcript + runtime state.
- Frontend: single-page app with setup form + live debate view + share URL.

Out of scope for MVP v1:
- authentication,
- moderation dashboard,
- multiplayer control,
- vector memory/RAG,
- advanced replay editing.

## System Topology
- Cloudflare Worker (HTTP API + orchestration)
- Durable Object: DebateSessionDO (session memory + turn engine state)
- Workers AI (text generation)
- ElevenLabs API (voice generation)
- Cloudflare Pages (frontend)

## Data Model

### SessionConfig
```json
{
  "sessionId": "uuid",
  "topic": "Should AI be regulated?",
  "leftFigureId": "tesla",
  "rightFigureId": "hoover",
  "maxTurns": 6,
  "createdAt": "ISO-8601"
}
```

### SessionState (stored in Durable Object storage)
```json
{
  "sessionId": "uuid",
  "status": "idle|running|paused|completed|error",
  "turnIndex": 0,
  "currentSpeaker": "left|right",
  "heat": 0.25,
  "persuasion": {
    "left": 0.0,
    "right": 0.0
  },
  "transcript": [
    {
      "turn": 1,
      "speaker": "tesla",
      "text": "...",
      "audioUrl": "https://...",
      "durationMs": 6200,
      "createdAt": "ISO-8601"
    }
  ],
  "lastError": null
}
```

### FigureProfile (static config in Worker)
```json
{
  "id": "tesla",
  "name": "Nikola Tesla",
  "era": "1856-1943",
  "personaPrompt": "...",
  "styleRules": ["respond directly", "3-4 sentences", "stay in character"],
  "elevenVoiceId": "voice_xxx"
}
```

## API Contract (Worker)

### 1) POST /api/session
Create a debate session.

Request:
```json
{
  "topic": "Should AI be regulated?",
  "leftFigureId": "tesla",
  "rightFigureId": "hoover",
  "maxTurns": 6
}
```

Response:
```json
{
  "sessionId": "uuid",
  "watchUrl": "/debate/uuid",
  "streamUrl": "/api/session/uuid/stream"
}
```

### 2) POST /api/session/:id/start
Starts generation loop in DO (idempotent).

Response:
```json
{ "ok": true, "status": "running" }
```

### 3) GET /api/session/:id
Returns current state snapshot.

### 4) GET /api/session/:id/stream
SSE endpoint from Worker proxying DO event stream.

SSE events:
- `session.started`
- `turn.thinking`
- `turn.generated`
- `turn.audio.ready`
- `turn.play`
- `session.completed`
- `session.error`

### 5) POST /api/session/:id/pause
Pause generation loop.

### 6) POST /api/session/:id/resume
Resume loop.

## Durable Object Design
Class: `DebateSessionDO`

Responsibilities:
- Own session state and storage.
- Enforce lock for single active generation loop.
- Alternate speakers and track turn count.
- Build prompt context from transcript.
- Call Workers AI for next turn text.
- Trigger ElevenLabs generation and attach audio URL.
- Broadcast SSE events to connected clients.
- Persist every state mutation atomically.

Key internal methods:
- `initialize(config)`
- `start()`
- `generateNextTurn()`
- `composePrompt(speaker, transcript, topic, heat, persuasion)`
- `synthesizeAudio(text, voiceId)`
- `broadcast(eventType, payload)`
- `pause()` / `resume()`
- `snapshot()`

Concurrency guard:
- boolean `isRunningLoop`
- early return if already active.

## Prompting Strategy
System prompt template per figure:
- identity + worldview,
- rhetorical style,
- constraints (3-4 sentences, direct rebuttal),
- safety constraints (no slurs, no explicit harmful instructions).

Turn prompt includes:
- topic,
- previous 2-4 turns,
- current heat level,
- persuasion drift hint.

Output format (strict JSON suggested):
```json
{
  "argument": "text",
  "tone": "calm|sharp|heated",
  "heatDelta": 0.08,
  "persuasionDelta": -0.03
}
```

## ElevenLabs Integration
- Use one configured voice per figure.
- Synthesize each generated turn immediately.
- If streaming synthesis is hard in v1, generate file URL first and play when ready.
- Retry policy: 2 attempts with exponential backoff.
- On failure, emit `turn.audio.ready` with `audioUrl: null`; UI falls back to text-only.

## Frontend App Flow

### Route: / (setup)
- Topic input
- Figure A/B selectors
- Start button

### Route: /debate/:id (live)
- Header: topic + share button
- Left/right speaker cards
- Live transcript timeline
- Current turn status indicator
- Heat meter
- Audio player queue

Client logic:
1. Fetch snapshot via `GET /api/session/:id`.
2. Open `EventSource` to stream endpoint.
3. Render each turn as events arrive.
4. Auto-play audio when `turn.play` event comes.
5. If disconnected, reconnect and re-fetch snapshot.

## Project Structure
```
/apps/worker
  /src/index.ts
  /src/do/debate-session.ts
  /src/lib/workers-ai.ts
  /src/lib/elevenlabs.ts
  /src/lib/figures.ts
  /src/types.ts
  wrangler.toml
/apps/web
  /src/main.tsx
  /src/pages/SetupPage.tsx
  /src/pages/DebatePage.tsx
  /src/components/Transcript.tsx
  /src/components/HeatMeter.tsx
  /src/api/client.ts
```

## Env Vars
Worker:
- `WORKERS_AI_MODEL`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_BASE_URL`
- `ELEVENLABS_MODEL_ID`

Optional:
- `MAX_TURN_CHARS`
- `DEFAULT_MAX_TURNS`

## Failure Modes and Handling
- AI timeout: emit `turn.thinking` -> retry once -> emit `session.error` if repeated.
- TTS timeout: keep text turn, mark audio null.
- SSE disconnect: client auto-reconnect + state refresh.
- Duplicate start requests: idempotent `start` with loop guard.

## Implementation Sequence

Phase 1: Worker + DO skeleton
1. Scaffold Worker with DO binding.
2. Implement session create/get/start endpoints.
3. Implement DO storage + snapshot.

Phase 2: Turn generation
1. Add figure profiles.
2. Integrate Workers AI for one turn generation.
3. Add turn alternation + completion condition.

Phase 3: TTS + stream events
1. Add ElevenLabs wrapper.
2. Emit structured events through SSE.
3. Add text-first fallback.

Phase 4: Frontend live UI
1. Setup page and debate page.
2. EventSource event reducers.
3. Transcript + speaker state + heat meter.

Phase 5: Polish for demo
1. Seed 2 strong debate presets for quick demo.
2. Improve loading/thinking visuals.
3. Capture/share URL and basic replay from transcript.

## Acceptance Criteria (MVP)
- Can create session and receive unique URL.
- Starting a session triggers at least 6 alternating turns.
- Each turn appears in live transcript within 5-10s average.
- At least 80% turns produce playable audio.
- Refreshing debate page restores state from Durable Object.
- Demo video can show end-to-end flow in under 60 seconds.

## Questions for You (Need Decisions)
1. Should we build Worker + web in a monorepo now, or start Worker-only first and add UI after APIs stabilize?
2. Do you want SSE for guaranteed simpler MVP, or WebSocket for bi-directional control from the start?
3. Which 6 launch figures should be in v1?
4. Should debates be exactly 6 turns or dynamically stop when confidence/heat threshold is reached?
5. Do you prefer React + Vite on Cloudflare Pages, or plain HTML/JS first for speed?
