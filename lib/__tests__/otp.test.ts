import { describe, it, expect } from "vitest";
import { generateOtp, hashOtp } from "../otp";

describe("OTP utilities", () => {
  describe("generateOtp", () => {
    it("generates a 6-digit code", () => {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    });

    it("pads with leading zeros", () => {
      // Math.randomInt can return 0, which should produce "000000"
      // We can't easily test this deterministically, but we can verify the format
      for (let i = 0; i < 100; i++) {
        const code = generateOtp();
        expect(code.length).toBe(6);
      }
    });

    it("generates different codes (probabilistic)", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 10; i++) {
        codes.add(generateOtp());
      }
      // With 1M possible codes and 10 samples, collision is extremely unlikely
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe("hashOtp", () => {
    it("returns a 64-character hex string (SHA-256)", () => {
      const hash = hashOtp("123456");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("is deterministic", () => {
      const hash1 = hashOtp("123456");
      const hash2 = hashOtp("123456");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = hashOtp("123456");
      const hash2 = hashOtp("654321");
      expect(hash1).not.toBe(hash2);
    });

    it("handles empty string", () => {
      const hash = hashOtp("");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
