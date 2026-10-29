import { describe, expect, it } from "vitest";
import { rollCheck, rollDice } from "./checks";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    if (index === values.length) throw new Error("unexpected random draw");
    return values[index++];
  };
}
function checkAt(roll: number, target: number) {
  const value = roll === 100 ? 0 : roll;
  return rollCheck(
    target,
    0,
    sequence([(value % 10) / 10, Math.floor(value / 10) / 10]),
  );
}

describe("percentile checks", () => {
  it.each([
    [1, 0, "大成功", true],
    [10, 50, "极难成功", true],
    [11, 50, "困难成功", true],
    [25, 50, "困难成功", true],
    [26, 50, "普通成功", true],
    [50, 50, "普通成功", true],
    [51, 50, "失败", false],
    [95, 49, "失败", false],
    [96, 49, "大失败", false],
    [96, 50, "失败", false],
    [100, 99, "大失败", false],
    [100, 999, "大失败", false],
  ])("roll %i versus %i yields %s", (roll, target, outcome, success) => {
    expect(checkAt(roll, target)).toMatchObject({
      roll,
      target,
      outcome,
      success,
    });
  });

  it("shares units and treats 00 as 100 when choosing bonus/penalty dice", () => {
    const bonus = rollCheck(50, 1, sequence([0, 0, 0.1]));
    expect(bonus).toMatchObject({
      units: 0,
      candidates: [100, 10],
      roll: 10,
      bonus: 1,
    });
    const penalty = rollCheck(50, -1, sequence([0, 0, 0.1]));
    expect(penalty).toMatchObject({
      candidates: [100, 10],
      roll: 100,
      outcome: "大失败",
    });
    expect(rollCheck(50, 2, sequence([0.7, 0.8, 0.2, 0.9])).candidates).toEqual(
      [87, 27, 97],
    );
  });

  it("handles 01 and 100 precisely and rejects unsupported bonus or invalid RNG", () => {
    expect(checkAt(1, 1).outcome).toBe("大成功");
    expect(checkAt(100, 100).outcome).toBe("大失败");
    for (const bonus of [3, -3, 0.5, NaN])
      expect(() => rollCheck(50, bonus)).toThrow();
    for (const value of [-0.1, 1, Infinity, NaN])
      expect(() => rollCheck(50, 0, () => value)).toThrow();
    for (const target of [NaN, Infinity, -1, 100_000])
      expect(() => rollCheck(target)).toThrow();
  });
});

describe("safe dice expressions", () => {
  it("supports additive dice, constants, signed terms, omitted count and case/spacing", () => {
    expect(rollDice(" 2d6 + 6 ", sequence([0, 0.999]))).toEqual({
      total: 13,
      rolls: [1, 6],
      expression: "2D6+6",
    });
    expect(rollDice("D100", () => 0)).toEqual({
      total: 1,
      rolls: [1],
      expression: "D100",
    });
    expect(rollDice("1D6-1D4+2", sequence([0.999, 0.999]))).toMatchObject({
      total: 4,
      rolls: [6, 4],
    });
    expect(rollDice("-1D6+7", () => 0.999).total).toBe(1);
    expect(rollDice("12").total).toBe(12);
  });

  it.each([
    "",
    "D",
    "0D6",
    "1D0",
    "1D1",
    "101D6",
    "1D1001",
    "50D6+51D6",
    "2D6*5",
    "1D6/0",
    "2D6+DB",
    "alert(1)",
    "1;globalThis.hacked=1",
    "1D6++2",
    "1D6+NaN",
    "1000001",
  ])("rejects %s without evaluating or silently truncating", (expression) => {
    expect(() => rollDice(expression)).toThrow();
  });

  it("enforces size quotas and valid RNG before expensive work", () => {
    expect(() => rollDice("1".repeat(257))).toThrow();
    expect(() => rollDice(Array(34).fill("1").join("+"))).toThrow();
    expect(() => rollDice("1D6", () => 1)).toThrow();
    const exact = rollDice("100D6", () => 0);
    expect(exact.rolls).toHaveLength(100);
    expect(exact.total).toBe(100);
  });
});
