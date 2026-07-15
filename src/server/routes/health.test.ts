import { describe, expect, it } from "vitest";
import { healthRoute } from "./health";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await healthRoute.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
