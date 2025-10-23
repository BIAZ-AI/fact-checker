import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { checkRequestSchema, checkResponseSchema } from "./schema";
import { runFactCheck } from "./autonomy";

const app = express();
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 8000);

app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const timestamp = new Date().toISOString();
    const clientIp = req.ip ?? "unknown";
    console.log(
      `[${timestamp}] ip=${clientIp} method=${req.method} path=${req.originalUrl} status=${res.statusCode} durationMs=${durationMs}`
    );
  });
  next();
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.get("/version", (_req: Request, res: Response) => {
  res.status(200).json({ version: process.env.npm_package_version ?? "0.0.0" });
});

app.post("/v1/check", async (req: Request, res: Response) => {
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
    let message = "Unknown error";
    if (err instanceof Error) {
      message = err.message;
      console.error(`[${new Date().toISOString()}] upstream_error message="${err.message}"`);
    } else {
      console.error(`[${new Date().toISOString()}] upstream_error`, err);
    }

    res.status(400).json({ error: { message } });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
