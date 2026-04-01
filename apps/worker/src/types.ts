export type Side = "left" | "right";
export type SessionStatus = "idle" | "running" | "paused" | "completed" | "error";

export interface FigureProfile {
  id: string;
  name: string;
  era: string;
  personaPrompt: string;
  styleRules: string[];
  elevenVoiceId: string;
}

export interface TranscriptTurn {
  turn: number;
  speaker: string;
  side: Side;
  text: string;
  audioUrl: string | null;
  generationSource?: "ai" | "rest" | "fallback";
  durationMs: number | null;
  createdAt: string;
}

export interface SessionConfig {
  sessionId: string;
  topic: string;
  leftFigureId: string;
  rightFigureId: string;
  maxTurns: number;
  createdAt: string;
}

export interface SessionState {
  sessionId: string;
  status: SessionStatus;
  turnIndex: number;
  currentSpeaker: Side;
  heat: number;
  persuasion: {
    left: number;
    right: number;
  };
  transcript: TranscriptTurn[];
  lastGenerationSource?: "ai" | "rest" | "fallback";
  lastError: string | null;
  config: SessionConfig;
}

export interface DebateTurnResult {
  argument: string;
  heatDelta: number;
  persuasionDelta: number;
  source: "ai" | "rest" | "fallback";
}

export interface Env {
  DEBATE_SESSION: DurableObjectNamespace;
  WORKERS_AI_MODEL: string;
  DEFAULT_MAX_TURNS: string;
  MAX_TURN_CHARS: string;
  TURN_DELAY_MS?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_BASE_URL?: string;
  ELEVENLABS_MODEL_ID?: string;
  ELEVENLABS_DEFAULT_VOICE_ID?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  VOICE_SOCRATES?: string;
  VOICE_NAPOLEON?: string;
  VOICE_NEWTON?: string;
  VOICE_GANDHI?: string;
  VOICE_SHAKESPEARE?: string;
  VOICE_CONFUCIUS?: string;
  AI?: {
    run: (model: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
}
