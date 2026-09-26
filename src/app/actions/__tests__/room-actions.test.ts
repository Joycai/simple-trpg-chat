import { describe, it, expect, vi, beforeEach } from "vitest";

// The room/member write actions return `{ success, error }` with a localized
// error instead of throwing (Next.js redacts thrown messages in production).

const tryRoomAccess = vi.fn();
vi.mock("@/lib/auth/room-access", () => ({
  tryRoomAccess: (...a: unknown[]) => tryRoomAccess(...a),
}));
let session: { user: { id: string; role: string; name?: string } } | null = null;
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string, params?: Record<string, unknown>) =>
    params ? `${ns}.${key}:${JSON.stringify(params)}` : `${ns}.${key}`),
}));

/** Rows each successive `db.select()` resolves to, in call order. */
let selectQueue: unknown[][] = [];
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "set", "values", "returning"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows()).then(resolve, reject);
  return c;
}
const update = vi.fn(() => chain(() => []));
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    update: () => update(),
    insert: () => chain(() => [{ id: 1 }]),
  },
}));

import {
  updateNicknameAction, updateRoomMemberColorAction, updateRoomSettingsAction,
  updateRoomNameAction, setRoomFrozenAction, regenerateRoomPasswordAction, uploadAvatarAction,
  joinRoomAction, createRoomAction,
} from "../room";
import { NICKNAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH } from "@/lib/room/limits";

const NO_ACCESS = { success: false, error: "roomActions.errorNoAccess" };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  session = { user: { id: "2", role: "player" } };
  tryRoomAccess.mockResolvedValue({ userId: 2, isHost: false, isAdmin: false });
});

describe("updateNicknameAction", () => {
  it("rejects a caller without write access", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await updateNicknameAction(5, "bob")).toEqual(NO_ACCESS);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an over-long nickname", async () => {
    expect(await updateNicknameAction(5, "n".repeat(NICKNAME_MAX_LENGTH + 1)))
      .toEqual({ success: false, error: `room.errorInvalidNickname:{"max":${NICKNAME_MAX_LENGTH}}` });
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a valid nickname", async () => {
    expect(await updateNicknameAction(5, " bob ")).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("updateRoomMemberColorAction", () => {
  it("rejects a player in a frozen room", async () => {
    selectQueue = [[{ id: 5, hostId: 1, frozen: true }]];
    expect(await updateRoomMemberColorAction(5, 2, "#fff")).toEqual(NO_ACCESS);
  });

  it("refuses to recolor another human member", async () => {
    selectQueue = [[{ id: 5, hostId: 2, frozen: false }], [{ isBot: false }]];
    expect(await updateRoomMemberColorAction(5, 3, "#fff"))
      .toEqual({ success: false, error: "room.errorColorNotAllowed" });
    expect(update).not.toHaveBeenCalled();
  });

  it("recolors the caller", async () => {
    selectQueue = [[{ id: 5, hostId: 1, frozen: false }]];
    expect(await updateRoomMemberColorAction(5, 2, "#fff")).toEqual({ success: true });
  });
});

describe("host room settings", () => {
  it("updateRoomSettingsAction rejects a non-host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await updateRoomSettingsAction(5, form({}))).toEqual(NO_ACCESS);
  });

  it("updateRoomSettingsAction rejects an unknown theme", async () => {
    expect(await updateRoomSettingsAction(5, form({ theme: "neon" })))
      .toEqual({ success: false, error: "room.errorInvalidSettings" });
    expect(update).not.toHaveBeenCalled();
  });

  it("updateRoomSettingsAction saves defaults", async () => {
    expect(await updateRoomSettingsAction(5, form({}))).toEqual({ success: true });
  });

  it("updateRoomNameAction rejects an over-long name", async () => {
    expect(await updateRoomNameAction(5, "r".repeat(ROOM_NAME_MAX_LENGTH + 1)))
      .toEqual({ success: false, error: `room.errorInvalidRoomName:{"max":${ROOM_NAME_MAX_LENGTH}}` });
  });

  it("updateRoomNameAction saves a valid name", async () => {
    expect(await updateRoomNameAction(5, " Tavern ")).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("setRoomFrozenAction freezes for the host", async () => {
    expect(await setRoomFrozenAction(5, true)).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("setRoomFrozenAction rejects a non-host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await setRoomFrozenAction(5, true)).toEqual(NO_ACCESS);
    expect(update).not.toHaveBeenCalled();
  });

  it("regenerateRoomPasswordAction returns the new key", async () => {
    const res = await regenerateRoomPasswordAction(5);
    expect(res.success).toBe(true);
    expect(res.success && res.secretKey).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("uploadAvatarAction", () => {
  it("rejects a caller without write access", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await uploadAvatarAction(5, "data:image/jpeg;base64,")).toEqual(NO_ACCESS);
  });

  it("rejects an oversized payload", async () => {
    const huge = "data:image/jpeg;base64," + "A".repeat(2_000_000);
    expect(await uploadAvatarAction(5, huge)).toEqual({ success: false, error: "room.errorAvatarTooLarge" });
  });

  it("rejects a non-JPEG payload", async () => {
    expect(await uploadAvatarAction(5, "data:image/svg+xml;base64,PHN2Zz4="))
      .toEqual({ success: false, error: "room.errorAvatarInvalid" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("lobby actions", () => {
  it("joinRoomAction reports a wrong key", async () => {
    selectQueue = [[{ id: 5, secretKey: "abc" }]];
    expect(await joinRoomAction(form({ roomId: "5", key: "xyz" })))
      .toEqual({ success: false, error: "lobby.errorInvalidKey" });
  });

  it("joinRoomAction joins with the right key", async () => {
    selectQueue = [[{ id: 5, secretKey: "abc", ruleTemplate: "basic" }], []];
    expect(await joinRoomAction(form({ roomId: "5", key: "abc" }))).toEqual({ success: true });
  });

  it("createRoomAction creates a room for a host", async () => {
    session = { user: { id: "1", role: "host", name: "KP" } };
    const res = await createRoomAction(form({ name: "Tavern", key: "k1" }));
    expect(res).toEqual({ success: true, roomId: 1, secretKey: "k1" });
  });

  it("createRoomAction refuses a player", async () => {
    expect(await createRoomAction(form({ name: "r" })))
      .toEqual({ success: false, error: "createRoom.errorHostOnly" });
  });
});
