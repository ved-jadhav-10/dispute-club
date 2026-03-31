"use client";

import Link from "next/link";
import { useRef } from "react";
import { useEffect, useMemo, useState } from "react";
import { getFigures, getWorkerBaseUrl, type Figure } from "../../../lib/api";

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
  persuasion: {
    left: number;
    right: number;
  };
  transcript: Array<{
    turn: number;
    speaker: string;
    side: "left" | "right";
    text: string;
    audioUrl: string | null;
  }>;
  config: {
    topic: string;
    leftFigureId: string;
    rightFigureId: string;
  };
};

type FigureLookup = Record<string, Figure>;

type Caption = {
  id: string;
  turn: number;
  speaker: string;
  text: string;
};

type CaptionsBySide = {
  left: Caption[];
  right: Caption[];
};

function splitCaption(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function imagePath(figureId: string): string {
  return `/assets/characters/${figureId}.png`;
}

export default function DebatePage({ params }: { params: { id: string } }) {
  const workerBase = useMemo(() => getWorkerBaseUrl(), []);
  const [status, setStatus] = useState("loading");
  const [topic, setTopic] = useState("");
  const [heat, setHeat] = useState(0);
  const [persuasion, setPersuasion] = useState({ left: 0, right: 0 });
  const [leftFigureId, setLeftFigureId] = useState("");
  const [rightFigureId, setRightFigureId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [figures, setFigures] = useState<FigureLookup>({});
  const [captions, setCaptions] = useState<CaptionsBySide>({ left: [], right: [] });
  const revealTimers = useRef<number[]>([]);
  const captionedTurns = useRef<Set<string>>(new Set());

  const leftFigure = leftFigureId ? figures[leftFigureId] : undefined;
  const rightFigure = rightFigureId ? figures[rightFigureId] : undefined;
  const speakerName = (speakerId: string) => figures[speakerId]?.name ?? speakerId;

  useEffect(() => {
    let eventSource: EventSource | null = null;

    function queueCaptions(turn: Turn) {
      const captionKey = `${turn.side}-${turn.turn}`;
      if (captionedTurns.current.has(captionKey)) {
        return;
      }
      captionedTurns.current.add(captionKey);

      const chunks = splitCaption(turn.text);
      chunks.forEach((chunk, index) => {
        const timer = window.setTimeout(() => {
          setCaptions((prev) => ({
            ...prev,
            [turn.side]: [
              ...prev[turn.side],
              {
                id: `${turn.turn}-${turn.side}-${index}`,
                turn: turn.turn,
                speaker: turn.speaker,
                text: chunk
              }
            ]
          }));
        }, index * 850);
        revealTimers.current.push(timer);
      });
    }

    async function bootstrap() {
      const figureList = await getFigures();
      setFigures(Object.fromEntries(figureList.map((figure) => [figure.id, figure])));

      const stateResponse = await fetch(`${workerBase}/api/session/${params.id}`);
      if (!stateResponse.ok) {
        setStatus("error");
        return;
      }

      const state = (await stateResponse.json()) as SessionState;
      setTopic(state.config.topic);
      setLeftFigureId(state.config.leftFigureId);
      setRightFigureId(state.config.rightFigureId);
      setStatus(state.status);
      setHeat(state.heat);
      setPersuasion(state.persuasion);
      setTurns(
        state.transcript.map((turn) => ({
          ...turn,
          heat: state.heat
        }))
      );

      const initialCaptions: CaptionsBySide = { left: [], right: [] };
      for (const turn of state.transcript) {
        captionedTurns.current.add(`${turn.side}-${turn.turn}`);
        const chunks = splitCaption(turn.text);
        for (const chunk of chunks) {
          initialCaptions[turn.side].push({
            id: `${turn.turn}-${turn.side}-${chunk.slice(0, 12)}`,
            turn: turn.turn,
            speaker: turn.speaker,
            text: chunk
          });
        }
      }
      setCaptions(initialCaptions);

      await fetch(`${workerBase}/api/session/${params.id}/start`, { method: "POST" });

      eventSource = new EventSource(`${workerBase}/api/session/${params.id}/stream`);

      eventSource.addEventListener("turn.play", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as Turn;
        setHeat(payload.heat);
        setTurns((prev) => {
          const exists = prev.some((item) => item.turn === payload.turn);
          return exists ? prev : [...prev, payload];
        });

        queueCaptions(payload);

        if (payload.audioUrl) {
          const audio = new Audio(payload.audioUrl);
          void audio.play();
        }
      });

      eventSource.addEventListener("session.completed", async () => {
        const refreshResponse = await fetch(`${workerBase}/api/session/${params.id}`);
        if (refreshResponse.ok) {
          const refreshed = (await refreshResponse.json()) as SessionState;
          setPersuasion(refreshed.persuasion);
          setHeat(refreshed.heat);
        }
        setStatus("completed");
      });

      eventSource.addEventListener("session.error", () => {
        setStatus("error");
      });
    }

    void bootstrap();

    return () => {
      for (const timer of revealTimers.current) {
        window.clearTimeout(timer);
      }
      revealTimers.current = [];
      captionedTurns.current.clear();

      if (eventSource) {
        eventSource.close();
      }
    };
  }, [params.id, workerBase]);

  const leftShare = Math.round(((persuasion.left + 1) / 2) * 100);
  const rightShare = 100 - leftShare;

  return (
    <main className="container" style={{ display: "grid", gap: 16 }}>
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <img src="/assets/logo.png" alt="Dispute Club" className="brand-logo" />
        <p style={{ margin: 0, textAlign: "center", color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live Debate</p>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>Topic: {topic || "Loading..."}</p>
        <p style={{ margin: 0 }}>
          Status: <strong>{status}</strong>
        </p>
        <p style={{ margin: 0 }}>
          Heat Meter: <strong>{Math.round(heat * 100)}%</strong>
        </p>
        <Link href="/" className="button-link" style={{ width: "fit-content" }}>
          Back to Home
        </Link>
        {status === "completed" ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Debate finished. Start a new one anytime from the button above.
          </p>
        ) : null}
      </section>

      <section className="debate-stage">
        <article className="panel character-panel">
          <p className="eyebrow" style={{ marginBottom: 8 }}>Left Side</p>
          <h2 style={{ marginTop: 0, marginBottom: 12 }}>{leftFigure?.name ?? "Left Figure"}</h2>
          <div className="character-image-wrap">
            {leftFigureId ? <img className="character-image" src={imagePath(leftFigureId)} alt={leftFigure?.name ?? leftFigureId} /> : null}
          </div>
          <div className="caption-list" aria-live="polite">
            {captions.left.length === 0 ? <p style={{ margin: 0, color: "var(--muted)" }}>Waiting for left-side caption...</p> : null}
            {captions.left.map((caption) => (
              <p key={caption.id} className="caption-chip">
                {caption.text}
              </p>
            ))}
          </div>
        </article>

        <article className="panel character-panel">
          <p className="eyebrow" style={{ marginBottom: 8 }}>Right Side</p>
          <h2 style={{ marginTop: 0, marginBottom: 12 }}>{rightFigure?.name ?? "Right Figure"}</h2>
          <div className="character-image-wrap">
            {rightFigureId ? <img className="character-image" src={imagePath(rightFigureId)} alt={rightFigure?.name ?? rightFigureId} /> : null}
          </div>
          <div className="caption-list" aria-live="polite">
            {captions.right.length === 0 ? <p style={{ margin: 0, color: "var(--muted)" }}>Waiting for right-side caption...</p> : null}
            {captions.right.map((caption) => (
              <p key={caption.id} className="caption-chip">
                {caption.text}
              </p>
            ))}
          </div>
        </article>
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
              Turn {turn.turn} - {speakerName(turn.speaker)}
            </p>
            <p style={{ marginBottom: 0 }}>{turn.text}</p>
          </article>
        ))}
      </section>

      {status === "completed" ? (
        <section className="panel" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Overall Display</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Persuasion balance: {leftFigure?.name ?? "Left"} {leftShare}% vs {rightFigure?.name ?? "Right"} {rightShare}%
          </p>
          <p style={{ margin: 0, color: "var(--muted)" }}>Final Heat Meter: {Math.round(heat * 100)}%</p>
          <p style={{ margin: 0, color: "var(--muted)" }}>Total Turns: {turns.length}</p>
        </section>
      ) : null}
    </main>
  );
}
