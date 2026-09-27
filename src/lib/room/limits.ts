// Length caps shared by the room editors and the actions that validate them,
// so an input's maxLength and the server check can't drift apart.
// Dependency-free: safe to import from client components.

/** Max room name length — lobby create form, RoomInfoPanel / RoomTopBar inputs,
 *  createRoomAction and updateRoomNameAction. */
export const ROOM_NAME_MAX_LENGTH = 100;

/** Max per-room nickname length — CharacterPanel's nickname input and
 *  updateNicknameAction. */
export const NICKNAME_MAX_LENGTH = 50;

/** Max chat message length — enforced by sendMessageAction. */
export const MESSAGE_MAX_LENGTH = 10000;
