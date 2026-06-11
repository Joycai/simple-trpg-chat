/**
 * Avatar colors preset and helpers.
 */

export interface AvatarColorPreset {
  name: string;
  hex: string;
  text: string;
}

export const PRESET_AVATAR_COLORS: AvatarColorPreset[] = [
  { name: "Rose", hex: "#f43f5e", text: "#ffffff" },
  { name: "Orange", hex: "#f97316", text: "#ffffff" },
  { name: "Amber", hex: "#eab308", text: "#1e293b" },
  { name: "Emerald", hex: "#10b981", text: "#ffffff" },
  { name: "Teal", hex: "#14b8a6", text: "#ffffff" },
  { name: "Blue", hex: "#3b82f6", text: "#ffffff" },
  { name: "Indigo", hex: "#6366f1", text: "#ffffff" },
  { name: "Purple", hex: "#a855f7", text: "#ffffff" },
  { name: "Pink", hex: "#ec4899", text: "#ffffff" },
  { name: "Slate", hex: "#64748b", text: "#ffffff" },
];

/**
 * Returns a readable text color (dark slate or white) based on the background color's brightness.
 */
export function getContrastColor(hex: string): string {
  const color = hex.startsWith("#") ? hex.slice(1) : hex;
  if (color.length !== 6) return "#ffffff";
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#0f172a" : "#ffffff";
}

/**
 * Generates a deterministic random color for a user based on their ID.
 */
export function getRandomColorForUser(userId?: number | null): string {
  const id = typeof userId === "number" && !isNaN(userId) ? userId : 0;
  const index = Math.abs(id) % PRESET_AVATAR_COLORS.length;
  return PRESET_AVATAR_COLORS[index].hex;
}
