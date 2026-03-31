const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? "http://127.0.0.1:8787";

export type Figure = {
  id: string;
  name: string;
  era: string;
  styleRules: string[];
  elevenVoiceId: string;
};

export async function getFigures(): Promise<Figure[]> {
  const response = await fetch(`${WORKER_URL}/api/figures`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load figures");
  }
  const data = (await response.json()) as { figures: Figure[] };
  return data.figures;
}

export async function createSession(payload: {
  topic: string;
  leftFigureId: string;
  rightFigureId: string;
  maxTurns: number;
}): Promise<{ sessionId: string }> {
  const response = await fetch(`${WORKER_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Unable to create session");
  }

  return (await response.json()) as { sessionId: string };
}

export function getWorkerBaseUrl(): string {
  return WORKER_URL;
}
