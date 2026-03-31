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
    <main className="container">
      <section className="panel" style={{ display: "grid", gap: 16 }}>
        <h1 style={{ marginBottom: 0 }}>Dispute Club</h1>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Pick two historical figures and a modern topic. Your six-turn voice debate starts live.
        </p>

        <label>
          Topic
          <input
            style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid var(--line)" }}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Left Figure
            <select
              style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid var(--line)" }}
              value={leftFigureId}
              onChange={(event) => setLeftFigureId(event.target.value)}
            >
              {selectable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Right Figure
            <select
              style={{ display: "block", width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid var(--line)" }}
              value={rightFigureId}
              onChange={(event) => setRightFigureId(event.target.value)}
            >
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
