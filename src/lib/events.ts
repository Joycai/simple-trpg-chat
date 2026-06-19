import { EventEmitter } from "events";

// Next.js HMR workaround: persist eventHub on globalThis during development
declare global {
  var __eventHub: EventEmitter | undefined;
}

const eventHub = globalThis.__eventHub || new EventEmitter();
// Always persist — production needs shared emitter for SSE
globalThis.__eventHub = eventHub;

// Increased limit for rooms/clients
eventHub.setMaxListeners(1000);

export const broadcastToRoom = (roomId: number, data: unknown) => {
  eventHub.emit(`room:${roomId}`, data);
};

/** Emit an event only to connections belonging to a specific user (for private typing indicators etc.) */
export const emitToUser = (roomId: number, targetUserId: number, data: unknown) => {
  eventHub.emit(`room:${roomId}:user:${targetUserId}`, data);
};

export const subscribeToRoom = (roomId: number, callback: (data: unknown) => void) => {
  const eventName = `room:${roomId}`;
  eventHub.on(eventName, callback);
  return () => eventHub.off(eventName, callback);
};

/** Subscribe to events targeted at a specific user within a room */
export const subscribeToUser = (roomId: number, userId: number, callback: (data: unknown) => void) => {
  const eventName = `room:${roomId}:user:${userId}`;
  eventHub.on(eventName, callback);
  return () => eventHub.off(eventName, callback);
};
