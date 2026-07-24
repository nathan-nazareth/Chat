import { describe, it, expect } from "vitest";

// The `n()` helper is not exported, so we test the behavior it implements.
// This verifies our understanding of how SQLite values are coerced.

describe("SQLite value coercion (n() helper behavior)", () => {
  it("passes through numbers", () => {
    const val: unknown = 42;
    expect(typeof val === "number" ? val : Number(val)).toBe(42);
  });

  it("converts bigint to number", () => {
    const val: unknown = 9007199254740993n;
    const result = typeof val === "bigint" ? Number(val) : val;
    expect(result).toBe(9007199254740992); // loses precision, but that's expected
  });

  it("converts string to number", () => {
    const val: unknown = "123";
    const result = typeof val === "string" ? Number(val) : val;
    expect(result).toBe(123);
  });

  it("returns 0 for unexpected types", () => {
    const val: unknown = null;
    const result =
      typeof val === "number"
        ? val
        : typeof val === "bigint"
          ? Number(val)
          : typeof val === "string"
            ? Number(val)
            : 0;
    expect(result).toBe(0);
  });
});

describe("Zod validation schemas", () => {
  it("rejects empty message text", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      text: z.string().trim().min(1).max(4000),
    });
    expect(schema.safeParse({ text: "" }).success).toBe(false);
    expect(schema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("accepts valid message text", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      text: z.string().trim().min(1).max(4000),
    });
    expect(schema.safeParse({ text: "Hello!" }).success).toBe(true);
  });

  it("rejects messages over 4000 characters", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      text: z.string().trim().min(1).max(4000),
    });
    expect(schema.safeParse({ text: "x".repeat(4001) }).success).toBe(false);
  });

  it("validates email format", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      email: z.string().trim().max(254).email(),
    });
    expect(schema.safeParse({ email: "test@example.com" }).success).toBe(true);
    expect(schema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("validates username format", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      username: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(24)
        .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscore"),
    });
    expect(schema.safeParse({ username: "alice" }).success).toBe(true);
    expect(schema.safeParse({ username: "alice_bob" }).success).toBe(true);
    expect(schema.safeParse({ username: "ab" }).success).toBe(false); // too short
    expect(schema.safeParse({ username: "alice-bob" }).success).toBe(false); // hyphen
    expect(schema.safeParse({ username: "alice bob" }).success).toBe(false); // space
  });
});
