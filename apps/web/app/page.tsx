"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, getFigures, type Figure } from "../lib/api";

export default function SetupPage() {
  const router = useRouter();
  const [figures, setFigures] = useState<Figure[]>([]);
  const [topic, setTopic] = useState("Should AI be regulated?");
  const [leftFigureId, setLeftFigureId] = useState("socrates");
  const [rightFigureId, setRightFigureId] = useState("napoleon");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFigures()
      .then((items) => {
        setFigures(items);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load figures");
      });
  }, []);

  const selectable = useMemo(() => figures.map((figure) => ({ id: figure.id, label: figure.name })), [figures]);

  async function onStart() {
    try {
      setIsLoading(true);
      setError(null);
      const session = await createSession({
        topic,
        leftFigureId,
        rightFigureId,
        maxTurns: 6
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
      <section className="panel hero-panel">
        <p className="eyebrow">Voice Arena</p>
        <img src="/assets/logo.png" alt="Dispute Club" className="brand-logo" />
        <p style={{ marginTop: 0, color: "var(--muted)", maxWidth: 640 }}>
          Stage a six-turn showdown between iconic historical minds on any modern question, then listen as each side escalates the heat in real time.
        </p>
      </section>

      <section id="new-debate" className="panel" style={{ display: "grid", gap: 16 }}>
        <h2 style={{ margin: 0 }}>New Debate</h2>

        <label>
          Topic
          <input className="field" value={topic} onChange={(event) => setTopic(event.target.value)} />
        </label>

        <div className="split-grid">
          <label>
            Left Figure
            <select className="field" value={leftFigureId} onChange={(event) => setLeftFigureId(event.target.value)}>
              {selectable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Right Figure
            <select className="field" value={rightFigureId} onChange={(event) => setRightFigureId(event.target.value)}>
              {selectable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button disabled={isLoading || !topic.trim() || leftFigureId === rightFigureId} onClick={onStart}>
          {isLoading ? "Starting..." : "Start 6-Turn Debate"}
        </button>

        {error && <p style={{ color: "#8b2f2f", margin: 0 }}>{error}</p>}
      </section>
    </main>
  );
}
