import type { CheckResult } from "./types";

function randomDigit(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("随机数必须介于 0（含）和 1（不含）之间。");
  }
  return value;
}

/** Positive bonus adds bonus tens dice; negative bonus adds penalty tens dice. */
export function rollCheck(
  target: number,
  bonus = 0,
  rng: () => number = Math.random,
): CheckResult {
  if (!Number.isFinite(target) || target < 0 || target > 99_999) {
    throw new RangeError("检定目标必须是 0–99999 之间的有限数值。");
  }
  if (!Number.isInteger(bonus) || Math.abs(bonus) > 2) {
    throw new RangeError("奖励骰或惩罚骰最多 2 个。");
  }
  const normalizedTarget = Math.floor(target);
  const units = Math.floor(randomDigit(rng) * 10);
  const tens = Array.from({ length: 1 + Math.abs(bonus) }, () =>
    Math.floor(randomDigit(rng) * 10),
  );
  const candidates = tens.map((ten) => ten * 10 + units || 100);
  const roll = bonus >= 0 ? Math.min(...candidates) : Math.max(...candidates);
  let outcome: string;
  if (roll === 1) outcome = "大成功";
  else if (roll === 100 || (normalizedTarget < 50 && roll >= 96))
    outcome = "大失败";
  else if (roll <= Math.floor(normalizedTarget / 5)) outcome = "极难成功";
  else if (roll <= Math.floor(normalizedTarget / 2)) outcome = "困难成功";
  else if (roll <= normalizedTarget) outcome = "普通成功";
  else outcome = "失败";
  return {
    roll,
    candidates,
    units,
    tens,
    target: normalizedTarget,
    outcome,
    success: outcome !== "失败" && outcome !== "大失败",
    bonus,
  };
}

/** Evaluates only signed sums of dice and integer constants, never JavaScript. */
export function rollDice(
  expression: string,
  rng: () => number = Math.random,
): { total: number; rolls: number[]; expression: string } {
  if (typeof expression !== "string" || expression.length > 256) {
    throw new Error("骰式过长；最多 256 个字符。");
  }
  const normalized = expression.replace(/\s+/g, "").toUpperCase();
  if (
    !normalized ||
    !/^[+-]?(?:\d*D\d+|\d+)(?:[+-](?:\d*D\d+|\d+))*$/.test(normalized)
  ) {
    throw new Error("骰式应如 1D100、2D6+6 或 1D6-1D4，不支持其他运算。");
  }
  const terms = normalized.match(/[+-]?(?:\d*D\d+|\d+)/g)!;
  if (terms.length > 32) throw new Error("骰式最多包含 32 项。");
  const parsed = terms.map((term) => {
    const sign = term.startsWith("-") ? -1 : 1;
    const unsigned = term.replace(/^[+-]/, "");
    const match = /^(\d*)D(\d+)$/.exec(unsigned);
    if (match) {
      const count = match[1] ? Number(match[1]) : 1;
      const sides = Number(match[2]);
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 100 ||
        !Number.isSafeInteger(sides) ||
        sides < 2 ||
        sides > 1000
      ) {
        throw new RangeError("每项为 1–100 颗、2–1000 面的骰子。");
      }
      return { sign, count, sides, constant: 0 };
    }
    const constant = Number(unsigned);
    if (!Number.isSafeInteger(constant) || constant > 1_000_000) {
      throw new RangeError("骰式常数不得超过 1000000。");
    }
    return { sign, count: 0, sides: 0, constant };
  });
  if (parsed.reduce((sum, term) => sum + term.count, 0) > 100) {
    throw new RangeError("一次最多投掷 100 颗骰子。");
  }
  const rolls: number[] = [];
  let total = 0;
  for (const term of parsed) {
    total += term.sign * term.constant;
    for (let index = 0; index < term.count; index += 1) {
      const roll = Math.floor(randomDigit(rng) * term.sides) + 1;
      // Keep physical faces positive; expression retains each term's sign.
      rolls.push(roll);
      total += term.sign * roll;
    }
  }
  return { total, rolls, expression: normalized };
}
