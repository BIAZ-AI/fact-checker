import { z } from "zod";

export const checkOptionsSchema = z.object({
  maxFacts: z.number().int().positive().max(100).default(50),
  returnSources: z.boolean().default(false),
});

export const checkRequestSchema = z.object({
  input: z.string().min(1, "input must not be empty"),
  options: checkOptionsSchema.default({ maxFacts: 50, returnSources: false }),
});

export const sourceSchema = z.object({
  url: z.string().url(),
  judgement: z.number().min(0).max(1),
});

export const factSchema = z.object({
  text: z.string(),
  sourcesChecked: z.number().int().nonnegative(),
  sources: z.array(sourceSchema).optional(),
  score: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export const aggregateSchema = z.object({
  score: z.number().min(0).max(1),
  factsCount: z.number().int().nonnegative(),
});

export const metaSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  engine: z.string(),
  version: z.string().optional(),
});

export const checkResponseSchema = z.object({
  facts: z.array(factSchema),
  aggregate: aggregateSchema,
  meta: metaSchema,
});

export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CheckResponse = z.infer<typeof checkResponseSchema>;
export type Fact = z.infer<typeof factSchema>;
