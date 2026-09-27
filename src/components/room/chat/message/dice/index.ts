/**
 * Dice-message rendering for ChatMessage: the diceDetail payload shapes, the
 * theme-facing metadata (kind / grade / insanity), and the per-rule result
 * cards (plain, pool, 狩魂者 breakdown, COC bonus/penalty, d20 check).
 */
export { DiceResultDisplay } from "./DiceResultDisplay";
export { RollIcon } from "./DiceBits";
export { diceCardType, getRollKind, parseDiceMeta, type DiceDetailJson, type DiceMetaSource, type RollKind } from "./dice-types";
