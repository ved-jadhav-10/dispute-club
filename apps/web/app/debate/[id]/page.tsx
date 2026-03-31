"use client";

import { useEffect, useMemo, useState } from "react";
import { getWorkerBaseUrl } from "../../../lib/api";

type Turn = {
  turn: number;
  speaker: string;
  side: "left" | "right";
  text: string;
  audioUrl: string | null;
  heat: number;
};

type SessionState = {
  sessionId: string;
  status: string;
  heat: number;
  transcript: Array<{
    turn: number;
    speaker: string;
    side: "left" | "right";
    text: string;
    audioUrl: string | null;
  }>;
  config: {
    topic: string;
  };
};

export default function DebatePage({ params }: { params: { id: string } }) {
  const workerBase = useMemo(() => getWorkerBaseUrl(), []);
  const [status, setStatus] = useState("loading");
  const [topic, setTopic] = useState("");
  const [heat, setHeat] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    async function bootstrap() {
      const stateResponse = await fetch(`${workerBase}/api/session/${params.id}`);
      if (!stateResponse.ok) {
        setStatus("error");
        return;
      }

      const state = (await stateResponse.json()) as SessionState;
      setTopic(state.config.topic);
      setStatus(state.status);
      setHeat(state.heat);
      setTurns(
        state.transcript.map((turn) => ({
          ...turn,
          heat: state.heat
        }))
      );

      await fetch(`${workerBase}/api/session/${params.id}/start`, { method: "POST" });

      eventSource = new EventSource(`${workerBase}/api/session/${params.id}/stream`);

      eventSource.addEventListener("turn.play", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as Turn;
        setHeat(payload.heat);
        setTurns((prev) => {
          const exists = prev.some((item) => item.turn === payload.turn);
          return exists ? prev : [...prev, payload];
        });

        if (payload.audioUrl) {
          const audio = new Audio(payload.audioUrl);
          void audio.play();
        }
      });

      eventSource.addEventListener("session.completed", () => {
        setStatus("completed");
      });

      eventSource.addEventListener("session.error", () => {
        setStatus("error");
      });
    }

    void bootstrap();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [params.id, workerBase]);

  return (
    <main className="container" style={{ display: "grid", gap: 16 }}>
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <h1 style={{ marginBottom: 0 }}>Dispute Club Live</h1>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>Topic: {topic || "Loading..."}</p>
        <p style={{ margin: 0 }}>
          Status: <strong>{status}</strong>
        </p>
        <p style={{ margin: 0 }}>
          Heat Meter: <strong>{Math.round(heat * 100)}%</strong>
        </p>
      </section>

      <section className="panel" style={{ display: "grid", gap: 12 }}>
        {turns.length === 0 ? <p>Waiting for first turn...</p> : null}
        {turns.map((turn) => (
          <article
            key={turn.turn}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: 14,
              background: turn.side === "left" ? "rgba(15,109,109,0.08)" : "rgba(139,47,47,0.08)"
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              Turn {turn.turn} - {turn.speaker}
            </p>
            <p style={{ marginBottom: 0 }}>{turn.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
