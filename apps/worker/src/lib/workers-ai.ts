import type { DebateTurnResult, Env, FigureProfile, TranscriptTurn } from "../types";

interface GenerateTurnParams {
  env: Env;
  topic: string;
  heat: number;
  transcript: TranscriptTurn[];
  speaker: FigureProfile;
  opponent: FigureProfile;
}

interface WorkersAiRestResponse {
  success: boolean;
  result?: {
    response?: string;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function capAtSentenceBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars);
  const lastBoundary = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (lastBoundary >= Math.floor(maxChars * 0.6)) {
    return slice.slice(0, lastBoundary + 1).trim();
  }

  return `${slice.trimEnd()}.`;
}

function toPunchy(argument: string): string {
  const compact = argument.replace(/\s+/g, " ").trim();
  const parts = compact.split(/(?<=[.!?])\s+/).filter(Boolean);
  const shortened = parts.slice(0, 4).join(" ");
  const capped = shortened || compact;
  if (capped.length <= 520) {
    return capped;
  }
  return capped.slice(0, 520).trimEnd();
}

function tryParseStructuredTurn(raw: string): DebateTurnResult | null {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as DebateTurnResult;
      if (typeof parsed.argument === "string" && parsed.argument.trim().length > 0) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const candidate = trimmed.slice(jsonStart, jsonEnd + 1);
    try {
      const parsed = JSON.parse(candidate) as DebateTurnResult;
      if (typeof parsed.argument === "string" && parsed.argument.trim().length > 0) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function sanitizeFreeformArgument(raw: string): string {
  const plain = raw.replace(/\*\*/g, "").trim();

  const argumentMatch = plain.match(/Argument\s*:\s*([\s\S]*?)(?:Heat\s*Delta\s*:|Persuasion\s*Delta\s*:|$)/i);
  if (argumentMatch?.[1]) {
    return argumentMatch[1].trim();
  }

  return plain
    .replace(/Heat\s*Delta\s*:[^\n]+/gi, "")
    .replace(/Persuasion\s*Delta\s*:[^\n]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function personaLine(figureId: string): string {
  switch (figureId) {
    case "socrates":
      return "If your claim is true, by what definition of justice does unchecked power over intelligence remain legitimate?";
    case "napoleon":
      return "Nations that fail to command transformative technology are ruled by those that do.";
    case "newton":
      return "Policy must follow observed consequences, not superstition about machines.";
    case "gandhi":
      return "Power without conscience becomes violence by quieter means.";
    case "shakespeare":
      return "When man forges a brighter mind, he must also forge a steadier conscience.";
    case "confucius":
      return "A state is well ordered only when its tools answer to virtue and duty.";
    default:
      return "Progress needs principled guardrails to protect people from abuse.";
  }
}

function fallbackArgument(params: GenerateTurnParams): DebateTurnResult {
  const lastTurn = params.transcript[params.transcript.length - 1];
  const opening = lastTurn
    ? `${params.speaker.name}: ${params.opponent.name}, your last point underestimates the social cost of badly governed intelligence.`
    : `${params.speaker.name}: On ${params.topic}, we should begin with first principles before policy slogans.`;
  const stance = personaLine(params.speaker.id);
  const close =
    params.heat > 0.65
      ? "Act now with enforceable rules, or accept preventable harm as policy."
      : "Build freedom and accountability together, and we gain innovation without surrendering dignity.";

  return {
    argument: toPunchy(`${opening} ${stance} ${close}`),
    heatDelta: 0.06,
    persuasionDelta: params.heat > 0.7 ? -0.02 : 0.03
  };
}

function buildPrompt(params: GenerateTurnParams, recentTranscript: string): string {
  return [
    params.speaker.personaPrompt,
    `Debate topic: ${params.topic}`,
    `You are ${params.speaker.name} debating ${params.opponent.name}.`,
    "Respond in first person as yourself only.",
    `Current heat level: ${params.heat.toFixed(2)} (0 to 1).`,
    "Rules:",
    "- Reply directly to the last point.",
    "- 3-4 concise, natural sentences.",
    "- Maximum 90 words.",
    "- Stay in character.",
    "Return ONLY strict JSON: {\"argument\": string, \"heatDelta\": number, \"persuasionDelta\": number}.",
    "Do not include markdown, speaker labels, or extra text.",
    "Recent transcript:",
    recentTranscript || "(empty)"
  ].join("\n");
}

export async function generateTurn(params: GenerateTurnParams): Promise<DebateTurnResult> {
  let raw = "";
  const recentTranscript = params.transcript
    .slice(-4)
    .map((turn) => `${turn.speaker}: ${turn.text}`)
    .join("\n");
  const prompt = buildPrompt(params, recentTranscript);

  if (params.env.AI) {
    try {
      const aiResponse = await params.env.AI.run(params.env.WORKERS_AI_MODEL, {
        prompt,
        max_tokens: 140,
        temperature: 0.75
      });
      raw = String(aiResponse.response ?? "").trim();
    } catch {
      raw = "";
    }
  }

  if (!raw && params.env.CLOUDFLARE_ACCOUNT_ID && params.env.CLOUDFLARE_API_TOKEN) {
    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${params.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${params.env.WORKERS_AI_MODEL}`;
      const restResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          max_tokens: 140,
          temperature: 0.75
        })
      });

      if (restResponse.ok) {
        const payload = (await restResponse.json()) as WorkersAiRestResponse;
        raw = String(payload.result?.response ?? "").trim();
      }
    } catch {
      raw = "";
    }
  }

  if (!raw) {
    return fallbackArgument(params);
  }
  try {
    const structured = tryParseStructuredTurn(raw);
    if (structured) {
      if (!structured.argument || typeof structured.argument !== "string") {
        return fallbackArgument(params);
      }

      return {
        argument: capAtSentenceBoundary(toPunchy(structured.argument), Number(params.env.MAX_TURN_CHARS || 700)),
        heatDelta: clamp(Number(structured.heatDelta ?? 0.05), -0.1, 0.2),
        persuasionDelta: clamp(Number(structured.persuasionDelta ?? 0), -0.2, 0.2)
      };
    }

    return {
      argument: capAtSentenceBoundary(toPunchy(sanitizeFreeformArgument(raw)), Number(params.env.MAX_TURN_CHARS || 700)),
      heatDelta: 0.06,
      persuasionDelta: params.heat > 0.7 ? -0.02 : 0.03
    };
  } catch {
    return fallbackArgument(params);
  }
}
