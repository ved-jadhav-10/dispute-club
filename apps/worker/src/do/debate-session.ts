import { getFigureOrThrow, resolveVoiceId } from "../lib/figures";
import { synthesizeSpeech } from "../lib/elevenlabs";
import { generateTurn } from "../lib/workers-ai";
import type { Env, SessionConfig, SessionState, Side } from "../types";

type EventSink = (eventName: string, payload: unknown) => void;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export class DebateSessionDO implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly clients = new Set<EventSink>();
  private isLoopRunning = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      const config = (await request.json()) as SessionConfig;
      const initialState: SessionState = {
        sessionId: config.sessionId,
        status: "idle",
        turnIndex: 0,
        currentSpeaker: "left",
        heat: 0.25,
        persuasion: { left: 0, right: 0 },
        transcript: [],
        lastError: null,
        config
      };
      await this.save(initialState);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/start") {
      const session = await this.load();
      if (!session) {
        return json({ error: "Session not initialized" }, 404);
      }

      if (session.status === "completed") {
        return json({ ok: true, status: "completed" });
      }

      session.status = "running";
      await this.save(session);
      this.broadcast("session.started", { sessionId: session.sessionId });
      this.runLoop().catch((error) => {
        void this.failWithError(String(error));
      });
      return json({ ok: true, status: session.status });
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const session = await this.load();
      return json(session ?? { error: "Session not found" }, session ? 200 : 404);
    }

    if (request.method === "POST" && url.pathname === "/pause") {
      const session = await this.load();
      if (!session) {
        return json({ error: "Session not found" }, 404);
      }
      session.status = "paused";
      await this.save(session);
      this.broadcast("session.paused", { sessionId: session.sessionId });
      return json({ ok: true, status: "paused" });
    }

    if (request.method === "POST" && url.pathname === "/resume") {
      const session = await this.load();
      if (!session) {
        return json({ error: "Session not found" }, 404);
      }
      session.status = "running";
      await this.save(session);
      this.broadcast("session.resumed", { sessionId: session.sessionId });
      this.runLoop().catch((error) => {
        void this.failWithError(String(error));
      });
      return json({ ok: true, status: "running" });
    }

    if (request.method === "GET" && url.pathname === "/stream") {
      return this.createEventStream();
    }

    return new Response("Not found", { status: 404 });
  }

  private async runLoop(): Promise<void> {
    if (this.isLoopRunning) {
      return;
    }

    this.isLoopRunning = true;

    try {
      while (true) {
        const session = await this.load();
        if (!session) {
          return;
        }

        if (session.status !== "running") {
          return;
        }

        if (session.turnIndex >= session.config.maxTurns) {
          session.status = "completed";
          await this.save(session);
          this.broadcast("session.completed", { sessionId: session.sessionId });
          return;
        }

        await this.generateAndAppendTurn(session);
      }
    } finally {
      this.isLoopRunning = false;
    }
  }

  private async generateAndAppendTurn(session: SessionState): Promise<void> {
    const side: Side = session.currentSpeaker;
    const speaker = getFigureOrThrow(side === "left" ? session.config.leftFigureId : session.config.rightFigureId);
    const opponent = getFigureOrThrow(side === "left" ? session.config.rightFigureId : session.config.leftFigureId);

    this.broadcast("turn.thinking", {
      turn: session.turnIndex + 1,
      speaker: speaker.id,
      side
    });

    const startedAt = Date.now();
    const generated = await generateTurn({
      env: this.env,
      topic: session.config.topic,
      heat: session.heat,
      transcript: session.transcript,
      speaker,
      opponent
    });

    this.broadcast("turn.generated", {
      turn: session.turnIndex + 1,
      speaker: speaker.id,
      text: generated.argument
    });

    const audioUrl = await synthesizeSpeech({
      env: this.env,
      text: generated.argument,
      voiceId: resolveVoiceId(this.env, speaker.id, speaker.elevenVoiceId)
    });

    const completedAt = Date.now();
    const nextTurn = session.turnIndex + 1;

    session.transcript.push({
      turn: nextTurn,
      speaker: speaker.id,
      side,
      text: generated.argument,
      audioUrl,
      durationMs: completedAt - startedAt,
      createdAt: new Date().toISOString()
    });

    session.turnIndex = nextTurn;
    session.currentSpeaker = side === "left" ? "right" : "left";
    session.heat = Math.min(1, Math.max(0, session.heat + generated.heatDelta));
    session.persuasion[side] = Math.min(1, Math.max(-1, session.persuasion[side] + generated.persuasionDelta));

    await this.save(session);

    this.broadcast("turn.audio.ready", {
      turn: nextTurn,
      speaker: speaker.id,
      audioUrl
    });

    this.broadcast("turn.play", {
      turn: nextTurn,
      speaker: speaker.id,
      side,
      text: generated.argument,
      audioUrl,
      heat: session.heat
    });
  }

  private createEventStream(): Response {
    const encoder = new TextEncoder();
    let send: EventSink | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        send = (eventName: string, payload: unknown) => {
          controller.enqueue(encoder.encode(`event: ${eventName}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        this.clients.add(send);
        send("stream.connected", { timestamp: new Date().toISOString() });
      },
      cancel: () => {
        if (send) {
          this.clients.delete(send);
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  }

  private broadcast(eventName: string, payload: unknown): void {
    for (const client of this.clients) {
      client(eventName, payload);
    }
  }

  private async failWithError(errorMessage: string): Promise<void> {
    const session = await this.load();
    if (!session) {
      return;
    }

    session.status = "error";
    session.lastError = errorMessage;
    await this.save(session);
    this.broadcast("session.error", { message: errorMessage });
  }

  private async load(): Promise<SessionState | null> {
    return (await this.state.storage.get<SessionState>("session")) ?? null;
  }

  private async save(session: SessionState): Promise<void> {
    await this.state.storage.put("session", session);
  }
}
