import { describe, it, expect } from "vitest";

describe("Vercel entrypoint", () => {
  it("exports a serverless handler", async () => {
    const mod = await import("../api/index.js");
    expect(mod.default).toBeTypeOf("function");
  });
});
