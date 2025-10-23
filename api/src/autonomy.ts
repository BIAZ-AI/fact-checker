import axios from "axios";
import { CheckRequest, CheckResponse } from "./schema";

const AUTONOMY_AGENT_URL = process.env.AUTONOMY_AGENT_URL;
const AUTONOMY_API_KEY = process.env.AUTONOMY_API_KEY;

export async function runFactCheck(payload: CheckRequest): Promise<CheckResponse> {
  if (!AUTONOMY_AGENT_URL) {
    throw new Error("AUTONOMY_AGENT_URL env var is required to contact the Autonomy root agent");
  }

  const url = new URL("/agents/fact-checker?stream=false", AUTONOMY_AGENT_URL).toString();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (AUTONOMY_API_KEY) {
    headers.Authorization = `Bearer ${AUTONOMY_API_KEY}`;
  }

  const body = {
    message: payload.input,
    options: payload.options,
  };

  try {
    const response = await axios.post(url, body, {
      headers,
      timeout: 60_000,
    });

    const data = response.data;

    if (Array.isArray(data)) {
      const finalChunk = data[data.length - 1];
      if (finalChunk && typeof finalChunk === "object" && "content" in finalChunk) {
        try {
          const parsed = JSON.parse((finalChunk as { content: { text: string } }).content.text ?? "{}");
          return parsed as CheckResponse;
        } catch (parseError) {
          throw new Error(`Failed to parse Autonomy final chunk: ${String(parseError)}`);
        }
      }
    }

    return data as CheckResponse;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Autonomy request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`
      );
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
}
