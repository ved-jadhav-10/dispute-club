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
  maxTurns?: number;
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

type QueuedAudio = {
  turn: number;
  audioUrl: string;
};

function imagePath(figureId: string): string {
  return `/assets/characters/${figureId}.png`;
}

export default function DebatePage({ params }: { params: { id: string } }) {
  const workerBase = useMemo(() => getWorkerBaseUrl(), []);
  const audioQueueRef = useRef<QueuedAudio[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const seenTurnsRef = useRef<Set<number>>(new Set());
  const [status, setStatus] = useState("loading");
  const [topic, setTopic] = useState("");
  const [heat, setHeat] = useState(0);
  const [maxHeat, setMaxHeat] = useState(0);
  const [maxTurns, setMaxTurns] = useState(6);
  const [persuasion, setPersuasion] = useState({ left: 0, right: 0 });
  const [leftFigureId, setLeftFigureId] = useState("");
  const [rightFigureId, setRightFigureId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [figures, setFigures] = useState<FigureLookup>({});
  const [battleLogOpen, setBattleLogOpen] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [activeAudioTurn, setActiveAudioTurn] = useState<number | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState(false);
  const [isCalculatingResult, setIsCalculatingResult] = useState(false);
  const resultTimerRef = useRef<number | null>(null);

  const leftFigure = leftFigureId ? figures[leftFigureId] : undefined;
  const rightFigure = rightFigureId ? figures[rightFigureId] : undefined;

  const activeTurn = activeAudioTurn ? turns.find((turn) => turn.turn === activeAudioTurn) : undefined;
  const currentTurn = activeTurn ?? turns[turns.length - 1];
  const currentSpeaker = currentTurn?.side === "left" ? leftFigure : rightFigure;

  const leftShare = Math.round(((persuasion.left + 1) / 2) * 100);
  const rightShare = 100 - leftShare;

  const winner = leftShare > rightShare ? "left" : rightShare > leftShare ? "right" : null;
  const winnerFigure = winner === "left" ? leftFigure : winner === "right" ? rightFigure : null;
  const winnerShare = winner === "left" ? leftShare : rightShare;
  const loserShare = winner === "left" ? rightShare : leftShare;
  const margin = Math.abs(leftShare - rightShare);

  const playNextQueuedAudio = () => {
    if (!audioUnlockedRef.current || activeAudioRef.current) {
      return;
    }

    const nextItem = audioQueueRef.current.shift();
    if (!nextItem) {
      return;
    }

    const audio = new Audio(nextItem.audioUrl);
    activeAudioRef.current = audio;
    setActiveAudioTurn(nextItem.turn);

    const clearAndContinue = () => {
      activeAudioRef.current = null;
      setActiveAudioTurn(null);
      playNextQueuedAudio();
    };

    audio.addEventListener("ended", clearAndContinue, { once: true });
    audio.addEventListener("error", clearAndContinue, { once: true });

    void audio.play().catch(() => {
      activeAudioRef.current = null;
      setActiveAudioTurn(null);
      audioQueueRef.current.unshift(nextItem);
    });
  };

  useEffect(() => {
    const unlockAudio = () => {
      audioUnlockedRef.current = true;
      playNextQueuedAudio();
    };

    if (sessionStorage.getItem("dc-audio-primed") === "1") {
      audioUnlockedRef.current = true;
      sessionStorage.removeItem("dc-audio-primed");
    }

    playNextQueuedAudio();

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let cancelled = false;

    async function bootstrap() {
      const figureList = await getFigures();
      if (cancelled) {
        return;
      }
      setFigures(Object.fromEntries(figureList.map((figure) => [figure.id, figure])));

      const stateResponse = await fetch(`${workerBase}/api/session/${params.id}`);
      if (cancelled) {
        return;
      }
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
      setMaxHeat(state.heat);
      setMaxTurns(state.maxTurns ?? 6);
      setPersuasion(state.persuasion);
      setTurns(
        state.transcript.map((turn) => ({
          ...turn,
          heat: state.heat
        }))
      );
      seenTurnsRef.current = new Set(state.transcript.map((turn) => turn.turn));

      await fetch(`${workerBase}/api/session/${params.id}/start`, { method: "POST" });
      if (cancelled) {
        return;
      }

      eventSource = new EventSource(`${workerBase}/api/session/${params.id}/stream`);
      if (cancelled) {
        eventSource.close();
        return;
      }

      eventSource.addEventListener("turn.play", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as Turn;
        const isNewTurn = !seenTurnsRef.current.has(payload.turn);
        if (isNewTurn) {
          seenTurnsRef.current.add(payload.turn);
        }

        setHeat(payload.heat);
        setMaxHeat((prev) => Math.max(prev, payload.heat));
        if (isNewTurn) {
          setTurns((prev) => [...prev, payload]);
        }

        if (payload.audioUrl && isNewTurn) {
          audioQueueRef.current.push({ turn: payload.turn, audioUrl: payload.audioUrl });
          playNextQueuedAudio();
        }
      });

      eventSource.addEventListener("session.completed", async () => {
        const refreshResponse = await fetch(`${workerBase}/api/session/${params.id}`);
        if (refreshResponse.ok) {
          const refreshed = (await refreshResponse.json()) as SessionState;
          setPersuasion(refreshed.persuasion);
          setHeat(refreshed.heat);
        }
        setPendingCompletion(true);
      });

      eventSource.addEventListener("session.error", () => {
        setStatus("error");
      });
    }

    void bootstrap();

    return () => {
      cancelled = true;
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      audioQueueRef.current = [];
      setActiveAudioTurn(null);
      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }
      seenTurnsRef.current.clear();
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [params.id, workerBase]);

  useEffect(() => {
    if (!pendingCompletion || isCalculatingResult) {
      return;
    }

    if (activeAudioTurn !== null || audioQueueRef.current.length > 0) {
      return;
    }

    setIsCalculatingResult(true);
    resultTimerRef.current = window.setTimeout(() => {
      setIsCalculatingResult(false);
      setPendingCompletion(false);
      setStatus("completed");
      resultTimerRef.current = null;
    }, 1800);
  }, [pendingCompletion, activeAudioTurn, isCalculatingResult]);

  async function handlePause() {
    if (isPaused) {
      await fetch(`${workerBase}/api/session/${params.id}/resume`, { method: "POST" });
      setIsPaused(false);
    } else {
      await fetch(`${workerBase}/api/session/${params.id}/pause`, { method: "POST" });
      setIsPaused(true);
    }
  }

  // Loading state
  if (status === "loading") {
    return (
      <main className="container">
        <div className="panel" style={{ padding: 40, textAlign: "center" }}>
          <div className="debate-title" style={{ marginBottom: 20 }}>DISPUTE CLUB</div>
          <p style={{ color: "var(--muted)" }}>Loading debate...</p>
        </div>
      </main>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <main className="container">
        <div className="panel" style={{ padding: 40, textAlign: "center" }}>
          <div className="debate-title" style={{ marginBottom: 20 }}>DISPUTE CLUB</div>
          <p style={{ color: "var(--red)" }}>Failed to load debate session.</p>
          <Link href="/" style={{ color: "var(--accent)" }}>← Return Home</Link>
        </div>
      </main>
    );
  }

  // Results View
  if (isCalculatingResult) {
    return (
      <main className="container">
        <div className="panel calculating-panel">
          <div className="debate-title" style={{ marginBottom: 14 }}>DISPUTE CLUB</div>
          <div className="calculating-title">CALCULATING VERDICT</div>
          <p className="calculating-subtitle">Crowd reactions and persuasion shifts are being finalized...</p>
          <div className="calculating-loader" />
        </div>
      </main>
    );
  }

  if (status === "completed") {
    const winnerName = winnerFigure?.name ?? "Unknown";
    const loserFigure = winner === "left" ? rightFigure : leftFigure;
    const loserName = loserFigure?.name ?? "opponent";

    // Generate a simple verdict based on the winner
    const isSocrates = winnerFigure?.name?.toLowerCase().includes("socra");
    const verdictEnding = isSocrates
      ? "Socratic method's relentless logic"
      : `${winnerFigure?.name ?? "the winner"}'s compelling arguments`;
    const generatedVerdict = winnerFigure
      ? `${winnerFigure.name} dominated on first-principles reasoning, turning every ${loserName} counterattack into a new question. The crowd was swayed by the ${verdictEnding}.`
      : "The debate concluded without a clear winner.";

    return (
      <main className="container">
        <div className="panel">
          {/* Header */}
          <div className="debate-header">
            <Link href="/" className="debate-title">DISPUTE CLUB</Link>
            <span className="turn-counter">GAME OVER · {turns.length} TURNS</span>
          </div>

          {/* Winner Announcement */}
          <div className="results-container">
            <h1 className="winner-name">{winnerName.toUpperCase()}</h1>
            <p className="winner-subtitle">
              wins by argument · <span className="margin">+{margin}%</span> persuasion lead
            </p>

            {/* Fighter Cards */}
            <div className="results-fighters">
              <div className={`result-card ${winner === "left" ? "winner" : ""}`}>
                {leftFigureId && (
                  <img src={imagePath(leftFigureId)} alt={leftFigure?.name} className="result-avatar" />
                )}
                <div className="result-name">{leftFigure?.name ?? "Left"}</div>
                <div className="result-percent">{leftShare}%</div>
                <div className="result-bar">
                  <div className="result-bar-fill" style={{ width: `${leftShare}%` }} />
                </div>
              </div>

              <div className={`result-card ${winner === "right" ? "winner" : ""}`}>
                {rightFigureId && (
                  <img src={imagePath(rightFigureId)} alt={rightFigure?.name} className="result-avatar" />
                )}
                <div className="result-name">{rightFigure?.name ?? "Right"}</div>
                <div className="result-percent">{rightShare}%</div>
                <div className="result-bar">
                  <div className="result-bar-fill" style={{ width: `${rightShare}%` }} />
                </div>
              </div>
            </div>

            {/* Verdict */}
            <div className="verdict-box">
              <div className="verdict-label">VERDICT</div>
              <p className="verdict-text">
                <span className="highlight">{winnerFigure?.name}</span> {generatedVerdict.replace(winnerFigure?.name ?? "", "")}
              </p>
            </div>

            {/* Stats */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-value">{turns.length}</div>
                <div className="stat-label">total turns</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Math.round(maxHeat * 100)}%</div>
                <div className="stat-label">peak heat</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">+{margin}%</div>
                <div className="stat-label">winning margin</div>
              </div>
            </div>
          </div>

          {/* Back Link */}
          <div style={{ padding: 20, textAlign: "center" }}>
            <Link href="/" style={{ color: "var(--accent)" }}>← Start New Debate</Link>
          </div>
        </div>
      </main>
    );
  }

  // Battle View
  return (
    <main className="container">
      <div className="panel" style={{ padding: 0 }}>
        {/* Header */}
        <div className="debate-header">
          <Link href="/" className="debate-title">DISPUTE CLUB</Link>
          <span className="turn-counter">TURN {turns.length} / {maxTurns}</span>
        </div>

        {/* Topic */}
        <div className="topic-bar">
          TOPIC — <span>"{topic || "Loading..."}"</span>
        </div>

        {/* Scoreboard */}
        <div className="scoreboard">
          <div className="score-side left">
            <div className="score-name">{leftFigure?.name ?? "Left"}</div>
            <div className="score-label">PERSUASION</div>
            <div className="score-bar">
              <div className="score-fill left" style={{ width: `${leftShare}%` }} />
            </div>
            <div className="score-percent">{leftShare}%</div>
          </div>

          <div className="vs-center">
            <div className="vs-badge">VS</div>
            <div className="heat-label">HEAT</div>
            <div className="heat-value">{Math.round(heat * 100)}%</div>
          </div>

          <div className="score-side right">
            <div className="score-name">{rightFigure?.name ?? "Right"}</div>
            <div className="score-label">PERSUASION</div>
            <div className="score-bar">
              <div className="score-fill right" style={{ width: `${rightShare}%` }} />
            </div>
            <div className="score-percent">{rightShare}%</div>
          </div>
        </div>

        {/* Fighter Panels */}
        <div className="debate-fighters">
          <div className={`debate-fighter left ${currentTurn?.side === "left" ? "active" : ""}`}>
            {leftFigureId && (
              <img src={imagePath(leftFigureId)} alt={leftFigure?.name} className="debate-avatar" />
            )}
            <div className="debate-name">{leftFigure?.name ?? "Left"}</div>
          </div>

          <div className={`debate-fighter right ${currentTurn?.side === "right" ? "active" : ""}`}>
            {rightFigureId && (
              <img src={imagePath(rightFigureId)} alt={rightFigure?.name} className="debate-avatar" />
            )}
            <div className="debate-name">{rightFigure?.name ?? "Right"}</div>
          </div>
        </div>

        {/* Current Speech */}
        {currentTurn && (
          <div className="speech-box">
            <div className="speech-speaker">{currentSpeaker?.name ?? currentTurn.speaker} —</div>
            <p className="speech-text">{currentTurn.text}</p>
          </div>
        )}

        {/* Battle Log */}
        <div className="battle-log">
          <div
            className={`battle-log-header ${battleLogOpen ? "expanded" : ""}`}
            onClick={() => setBattleLogOpen(!battleLogOpen)}
          >
            Battle log
          </div>
          {battleLogOpen && (
            <div className="battle-log-entries">
              {turns.length === 0 ? (
                <div className="log-entry">Waiting for first turn...</div>
              ) : (
                turns.map((turn) => {
                  const speaker = turn.side === "left" ? leftFigure : rightFigure;
                  const shortName = speaker?.name?.slice(0, 3).toUpperCase() ?? turn.speaker.slice(0, 3).toUpperCase();
                  return (
                    <div key={turn.turn} className="log-entry">
                      <div className="log-entry-head">
                        <span className="turn-num">T{turn.turn}</span>
                        <span className="speaker">{shortName}</span>
                      </div>
                      <p className="log-text">{turn.text}</p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="debate-controls">
          <button className="ctrl-btn pause" onClick={handlePause}>
            {isPaused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
          <Link href="/" className="ctrl-btn end">
            END
          </Link>
        </div>
      </div>
    </main>
  );
}
