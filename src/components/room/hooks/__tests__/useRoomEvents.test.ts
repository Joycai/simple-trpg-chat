import { afterEach, expect, it, vi } from "vitest";
import type { Message } from "@/components/room/types";
import { useRoomEvents } from "../useRoomEvents";

const { catchUp, useEffect } = vi.hoisted(() => ({
  catchUp: vi.fn(),
  useEffect: vi.fn<(effect: () => () => void) => void>(),
}));
vi.mock("react", () => ({ useEffect }));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/app/actions/messages", () => ({ catchUpMessagesAction: catchUp }));
vi.mock("@/components/room/chat/message/character-cache", () => ({}));

class MockStream {
  static current: MockStream;
  onopen = () => {};
  onerror = () => {};
  onmessage = (_event: { data: string }) => {};
  constructor() { MockStream.current = this; }
  close() {}
}

const row = (id: number): Message => ({
  id, roomId: 1, userId: 2, diceDetail: null, isPrivate: false, nickname: "Player", type: "text", audience: "everyone",
  content: `Message ${id}`, createdAt: "2026-11-09T00:00:00.000Z",
});
const noop = () => {};
let cleanup: (() => void) | undefined;

function connect() {
  vi.useFakeTimers();
  catchUp.mockReset().mockResolvedValue({ messages: [], truncated: false });
  vi.stubGlobal("EventSource", MockStream);
  vi.stubGlobal("window", { addEventListener: noop, removeEventListener: noop });
  vi.stubGlobal("document", { addEventListener: noop, removeEventListener: noop });
  vi.spyOn(console, "warn").mockImplementation(noop);
  useEffect.mockImplementation((effect) => { cleanup = effect(); });

  const messagesRef = { current: [row(100)] };
  // React is mocked above so the test can drive the effect and its cleanup.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useRoomEvents({
    roomId: 1, userId: 1, isHost: false,
    messagesRef, activeTabRef: { current: "public" },
    seenIdsRef: { current: new Set(["100"]) }, liveEnterRef: { current: new Map() },
    setMessages: (update) => {
      messagesRef.current = typeof update === "function" ? update(messagesRef.current) : update;
    },
    setStatus: noop, setPlayers: noop, setUnreadCounts: noop, setTypingBots: noop,
    setInventoryRefreshKey: noop, setEventsRefreshKey: noop, setOnlineUserIds: noop,
    setCharacterResources: noop, setCompletions: noop,
    onCharacterUpdatedRef: { current: noop },
  });
  MockStream.current.onopen();
  return messagesRef;
}

async function reconnect() {
  MockStream.current.onerror();
  await vi.advanceTimersByTimeAsync(1000);
  MockStream.current.onopen();
  await vi.advanceTimersByTimeAsync(0);
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("retries the failed page even if live messages arrive beyond the gap", async () => {
  const messages = connect();
  catchUp
    .mockResolvedValueOnce({ messages: [row(101)], truncated: true })
    .mockRejectedValueOnce(new Error("transient"))
    .mockResolvedValueOnce({ messages: [row(102), row(103), row(104)], truncated: false });

  await reconnect();
  MockStream.current.onmessage({ data: JSON.stringify(row(104)) });
  await vi.advanceTimersByTimeAsync(1000);

  expect(catchUp.mock.calls).toEqual([[1, 100], [1, 101], [1, 101]]);
  expect(messages.current.map((message) => message.id)).toEqual([100, 101, 102, 103, 104]);
});

it("continues into another batch when more than five pages are missing", async () => {
  const messages = connect();
  for (let first = 101; first <= 1301; first += 300) {
    catchUp.mockResolvedValueOnce({
      messages: Array.from({ length: 300 }, (_, index) => row(first + index)),
      truncated: true,
    });
  }
  catchUp.mockResolvedValueOnce({ messages: [row(1601)], truncated: false });

  await reconnect();
  await vi.advanceTimersByTimeAsync(1);
  expect(catchUp.mock.calls).toEqual([[1, 100], [1, 400], [1, 700], [1, 1000], [1, 1300], [1, 1600]]);
  expect(messages.current.map((message) => message.id)).toEqual(
    Array.from({ length: 1502 }, (_, index) => 100 + index),
  );
});

it("preserves the gap when a second connection drops during an in-flight page", async () => {
  const messages = connect();
  const firstResponse = Promise.withResolvers<{ messages: Message[]; truncated: boolean }>();
  catchUp
    .mockReturnValueOnce(firstResponse.promise)
    .mockResolvedValueOnce({ messages: [row(101), row(102)], truncated: false });

  await reconnect();
  MockStream.current.onmessage({ data: JSON.stringify(row(102)) });
  await reconnect();
  firstResponse.resolve({ messages: [row(101)], truncated: true });
  await vi.advanceTimersByTimeAsync(0);

  expect(catchUp.mock.calls).toEqual([[1, 100], [1, 100]]);
  expect(messages.current.map((message) => message.id)).toEqual([100, 101, 102]);
});
