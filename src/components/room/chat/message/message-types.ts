/** Subtype for type='system' chat messages. Drives the kind-specific pill / help card render. */
export type ChatSystemKind =
  | "st" | "error" | "room-event" | "scene-marker" | "help" | "inventory-dispatch" | "inventory-receipt"
  | "timeline-divider" | "event-card" | "event-receipt" | null;
