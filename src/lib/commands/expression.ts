/**
 * Dice-expression evaluation (`3d100k2 + 2d20 - 1d6 + 5`) and the chat
 * message/diceDetail it produces, used by the command engine. Pure — no DB or
 * request context — so it is unit-tested directly.
 */

import { rollDie } from "@/lib/commands/dice";

export interface TermResult {
  type: "dice" | "constant";
  sign: "+" | "-";
  count: number;
  faces: number;
  keep?: number;
  rolls: number[];
  keptRolls: number[];
  sum: number;
  display: string;
}

/** Parse and roll complex dice expressions (e.g. 3d100k2 + 2d20 - 1d6 + 5) */
export function parseAndRollExpression(expr: string, t?: (key: string, opts?: Record<string, string | number | Date>) => string): {
  success: boolean;
  error?: string;
  terms: TermResult[];
  totalSum: number;
  display: string;
  notation: string;
} {
  const trimmed = expr.replace(/\s+/g, "");
  // Validate characters: only allow digits, d, k, +, -
  if (/[^0-9dkDK+-]/.test(trimmed)) {
    return {
      success: false,
      error: t ? t("invalidDiceExpression") : "Invalid dice expression",
      terms: [],
      totalSum: 0,
      display: "",
      notation: ""
    };
  }

  // Regex to find terms
  const termRegex = /([+-]?)(?:([0-9]*)d([0-9]+)(?:k([0-9]+))?|([0-9]+))/gi;
  const terms: TermResult[] = [];
  let totalSum = 0;

  let match;
  let lastIndex = 0;

  while ((match = termRegex.exec(trimmed)) !== null) {
    if (match.index !== lastIndex) {
      return {
        success: false,
        error: t ? t("invalidDiceExpression") : "Invalid dice expression",
        terms: [],
        totalSum: 0,
        display: "",
        notation: ""
      };
    }
    lastIndex = termRegex.lastIndex;

    const signStr = match[1];
    const sign: "+" | "-" = signStr === "-" ? "-" : "+";

    if (match[5] !== undefined) {
      // Constant term
      const val = parseInt(match[5]);
      terms.push({
        type: "constant",
        sign,
        count: 0,
        faces: 0,
        rolls: [],
        keptRolls: [],
        sum: val,
        display: val.toString()
      });
      totalSum = sign === "+" ? totalSum + val : totalSum - val;
    } else {
      // Dice term
      const countStr = match[2];
      const count = countStr ? parseInt(countStr) : 1;
      const faces = parseInt(match[3]);
      const keepStr = match[4];
      const keep = keepStr ? parseInt(keepStr) : undefined;

      if (count <= 0 || count > 100) {
        return {
          success: false,
          error: t ? t("diceCountRangeError") : "Dice count must be between 1 and 100",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }
      if (faces <= 0 || faces > 1000) {
        return {
          success: false,
          error: t ? t("diceFacesRangeError") : "Dice faces must be between 1 and 1000",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }
      if (keep !== undefined && (keep <= 0 || keep > count)) {
        return {
          success: false,
          error: t ? t("diceKeepRangeError") : "Keep count must be between 1 and total dice count",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }

      // Roll the dice
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(rollDie(faces));
      }

      let keptRolls = [...rolls];
      if (keep !== undefined) {
        // Sort descending and keep the highest `keep` rolls
        keptRolls.sort((a, b) => b - a);
        keptRolls = keptRolls.slice(0, keep);
      }

      const sum = keptRolls.reduce((a, b) => a + b, 0);
      totalSum = sign === "+" ? totalSum + sum : totalSum - sum;

      const keptLabel = t ? t("keptLabel") || "kept" : "kept";
      let termDisplay = "";
      if (keep !== undefined) {
        termDisplay = `${count}d${faces}k${keep}([${rolls.join(", ")}], ${keptLabel}[${keptRolls.join(", ")}])`;
      } else {
        termDisplay = `${count}d${faces}([${rolls.join(", ")}])`;
      }

      terms.push({
        type: "dice",
        sign,
        count,
        faces,
        keep,
        rolls,
        keptRolls,
        sum,
        display: termDisplay
      });
    }
  }

  if (lastIndex !== trimmed.length || terms.length === 0) {
    return {
      success: false,
      error: t ? t("invalidDiceExpression") : "Invalid dice expression",
      terms: [],
      totalSum: 0,
      display: "",
      notation: ""
    };
  }

  let notation = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const sign = term.sign;
    const termNotation = term.type === "constant"
      ? term.sum.toString()
      : `${term.count}d${term.faces}${term.keep !== undefined ? `k${term.keep}` : ""}`;

    if (i === 0) {
      notation += sign === "-" ? `-${termNotation}` : termNotation;
    } else {
      notation += ` ${sign} ${termNotation}`;
    }
  }

  let display = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (i === 0) {
      display += term.sign === "-" ? `-${term.display}` : term.display;
    } else {
      display += ` ${term.sign} ${term.display}`;
    }
  }

  return {
    success: true,
    terms,
    totalSum,
    display,
    notation
  };
}

/**
 * Format complex dice roll details for the message output.
 *
 * `highlightFace` (from the rule's `highlightDieFace` capability) is stamped
 * into the detail JSON of single-term rolls so the chat renderer can accent
 * matching dice without knowing the rule. Compound expressions persist
 * `results: []`, so there is nothing to highlight there — known limitation.
 *
 * Exported for direct unit testing.
 */
export function formatDiceRollMessage(
  notation: string,
  terms: TermResult[],
  totalSum: number,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  rawCommand?: string,
  highlightFace?: number
): { content: string; diceDetail: string } {
  // Structured, per-term breakdown persisted so the chat renderer can highlight
  // each term's dice count and (for kN rolls) which dice were kept — without
  // re-parsing the display string. Covers single AND compound expressions.
  const detailTerms = terms.map((tm) =>
    tm.type === "constant"
      ? { sign: tm.sign, constant: tm.sum }
      : {
          sign: tm.sign,
          count: tm.count,
          faces: tm.faces,
          ...(tm.keep !== undefined ? { keep: tm.keep } : {}),
          rolls: tm.rolls,
          keptRolls: tm.keptRolls,
        },
  );

  // If there's only one term and it's a dice term
  if (terms.length === 1 && terms[0].type === "dice") {
    const term = terms[0];
    const keptLabel = t("keptLabel");
    let content = "";
    if (term.keep !== undefined) {
      content = `🎲 ${term.count}d${term.faces}k${term.keep}: [${term.rolls.join(", ")}](${keptLabel}[${term.keptRolls.join(", ")}]) = ${totalSum}`;
    } else {
      content = `🎲 ${term.count}d${term.faces}: [${term.rolls.join(", ")}] = ${totalSum}`;
    }

    const detail = JSON.stringify({
      notation: term.keep !== undefined ? `${term.count}d${term.faces}k${term.keep}` : `${term.count}d${term.faces}`,
      sum: totalSum,
      results: term.rolls,
      keptRolls: term.keptRolls,
      terms: detailTerms,
      ...(highlightFace !== undefined ? { highlightFace } : {}),
      command: rawCommand,
    });

    return { content, diceDetail: detail };
  }

  // For compound or constant terms
  let notationStr = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const sign = term.sign;
    const termNotation = term.type === "constant"
      ? term.sum.toString()
      : `${term.count}d${term.faces}${term.keep !== undefined ? `k${term.keep}` : ""}`;

    if (i === 0) {
      notationStr += sign === "-" ? `-${termNotation}` : termNotation;
    } else {
      notationStr += ` ${sign} ${termNotation}`;
    }
  }

  let displayStr = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    let termDisplay = "";
    if (term.type === "constant") {
      termDisplay = term.sum.toString();
    } else {
      const keptLabel = t("keptLabel");
      if (term.keep !== undefined) {
        termDisplay = `${term.count}d${term.faces}k${term.keep}([${term.rolls.join(", ")}], ${keptLabel}[${term.keptRolls.join(", ")}])`;
      } else {
        termDisplay = `${term.count}d${term.faces}([${term.rolls.join(", ")}])`;
      }
    }

    if (i === 0) {
      displayStr += term.sign === "-" ? `-${termDisplay}` : termDisplay;
    } else {
      displayStr += ` ${term.sign} ${termDisplay}`;
    }
  }

  const content = `🎲 ${notationStr}: ${displayStr} = ${totalSum}`;

  const detail = JSON.stringify({
    notation: displayStr,
    sum: totalSum,
    results: [],
    terms: detailTerms,
    command: rawCommand,
  });

  return { content, diceDetail: detail };
}
