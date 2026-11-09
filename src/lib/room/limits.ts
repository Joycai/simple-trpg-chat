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

/** Dice panel bounds — shared by `rollDiceAction` and the pure rolling helpers.
 *  They match the `.r` expression parser's limits (100 dice, 1000 faces). */
export const MAX_DICE_COUNT = 100;
export const MAX_DICE_FACES = 1000;

/** History page sizes. Every read action clamps to these server-side; the
 *  client never gets to choose an unbounded `limit`. */
export const HISTORY_PAGE_LIMIT = 50;
export const HISTORY_PAGE_LIMIT_MAX = 100;
export const CATCH_UP_LIMIT = 300;
export const CATCH_UP_LIMIT_MAX = 500;
