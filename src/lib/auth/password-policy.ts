/**
 * Password policy shared by every path that sets a password: public
 * registration, self-service change and the admin reset. One constant keeps
 * the server checks and the client hints from drifting (a 3-character
 * "password" next to an 8-character registration rule was a real gap).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt truncates beyond 72 bytes

/** Returns a stable reason key, or null when the password is acceptable. */
export function passwordPolicyError(password: unknown): "tooShort" | "tooLong" | null {
  if (typeof password !== "string") return "tooShort";
  if (password.length < PASSWORD_MIN_LENGTH) return "tooShort";
  if (password.length > PASSWORD_MAX_LENGTH) return "tooLong";
  return null;
}
