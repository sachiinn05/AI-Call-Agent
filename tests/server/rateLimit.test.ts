import { describe, expect, it } from "vitest";
import { rateLimit } from "../../backend/rateLimit.js";

function run(limit: ReturnType<typeof rateLimit>, ip: string) {
  let status = 200;
  let passed = false;
  const res = {
    setHeader: () => res,
    status: (code: number) => {
      status = code;
      return res;
    },
    json: () => res,
  };
  limit({ ip } as never, res as never, () => {
    passed = true;
  });
  return { status, passed };
}

describe("rateLimit", () => {
  it("allows up to max requests per IP, then answers 429", () => {
    const limit = rateLimit({ max: 2, windowMs: 60_000 });
    expect(run(limit, "1.1.1.1").passed).toBe(true);
    expect(run(limit, "1.1.1.1").passed).toBe(true);
    const blocked = run(limit, "1.1.1.1");
    expect(blocked.passed).toBe(false);
    expect(blocked.status).toBe(429);
  });

  it("counts each IP separately", () => {
    const limit = rateLimit({ max: 1, windowMs: 60_000 });
    expect(run(limit, "1.1.1.1").passed).toBe(true);
    expect(run(limit, "2.2.2.2").passed).toBe(true);
    expect(run(limit, "1.1.1.1").passed).toBe(false);
  });
});
