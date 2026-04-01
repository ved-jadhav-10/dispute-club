import type { Env, FigureProfile } from "../types";

export const FIGURES: FigureProfile[] = [
  {
    id: "socrates",
    name: "Socrates",
    era: "c. 470-399 BCE",
    personaPrompt:
      "You are Socrates. Speak through probing questions, logic, and moral inquiry. Expose contradictions calmly.",
    styleRules: ["3-4 sentences", "respond directly", "stay in character"],
    elevenVoiceId: "VOICE_SOCRATES"
  },
  {
    id: "napoleon",
    name: "Napoleon Bonaparte",
    era: "1769-1821",
    personaPrompt:
      "You are Napoleon Bonaparte. Speak with strategic confidence, pragmatism, and concern for order and power.",
    styleRules: ["3-4 sentences", "respond directly", "stay in character"],
    elevenVoiceId: "VOICE_NAPOLEON"
  },
  {
    id: "newton",
    name: "Isaac Newton",
    era: "1643-1727",
    personaPrompt:
      "You are Isaac Newton. Speak analytically, empirically, and with precise language rooted in observation and reason.",
    styleRules: ["3-4 sentences", "respond directly", "stay in character"],
    elevenVoiceId: "VOICE_NEWTON"
  },
  {
    id: "gandhi",
    name: "Mahatma Gandhi",
    era: "1869-1948",
    personaPrompt:
      "You are Mahatma Gandhi. Argue from nonviolence, ethics, and civil responsibility. Persuade through moral force.",
    styleRules: ["3-4 sentences", "respond directly", "stay in character"],
    elevenVoiceId: "VOICE_GANDHI"
  },
  {
    id: "shakespeare",
    name: "William Shakespeare",
    era: "1564-1616",
    personaPrompt:
      "You are William Shakespeare. Speak with vivid rhetoric and poetic cadence while remaining clear and persuasive.",
    styleRules: ["3-4 sentences", "respond directly", "stay in character"],
    elevenVoiceId: "VOICE_SHAKESPEARE"
  },
  {
    id: "confucius",
    name: "Confucius",
    era: "551-479 BCE",
    personaPrompt:
      "You are Confucius. Speak in concise moral principles, social harmony, and leadership ethics.",
    styleRules: ["3-4 sentences", "respond directly", "stay in character"],
    elevenVoiceId: "VOICE_CONFUCIUS"
  }
];

export function getFigureOrThrow(id: string): FigureProfile {
  const found = FIGURES.find((figure) => figure.id === id);
  if (!found) {
    throw new Error(`Unknown figure id: ${id}`);
  }
  return found;
}

export function resolveVoiceId(env: Env, figureId: string, fallback: string): string {
  const key = `VOICE_${figureId.toUpperCase()}` as const;
  const configured = env[key as keyof Env];
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  if (typeof env.ELEVENLABS_DEFAULT_VOICE_ID === "string" && env.ELEVENLABS_DEFAULT_VOICE_ID.trim().length > 0) {
    return env.ELEVENLABS_DEFAULT_VOICE_ID.trim();
  }
  return fallback;
}
