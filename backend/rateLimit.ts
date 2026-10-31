/**
 * Per-IP rate limiting for the public demo, so one visitor can't burn the free Groq / Gemini /
 * Sarvam quotas. In-memory (one process), which is all a single free host needs.
 */
import type { NextFunction, Request, Response } from "express";

type Options = {
  /** Requests allowed per IP inside the window. */
  max: number;
  windowMs: number;
  /** Shown to the caller when the limit is hit. */
  message?: string;
};

export function rateLimit({ max, windowMs, message }: Options) {
  const hits = new Map<string, number[]>();

  // Drop idle IPs so the map can't grow without bound.
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of hits) {
      if (!times.some((t) => t > cutoff)) hits.delete(ip);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip ?? "unknown";
    const recent = (hits.get(ip) ?? []).filter((t) => t > now - windowMs);

    if (recent.length >= max) {
      const retryAfter = Math.max(1, Math.ceil(((recent[0] ?? now) + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: message ?? `Too many requests. Try again in ${retryAfter}s.` });
      return;
    }

    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}
