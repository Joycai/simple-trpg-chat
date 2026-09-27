import { diceCardType, getRollKind, parseDiceMeta, type DiceDetailJson, type DiceMetaSource, type RollKind } from "./dice";

export type DiceAnnouncer = { userId: number; nickname: string; quip?: string; quipPending?: boolean };

/** What a dice bubble needs from its diceDetail: theme metadata, the command
 *  echo and roll kind lifted out of the bubble, which card layout (if any),
 *  and the proxy / 投娘 annotations. */
export interface DiceView {
  meta: ReturnType<typeof parseDiceMeta>;
  commandEcho: string | null;
  rollKind: RollKind;
  cardKind: "sanity" | "breakdown" | "pool" | "bp" | "d20" | null;
  proxyNick: string | null;
  announcer: DiceAnnouncer | null;
}

export function deriveDiceView(parsedDetail: Record<string, unknown> | null): DiceView {
  const diceMeta = parseDiceMeta(parsedDetail as DiceMetaSource);
  // Extract command echo + roll kind from diceDetail so they can be lifted out
  // of the bubble: echo into the header line, kind onto a data-attr for theming.
  let diceCommandEcho: string | null = null;
  let diceRollKind: RollKind = "plain";
  let diceCardKind: DiceView["cardKind"] = null;
  let diceProxyNick: string | null = null;
  let diceAnnouncer: DiceAnnouncer | null = null;
  if (parsedDetail) {
    const d = parsedDetail as DiceDetailJson & {
      proxiedByNickname?: string;
      announcer?: DiceAnnouncer;
    };
    if (typeof d.command === "string" && d.command.trim()) {
      diceCommandEcho = d.command.trim();
    }
    diceRollKind = getRollKind(d);
    diceCardKind = diceCardType(d);
    if (typeof d.proxiedByNickname === "string" && d.proxiedByNickname) {
      diceProxyNick = d.proxiedByNickname;
    }
    if (d.announcer) {
      diceAnnouncer = d.announcer;
    }
  }
  return {
    meta: diceMeta,
    commandEcho: diceCommandEcho,
    rollKind: diceRollKind,
    cardKind: diceCardKind,
    proxyNick: diceProxyNick,
    announcer: diceAnnouncer,
  };
}
