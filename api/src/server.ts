import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { checkRequestSchema, checkResponseSchema } from "./schema";
import { runFactCheck } from "./autonomy";

const app = express();
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 8000);
const BUILD_VERSION = process.env.npm_package_version ?? "0.0.0";
const BUILD_TIME = process.env.BUILD_TIME ?? new Date().toISOString();

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const metaString = Object.entries(meta)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  const formatted = `[${timestamp}] ${level.toUpperCase()} ${message}${metaString ? ` ${metaString}` : ""}`;
  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

const clientIpFromRequest = (req: Request): string => {
  if (req.ip) return req.ip;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0] ?? "unknown";
  }
  return "unknown";
};

app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    log("info", "http_request", {
      ip: clientIpFromRequest(req),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    });
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
    const normalizedResponse = Array.isArray(autonomyResponse)
      ? autonomyResponse[autonomyResponse.length - 1]
      : autonomyResponse;
    const durationMs = Date.now() - start;
    const validatedResponse = checkResponseSchema.parse({
      ...normalizedResponse,
      meta: {
        ...normalizedResponse.meta,
        durationMs,
        engine: normalizedResponse.meta?.engine ?? "autonomy-root-orchestrator",
      },
    });
    res.status(200).json(validatedResponse);
  } catch (err) {
    let message = "Unknown error";
    if (err instanceof Error) {
      message = err.message;
      log("error", "upstream_error", { message: err.message });
    } else {
      log("error", "upstream_error_unknown", { error: err });
    }

    res.status(400).json({ error: { message } });
  }
});

app.listen(PORT, () => {
  log("info", "server_started", {
    port: PORT,
    buildVersion: BUILD_VERSION,
    buildTime: BUILD_TIME,
  });
});
