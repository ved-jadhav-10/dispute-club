"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, getFigures, type Figure } from "../lib/api";

const QUICK_TOPICS = [
  "AI regulation",
  "Democracy",
  "Free will",
  "Wealth limits",
  "War & justice"
];

const ROUND_OPTIONS = [4, 6, 8, 10];

const FALLBACK_FIGURES: Figure[] = [
  { id: "socrates", name: "Socrates", era: "c. 470-399 BCE", styleRules: [], elevenVoiceId: "VOICE_SOCRATES" },
  {
    id: "napoleon",
    name: "Napoleon Bonaparte",
    era: "1769-1821",
    styleRules: [],
    elevenVoiceId: "VOICE_NAPOLEON"
  },
  { id: "newton", name: "Isaac Newton", era: "1643-1727", styleRules: [], elevenVoiceId: "VOICE_NEWTON" },
  { id: "gandhi", name: "Mahatma Gandhi", era: "1869-1948", styleRules: [], elevenVoiceId: "VOICE_GANDHI" },
  {
    id: "shakespeare",
    name: "William Shakespeare",
    era: "1564-1616",
    styleRules: [],
    elevenVoiceId: "VOICE_SHAKESPEARE"
  },
  { id: "confucius", name: "Confucius", era: "551-479 BCE", styleRules: [], elevenVoiceId: "VOICE_CONFUCIUS" }
];

function imagePath(figureId: string): string {
  return `/assets/characters/${figureId}.png`;
}

export default function SetupPage() {
  const router = useRouter();
  const [figures, setFigures] = useState<Figure[]>(FALLBACK_FIGURES);
  const [topic, setTopic] = useState("Should AI be regulated?");
  const [leftFigureId, setLeftFigureId] = useState("confucius");
  const [rightFigureId, setRightFigureId] = useState("napoleon");
  const [maxTurns, setMaxTurns] = useState(6);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFigures()
      .then((items) => {
        if (items.length > 0) {
          setFigures(items);
        }
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load figures");
      });
  }, []);

  const leftFigure = figures.find((f) => f.id === leftFigureId);
  const rightFigure = figures.find((f) => f.id === rightFigureId);

  function handleFigureClick(figureId: string) {
    if (!leftFigureId) {
      setLeftFigureId(figureId);
    } else if (!rightFigureId && figureId !== leftFigureId) {
      setRightFigureId(figureId);
    } else if (figureId === leftFigureId) {
      setLeftFigureId("");
    } else if (figureId === rightFigureId) {
      setRightFigureId("");
    } else {
      setRightFigureId(figureId);
    }
  }

  function handleQuickTopic(quickTopic: string) {
    const topicMap: Record<string, string> = {
      "AI regulation": "Should AI be regulated?",
      "Democracy": "Is democracy the best form of government?",
      "Free will": "Do humans have free will?",
      "Wealth limits": "Should there be limits on personal wealth?",
      "War & justice": "Can war ever be justified?"
    };
    setTopic(topicMap[quickTopic] || quickTopic);
  }

  async function onStart() {
    try {
      setIsLoading(true);
      setError(null);
      sessionStorage.setItem("dc-audio-primed", "1");
      const session = await createSession({
        topic,
        leftFigureId,
        rightFigureId,
        maxTurns
      });
      router.push(`/debate/${session.sessionId}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="container home-layout">
      {/* Title */}
      <div className="title-wrap">
        <h1 className="glitch-title">DISPUTE<br />CLUB</h1>
        <p className="subtitle">intellectual combat · est. mmxxvi</p>
      </div>

      {/* Topic Input */}
      <section>
        <div className="section-label">Enter debate topic</div>
        <input
          className="field"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should they debate?"
        />
      </section>

      {/* Quick Select */}
      <section>
        <div className="section-label">Quick select</div>
        <div className="quick-select">
          {QUICK_TOPICS.map((qt) => (
            <button
              key={qt}
              className={`quick-btn ${topic.toLowerCase().includes(qt.toLowerCase().split(" ")[0]) ? "active" : ""}`}
              onClick={() => handleQuickTopic(qt)}
            >
              {qt}
            </button>
          ))}
        </div>
      </section>

      {/* Fighter Selection */}
      <section>
        <div className="section-label">Choose fighters</div>

        {/* P1 - Left */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--cyan)", marginBottom: 8 }}>P1 — left</div>
          <div
            className={`selection-box ${leftFigureId ? "left" : ""}`}
            onClick={() => leftFigureId && setLeftFigureId("")}
            style={{ cursor: leftFigureId ? "pointer" : "default" }}
          >
            {leftFigureId && leftFigure ? (
              <>
                <span className="plus-icon" style={{ alignSelf: "flex-end" }}>+</span>
                <img src={imagePath(leftFigureId)} alt={leftFigure.name} className="fighter-avatar" />
                <div className="fighter-name">{leftFigure.name}</div>
              </>
            ) : (
              <span className="plus-icon">+</span>
            )}
          </div>
        </div>

        <div className="vs-text">VS</div>

        {/* P2 - Right */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "var(--cyan)", marginBottom: 8 }}>P2 — right</div>
          <div
            className={`selection-box ${rightFigureId ? "right" : ""}`}
            onClick={() => rightFigureId && setRightFigureId("")}
            style={{ cursor: rightFigureId ? "pointer" : "default" }}
          >
            {rightFigureId && rightFigure ? (
              <>
                <span className="plus-icon" style={{ alignSelf: "flex-end" }}>+</span>
                <img src={imagePath(rightFigureId)} alt={rightFigure.name} className="fighter-avatar" />
                <div className="fighter-name">{rightFigure.name}</div>
              </>
            ) : (
              <span className="plus-icon">+</span>
            )}
          </div>
        </div>
      </section>

      {/* All Fighters Grid */}
      <section>
        <div className="section-label">All fighters</div>
        <div className="fighter-grid">
          {figures.map((figure) => {
            const isLeft = leftFigureId === figure.id;
            const isRight = rightFigureId === figure.id;
            return (
              <div
                key={figure.id}
                className={`fighter-card ${isLeft ? "selected-left" : ""} ${isRight ? "selected-right" : ""}`}
                onClick={() => handleFigureClick(figure.id)}
              >
                <span className="plus-icon">+</span>
                <img src={imagePath(figure.id)} alt={figure.name} className="fighter-avatar" />
                <div className="fighter-name">{figure.name}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Rounds Selector */}
      <section>
        <div className="section-label">Rounds</div>
        <div className="rounds-selector">
          {ROUND_OPTIONS.map((r) => (
            <button
              key={r}
              className={`round-btn ${maxTurns === r ? "active" : ""}`}
              onClick={() => setMaxTurns(r)}
            >
              {r}
            </button>
          ))}
          <span className="rounds-label">turns</span>
        </div>
      </section>

      {/* Start Button */}
      <div>
        <button
          className="start-btn"
          disabled={isLoading || !topic.trim() || !leftFigureId || !rightFigureId || leftFigureId === rightFigureId}
          onClick={onStart}
        >
          {isLoading ? "STARTING..." : "START DEBATE"}
        </button>
        <div className="progress-bar" />
        {error && <p className="error-msg">{error}</p>}
      </div>
    </main>
  );
}
