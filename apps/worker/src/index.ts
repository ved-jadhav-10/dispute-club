import { z } from "zod";
import { DebateSessionDO } from "./do/debate-session";
import { FIGURES, getFigureOrThrow } from "./lib/figures";
import type { Env, SessionConfig } from "./types";

export { DebateSessionDO };

const createSessionSchema = z.object({
  topic: z.string().min(3),
  leftFigureId: z.string().min(2),
  rightFigureId: z.string().min(2),
  maxTurns: z.number().int().min(2).max(12).optional()
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function sessionStub(env: Env, sessionId: string): DurableObjectStub {
  const id = env.DEBATE_SESSION.idFromName(sessionId);
  return env.DEBATE_SESSION.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/figures") {
      return json({ figures: FIGURES.map(({ personaPrompt, ...publicFigure }) => publicFigure) });
    }

    if (request.method === "POST" && url.pathname === "/api/session") {
      const parsed = createSessionSchema.safeParse(await request.json());
      if (!parsed.success) {
        return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
      }

      const body = parsed.data;
      getFigureOrThrow(body.leftFigureId);
      getFigureOrThrow(body.rightFigureId);

      const sessionId = crypto.randomUUID();
      const config: SessionConfig = {
        sessionId,
        topic: body.topic,
        leftFigureId: body.leftFigureId,
        rightFigureId: body.rightFigureId,
        maxTurns: body.maxTurns ?? Number(env.DEFAULT_MAX_TURNS || 6),
        createdAt: new Date().toISOString()
      };

      const stub = sessionStub(env, sessionId);
      await stub.fetch("https://session/init", {
        method: "POST",
        body: JSON.stringify(config)
      });

      return json({
        sessionId,
        watchUrl: `/debate/${sessionId}`,
        streamUrl: `/api/session/${sessionId}/stream`
      });
    }

    const match = url.pathname.match(/^\/api\/session\/([^/]+)(?:\/(start|pause|resume|stream))?$/);
    if (match) {
      const [, sessionId, action] = match;
      const stub = sessionStub(env, sessionId);

      if (!action && request.method === "GET") {
        return stub.fetch("https://session/state");
      }

      if (action === "stream" && request.method === "GET") {
        return stub.fetch("https://session/stream");
      }

      if ((action === "start" || action === "pause" || action === "resume") && request.method === "POST") {
        return stub.fetch(`https://session/${action}`, { method: "POST" });
      }
    }

    return json(
      {
        name: "Dispute Club Worker API",
        routes: [
          "GET /api/figures",
          "POST /api/session",
          "GET /api/session/:id",
          "POST /api/session/:id/start",
          "POST /api/session/:id/pause",
          "POST /api/session/:id/resume",
          "GET /api/session/:id/stream"
        ]
      },
      200
    );
  }
};
