import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILL_DEFINITIONS } from "../domain/catalogs";
import { getDerived, skillTotal, weaponValue } from "../domain/rules";
import { migrateLegacy } from "./migrateLegacy";
import { exportData, parseImport } from "./repository";

function legacy(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 3,
    name: "旧版调查员",
    age: "42",
    gender: "女",
    era: "1920s",
    occupationId: "private-investigator",
    occupationName: "私家侦探",
    residence: "阿卡姆",
    birthplace: "波士顿",
    attrs: {
      str: 55,
      con: 60,
      siz: 65,
      dex: 70,
      app: 50,
      int: 75,
      pow: 60,
      edu: 80,
    },
    derived: {
      hp: { current: "3", original: "15" },
      mp: { current: "0", original: "13" },
      san: { current: "0", original: "60" },
      luck: { current: "0", original: "0" },
      db: { current: "+1D4", original: "0" },
      build: { current: "1", original: "0" },
      mov: { current: "5", original: "8" },
    },
    weapons: [],
    possessions: "",
    assetCredit: "0",
    assetCash: "",
    assetSpending: "",
    assetDetails: "",
    story: "",
    notes: "",
    savedAt: "2026-09-05T13:10:00.000Z",
    source: "random",
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("legacy v3 migration", () => {
  it("keeps spent resources, initial luck zero, and manually changed derived values", () => {
    const { character: c, warnings } = migrateLegacy(
      legacy({ initialLuck: 0 }),
    );
    expect(c.resources).toEqual({ hp: 3, mp: 0, san: 0, luck: 0 });
    expect(c.initialLuck).toBe(0);
    expect(c.attrs).toEqual({
      str: 55,
      con: 60,
      siz: 65,
      dex: 70,
      app: 50,
      int: 75,
      pow: 60,
      edu: 80,
    });
    expect(c.creationAttrs).toEqual(c.attrs);
    expect(c.derivedOverrides).toEqual({
      hp: 15,
      mp: 13,
      db: "+1D4",
      build: 1,
      mov: 5,
    });
    expect(getDerived(c)).toEqual({
      hp: 15,
      mp: 13,
      db: "+1D4",
      build: 1,
      mov: 5,
      sanMax: 99,
    });
    expect(c.derivedOverrides.sanMax).toBeUndefined();
    expect(c.notes).toContain("旧版当前值／原始值");
    expect(c.notes).toContain('"original": "60"');
    expect(c.notes).toContain('"original": "8"');
    expect(c.notes).toContain('"original": "0"');
    expect(warnings).toEqual(c.warnings);
    expect(warnings.some((warning) => warning.includes("原始 SAN"))).toBe(true);
  });

  it("migrates standard skills by name, preserves unknown custom skills and growth", () => {
    const { character: c } = migrateLegacy(
      legacy({
        skills: [
          {
            id: "base-52",
            name: "侦查",
            base: 25,
            occupationPoints: 30,
            interestPoints: 10,
            growthPoints: 8,
            occupationSelected: true,
          },
          {
            id: "old-custom-1",
            name: "科学（古生物学）",
            base: 1,
            occupationPoints: 12,
            interestPoints: 5,
            growthPoints: 3,
            occupationSelected: true,
          },
          { name: "克苏鲁神话", base: 0, value: "12" },
          { name: "闪避", base: 35, growthPoints: 4 },
          {
            name: "母语",
            base: 80,
            occupationPoints: 0,
            interestPoints: 0,
            growthPoints: 0,
          },
        ],
      }),
    );
    const spot = c.skills.find((skill) => skill.name === "侦查")!;
    expect(spot.id).toBe(
      SKILL_DEFINITIONS.find((skill) => skill.name === "侦查")!.id,
    );
    expect(spot).toMatchObject({
      base: 25,
      occupationPoints: 30,
      interestPoints: 10,
      growthPoints: 8,
      occupationSelected: true,
      custom: false,
    });
    expect(skillTotal(spot, c)).toBe(73);
    expect(
      c.skills.find((skill) => skill.name === "科学（古生物学）"),
    ).toMatchObject({
      custom: true,
      occupationPoints: 12,
      interestPoints: 5,
      growthPoints: 3,
    });
    expect(c.skills.find((skill) => skill.name === "克苏鲁神话")).toMatchObject(
      { growthPoints: 12 },
    );
    expect(getDerived(c).sanMax).toBe(87);
    expect(c.skills.find((skill) => skill.name === "闪避")).toMatchObject({
      base: 35,
      baseType: "dodge",
      growthPoints: 4,
    });
    expect(c.skills.find((skill) => skill.name === "母语")).toMatchObject({
      base: 80,
      baseType: "ownLanguage",
    });
  });

  it("derives old total-only growth without double-counting allocated points", () => {
    const { character: c } = migrateLegacy(
      legacy({
        skills: [
          {
            name: "侦查",
            base: 25,
            occupationPoints: 20,
            interestPoints: 5,
            value: 57,
          },
        ],
      }),
    );
    const spot = c.skills.find((skill) => skill.name === "侦查")!;
    expect(spot.growthPoints).toBe(7);
    expect(skillTotal(spot, c)).toBe(57);
  });

  it("keeps a nonstandard dynamic base and duplicate rows instead of dropping them", () => {
    const { character: c, warnings } = migrateLegacy(
      legacy({
        skills: [
          { name: "闪避", base: 18, growthPoints: 2 },
          { name: "侦查", base: 25, growthPoints: 3 },
          { name: "侦查", base: 5, growthPoints: 4 },
        ],
      }),
    );
    const dodge = c.skills.find((skill) => skill.name === "闪避")!;
    expect(dodge.baseType).toBeUndefined();
    expect(skillTotal(dodge, c)).toBe(20);
    const duplicates = c.skills.filter((skill) => skill.name === "侦查");
    expect(duplicates).toHaveLength(2);
    expect(new Set(duplicates.map((skill) => skill.id)).size).toBe(2);
    expect(duplicates[1].custom).toBe(true);
    expect(warnings.join(" ")).toMatch(/手填基础值/);
    expect(warnings.join(" ")).toMatch(/重复项/);
  });

  it("preserves manually entered weapon percentages and links matching values to skills", () => {
    const { character: c } = migrateLegacy(
      legacy({
        skills: [
          {
            name: "格斗（斗殴）",
            base: 25,
            occupationPoints: 20,
            growthPoints: 5,
          },
        ],
        weapons: [
          {
            name: "徒手",
            skill: "格斗（斗殴）",
            value: "50",
            damage: "1D3+DB",
            range: "接触",
            ammo: "—",
            malfunction: "—",
          },
          {
            name: "特殊武器",
            skill: "格斗（斗殴）",
            value: "0",
            damage: "1D6",
            range: "接触",
            ammo: 0,
            malfunction: 100,
          },
          { name: "未知武器", skill: "异界武器", value: 23, damage: "2D6" },
        ],
      }),
    );
    expect(c.weapons[0]).toMatchObject({
      manualValue: null,
      skillId: "fighting-brawl",
    });
    expect(c.weapons[1]).toMatchObject({
      manualValue: 0,
      skillId: "fighting-brawl",
      ammo: "0",
      malfunction: "100",
    });
    expect(c.weapons[2]).toMatchObject({
      manualValue: 23,
      skillId: null,
      skillName: "异界武器",
    });
    expect(c.weapons.map((weapon) => weaponValue(weapon, c))).toEqual([
      50, 0, 23,
    ]);
  });

  it("retains all long text exactly and round trips the migrated character", () => {
    const story =
      "<img src=x onerror=alert(1)>\n" + "调查员生平。".repeat(2_000);
    const notes = "旧笔记。".repeat(2_000);
    const description = "神秘外貌。".repeat(1_000);
    const assets = "资产细节。".repeat(1_000);
    const possessions = "随身物品。".repeat(1_000);
    const { character: c } = migrateLegacy(
      legacy({
        story,
        notes,
        personalDescription: description,
        assetDetails: assets,
        possessions,
      }),
    );
    expect(c.story).toBe(story);
    expect(c.notes.startsWith(notes)).toBe(true);
    expect(c.backstory.personalDescription).toBe(description);
    expect(c.assetDetails).toBe(assets);
    expect(c.possessions).toBe(possessions);
    expect(
      parseImport(JSON.parse(JSON.stringify(exportData([c])))).characters,
    ).toEqual([c]);
  });

  it("preserves empty skills and weapons, but fills missing arrays with deterministic defaults", () => {
    const empty = migrateLegacy(legacy({ skills: [], weapons: [] })).character;
    expect(empty.skills).toEqual([]);
    expect(empty.weapons).toEqual([]);
    const raw = legacy();
    delete raw.weapons;
    const missing = migrateLegacy(raw).character;
    expect(missing.skills.length).toBe(SKILL_DEFINITIONS.length);
    expect(missing.skills.find((skill) => skill.name === "闪避")?.base).toBe(
      35,
    );
    expect(missing.weapons).toHaveLength(1);
  });

  it("warns on divergent manual credit and preserves it in asset details", () => {
    const { character: c, warnings } = migrateLegacy(
      legacy({
        assetCredit: "41",
        assetDetails: "旧资产记录",
        skills: [
          { name: "信用评级", base: 0, occupationPoints: 12, growthPoints: 3 },
        ],
      }),
    );
    expect(c.assetDetails).toContain("旧资产记录");
    expect(c.assetDetails).toContain("旧版手填信用评级：41");
    expect(c.assetDetails).toContain("技能值：15");
    expect(warnings.join(" ")).toContain("不同");
    expect(
      c.skills.find((skill) => skill.name === "信用评级")?.occupationPoints,
    ).toBe(12);
  });

  it("retains unknown occupation names as custom and creates no age rerolls", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("No rerolls during migration");
    });
    const { character: c } = migrateLegacy(
      legacy({
        occupationId: "unknown-trade",
        occupationName: "钟表修理师",
        age: "80",
      }),
    );
    expect(c.occupationId).toBe("custom");
    expect(c.customOccupationName).toBe("钟表修理师");
    expect(c.attrs.edu).toBe(80);
    expect(c.rules.ageAdjustments).toBe(false);
    expect(c.ageAdjusted).toBe(false);
    expect(random).not.toHaveBeenCalled();
  });

  it("keeps zero scalar derived values and an explicit initialLuck separate from current luck", () => {
    const { character: c } = migrateLegacy(
      legacy({
        initialLuck: "0",
        derived: {
          hp: 0,
          mp: 0,
          san: 0,
          luck: { current: 12, original: 45 },
          db: 0,
          build: 0,
          mov: 0,
        },
      }),
    );
    expect(c.resources).toEqual({ hp: 0, mp: 0, san: 0, luck: 12 });
    expect(c.initialLuck).toBe(0);
    expect(c.derivedOverrides.hp).toBe(0);
    expect(c.derivedOverrides.mp).toBe(0);
    expect(c.derivedOverrides.mov).toBe(0);
    expect(c.notes).toContain('"original": 45');
  });

  it.each(["55junk", "Infinity", "NaN", "", "5.5", null, Number.NaN, Infinity])(
    "rejects invalid legacy attribute numbers %#",
    (value) => {
      const raw = legacy();
      (raw.attrs as Record<string, unknown>).str = value;
      expect(() => migrateLegacy(raw)).toThrow();
    },
  );

  it.each([
    { skills: [{ name: "侦查", occupationPoints: "10x" }] },
    { skills: [{ name: "侦查", growthPoints: Infinity }] },
    { skills: "bad" },
    { weapons: {} },
    { weapons: [{ name: "手枪", skill: "射击（手枪）", value: "NaN" }] },
    { derived: { hp: { current: "0", original: "NaN" } } },
    { derived: { mov: { current: "Infinity", original: 8 } } },
    { derived: { db: { current: "+1D4", original: "javascript:evil" } } },
    { derived: { hp: null } },
    { derived: { mp: { current: null, original: 13 } } },
    { derived: { db: { current: "+1D4", original: null } } },
    { assetCredit: "50credits" },
    { age: "40 years" },
  ])("rejects invalid numbers or malformed nested arrays %#", (overrides) => {
    expect(() => migrateLegacy(legacy(overrides))).toThrow();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "https://example.com/portrait.svg",
    "https://example.com/portrait.html",
    "data:image/png;base64,PHN2Zz48L3N2Zz4=",
    "blob:https://example.com/123",
  ])("rejects unsafe legacy portrait %#", (value) => {
    expect(() => migrateLegacy(legacy({ portrait: value }))).toThrow();
  });

  it("imports through the public format detector without touching browser storage", () => {
    const result = parseImport(legacy());
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].schemaVersion).toBe(4);
    expect(result.warnings).toEqual(result.characters[0].warnings);
  });
});
