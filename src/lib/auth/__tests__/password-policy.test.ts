import { expect, it } from "vitest";
import { passwordPolicyError } from "../password-policy";

it("enforces the bcrypt byte limit for ASCII and multibyte passwords", () => {
  expect(passwordPolicyError("a".repeat(72))).toBeNull();
  expect(passwordPolicyError("a".repeat(73))).toBe("tooLong");
  expect(passwordPolicyError("密".repeat(24))).toBeNull();
  expect(passwordPolicyError("密".repeat(24) + "A")).toBe("tooLong");
  expect(passwordPolicyError("😀".repeat(18))).toBeNull();
  expect(passwordPolicyError("😀".repeat(19))).toBe("tooLong");
});
