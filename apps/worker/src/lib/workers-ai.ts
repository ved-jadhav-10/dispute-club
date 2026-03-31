import type { DebateTurnResult, Env, FigureProfile, TranscriptTurn } from "../types";

interface GenerateTurnParams {
  env: Env;
  topic: string;
  heat: number;
  transcript: TranscriptTurn[];
  speaker: FigureProfile;
  opponent: FigureProfile;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fallbackArgument(params: GenerateTurnParams): DebateTurnResult {
  const lastTurn = params.transcript[params.transcript.length - 1];
  const responseLead = lastTurn
    ? `${params.speaker.name} replies directly to ${params.opponent.name}'s prior point.`
    : `${params.speaker.name} opens the debate with a principled stance.`;

  return {
    argument: `${responseLead} On ${params.topic}, I argue from my worldview: progress must serve society, but governance must prevent abuse. We should design institutions that reward truth, responsibility, and long-term human benefit.`,
    heatDelta: 0.06,
    persuasionDelta: params.heat > 0.7 ? -0.02 : 0.03
  };
}

export async function generateTurn(params: GenerateTurnParams): Promise<DebateTurnResult> {
  if (!params.env.AI) {
    return fallbackArgument(params);
  }

  const recentTranscript = params.transcript
    .slice(-4)
    .map((turn) => `${turn.speaker}: ${turn.text}`)
    .join("\n");

  const prompt = [
    params.speaker.personaPrompt,
    `Debate topic: ${params.topic}`,
    `You are debating ${params.opponent.name}.`,
    `Current heat level: ${params.heat.toFixed(2)} (0 to 1).`,
    "Rules:",
    "- Reply directly to the last point.",
    "- 3-4 sentences.",
    "- Stay in character.",
    "Return strict JSON: {\"argument\": string, \"heatDelta\": number, \"persuasionDelta\": number}",
    "Recent transcript:",
    recentTranscript || "(empty)"
  ].join("\n");

  try {
    const aiResponse = await params.env.AI.run(params.env.WORKERS_AI_MODEL, {
      prompt,
      max_tokens: 280,
      temperature: 0.8
    });

    const raw = String(aiResponse.response ?? "").trim();
    const parsed = JSON.parse(raw) as DebateTurnResult;

    if (!parsed.argument || typeof parsed.argument !== "string") {
      return fallbackArgument(params);
    }

    return {
      argument: parsed.argument.slice(0, Number(params.env.MAX_TURN_CHARS || 700)),
      heatDelta: clamp(Number(parsed.heatDelta ?? 0.05), -0.1, 0.2),
      persuasionDelta: clamp(Number(parsed.persuasionDelta ?? 0), -0.2, 0.2)
    };
  } catch {
    return fallbackArgument(params);
  }
}
