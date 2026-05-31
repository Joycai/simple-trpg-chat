import { EventEmitter } from "events";

// Global event emitter for the server instance
const eventHub = new EventEmitter();

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
