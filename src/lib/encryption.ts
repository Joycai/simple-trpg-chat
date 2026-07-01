import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypts a string using AES-256-GCM.
 * The key is derived from the AI_ENCRYPTION_KEY environment variable.
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Format: iv:encrypted:tag
  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`;
}

/**
 * Decrypts a string encrypted with the encrypt() function.
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, encrypted, tagHex] = encryptedText.split(":");

  if (!ivHex || !encrypted || !tagHex) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// scrypt is deliberately CPU-expensive, and this env-derived key never
// changes at runtime — cache it instead of re-deriving on every encrypt/decrypt
// call (which, for the AI provider key, happens on every bot message).
let cachedKey: Buffer | null = null;

/**
 * Helper to get a valid 32-byte key from the environment variable.
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const rawKey = process.env.AI_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("AI_ENCRYPTION_KEY environment variable is missing!");
  }

  const salt = process.env.AI_ENCRYPTION_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AI_ENCRYPTION_SALT environment variable is required in production!");
    }
    cachedKey = crypto.scryptSync(rawKey, "salt", 32);
    return cachedKey;
  }
  // Ensure it's exactly 32 bytes
  cachedKey = crypto.scryptSync(rawKey, salt, 32);
  return cachedKey;
}
