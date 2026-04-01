import type { Env } from "../types";

interface SynthesizeParams {
  env: Env;
  text: string;
  voiceId: string;
}

function resolveModelId(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "eleven_multilingual_v2";
  }

  // Common misconfiguration: agent IDs are not valid TTS model IDs.
  if (trimmed.startsWith("agent_")) {
    return "eleven_multilingual_v2";
  }

  return trimmed;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function synthesizeSpeech(params: SynthesizeParams): Promise<string | null> {
  if (!params.env.ELEVENLABS_API_KEY || params.voiceId.startsWith("VOICE_")) {
    return null;
  }

  const baseUrl = params.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io";
  const modelId = resolveModelId(params.env.ELEVENLABS_MODEL_ID);

  const response = await fetch(`${baseUrl}/v1/text-to-speech/${params.voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": params.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      model_id: modelId,
      text: params.text,
      output_format: "mp3_44100_64"
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.warn(`ElevenLabs TTS failed (${response.status}): ${details.slice(0, 300)}`);
    return null;
  }

  const audioBuffer = await response.arrayBuffer();
  const base64 = toBase64(audioBuffer);
  return `data:audio/mpeg;base64,${base64}`;
}
