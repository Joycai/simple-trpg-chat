import { EventEmitter } from "events";

// Next.js HMR workaround: persist eventHub on globalThis during development
declare global {
  var __eventHub: EventEmitter | undefined;
}

const eventHub = globalThis.__eventHub || new EventEmitter();

if (process.env.NODE_ENV !== "production") {
  globalThis.__eventHub = eventHub;
}

// Increased limit for rooms/clients
eventHub.setMaxListeners(1000);

export const broadcastToRoom = (roomId: number, data: any) => {
  eventHub.emit(`room:${roomId}`, data);
};

export const subscribeToRoom = (roomId: number, callback: (data: any) => void) => {
  const eventName = `room:${roomId}`;
  eventHub.on(eventName, callback);
  return () => eventHub.off(eventName, callback);
};
