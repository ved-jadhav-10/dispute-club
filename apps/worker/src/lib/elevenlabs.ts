import type { Env } from "../types";

interface SynthesizeParams {
  env: Env;
  text: string;
  voiceId: string;
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
  const modelId = params.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

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
    return null;
  }

  const audioBuffer = await response.arrayBuffer();
  const base64 = toBase64(audioBuffer);
  return `data:audio/mpeg;base64,${base64}`;
}
