import "dotenv/config";
import express from "express";
import { checkRequestSchema, checkResponseSchema } from "./schema";
import { runFactCheck } from "./autonomy";

const app = express();
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 8000);

app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/version", (_req, res) => {
  res.status(200).json({ version: process.env.npm_package_version ?? "0.0.0" });
});

app.post("/v1/check", async (req, res) => {
  try {
    const payload = checkRequestSchema.parse(req.body);
    const start = Date.now();
    const autonomyResponse = await runFactCheck(payload);
    const durationMs = Date.now() - start;
    const validatedResponse = checkResponseSchema.parse({
      ...autonomyResponse,
      meta: {
        ...autonomyResponse.meta,
        durationMs,
        engine: autonomyResponse.meta.engine ?? "autonomy-root-orchestrator",
      },
    });
    res.status(200).json(validatedResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: { message } });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
