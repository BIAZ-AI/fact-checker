import axios from "axios";
import { CheckRequest, CheckResponse } from "./schema";

const AUTONOMY_AGENT_URL = process.env.AUTONOMY_AGENT_URL;
const AUTONOMY_API_KEY = process.env.AUTONOMY_API_KEY;

export async function runFactCheck(payload: CheckRequest): Promise<CheckResponse> {
  if (!AUTONOMY_AGENT_URL) {
    throw new Error("AUTONOMY_AGENT_URL env var is required to contact the Autonomy root agent");
  }

  const url = new URL("/check", AUTONOMY_AGENT_URL).toString();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (AUTONOMY_API_KEY) {
    headers.Authorization = `Bearer ${AUTONOMY_API_KEY}`;
  }

  const response = await axios.post<CheckResponse>(url, payload, {
    headers,
    timeout: 60_000,
  });

  return response.data;
}
