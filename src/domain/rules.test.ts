import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGE_RULES,
  applyInitialAgeAdjustments,
  createCharacter,
  DEFAULT_ATTRIBUTES,
  getBudgets,
  getCredit,
  getDerived,
  initializeAttributes,
  occupationName,
  skillMatchesReference,
  skillTotal,
  validateCreation,
  weaponValue,
} from "./rules";
import { autoAllocate, selectOccupation } from "./allocation";
import type { Character } from "./types";

function byName(c: Character, name: string) {
  const skill = c.skills.find((item) => item.name === name);
  if (!skill) throw new Error(`Missing skill ${name}`);
  return skill;
}

afterEach(() => vi.restoreAllMocks());

describe("initial character generation", () => {
  it("starts a manual card with balanced defaults and an empty background", () => {
    const c = createCharacter();
    expect(c).toMatchObject({
      method: "manual",
      phase: "draft",
      age: 28,
      name: "",
      occupationId: "",
      ageAdjusted: false,
      initialLuck: 50,
    });
    expect(c.attrs).toEqual(DEFAULT_ATTRIBUTES);
    expect(c.creationAttrs).toEqual(DEFAULT_ATTRIBUTES);
    expect(c.creationAttrs).not.toBe(c.attrs);
    expect(c.resources).toEqual({ hp: 11, mp: 10, san: 50, luck: 50 });
    expect(Object.values(c.backstory).every((value) => value === "")).toBe(
      true,
    );
    expect(c.story).toBe("");
    expect(c.weapons[0]).toMatchObject({
      name: "徒手格斗",
      skillId: "fighting-brawl",
      manualValue: null,
    });
  });

  it("keeps a concept card as a placeholder until the AI proposal", () => {
    const c = createCharacter({
      method: "concept",
      age: 80,
      concept: "退休的调查记者",
    });
    expect(c.attrs).toEqual(DEFAULT_ATTRIBUTES);
    expect(c.ageAdjusted).toBe(false);
    expect(c.concept).toBe("退休的调查记者");
    expect(c.story).toBe("");
  });

  it("does not share mutable data across newly created characters", () => {
    const a = createCharacter();
    const b = createCharacter();
    a.attrs.str = 99;
    a.skills[0].occupationPoints = 20;
    a.backstory.traits = "谨慎";
    expect(b.attrs.str).toBe(50);
    expect(b.skills[0].occupationPoints).toBe(0);
    expect(b.backstory.traits).toBe("");
    expect(a.id).not.toBe(b.id);
  });

  it("uses actual dice for random attributes and retains the pre-age audit", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const c = createCharacter({ method: "random", ageAdjustments: false });
    expect(c.attrs).toEqual({
      str: 15,
      con: 15,
      siz: 40,
      dex: 15,
      app: 15,
      int: 40,
      pow: 15,
      edu: 40,
    });
    expect(c.creationAttrs).toEqual(c.attrs);
    expect(c.initialLuck).toBe(15);
    expect(c.resources).toEqual({ hp: 5, mp: 3, san: 15, luck: 15 });
    expect(c.ageAudit.filter((line) => /骰面/.test(line))).toHaveLength(9);
    expect(c.ageAudit.some((line) => /未应用年龄/.test(line))).toBe(true);
  });

  it("initializes current resources from attributes after aging", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const c = createCharacter({ method: "random", age: 60 });
    expect(c.creationAttrs).toEqual({
      str: 90,
      con: 90,
      siz: 90,
      dex: 90,
      app: 90,
      int: 90,
      pow: 90,
      edu: 90,
    });
    expect(c.attrs.str + c.attrs.con + c.attrs.dex).toBe(250);
    expect(c.attrs.app).toBe(75);
    expect(c.attrs.edu).toBe(99);
    expect(c.resources.hp).toBe(Math.floor((c.attrs.con + c.attrs.siz) / 10));
    expect(c.resources.mp).toBe(18);
    expect(c.resources.san).toBe(90);
    expect(c.resources.luck).toBe(90);
    expect(c.ageAdjusted).toBe(true);
  });

  it.each([0, 151, 1.5, Number.NaN])("rejects invalid age %s", (age) => {
    expect(() => createCharacter({ method: "manual", age })).toThrow();
  });
  it.each([0, 100, 75.5, Number.POSITIVE_INFINITY])(
    "rejects invalid skill cap %s",
    (skillCap) => {
      expect(() => createCharacter({ method: "manual", skillCap })).toThrow();
    },
  );
});

describe("age adjustments and one-time proposal initialization", () => {
  it.each([
    [19, 0],
    [20, 1],
    [29, 1],
    [30, 1],
    [39, 1],
    [40, 2],
    [49, 2],
    [50, 3],
    [59, 3],
    [60, 4],
    [69, 4],
    [70, 4],
    [79, 4],
    [80, 4],
    [120, 4],
    [150, 4],
  ])("age %i makes %i education improvement checks", (age, count) => {
    const c = createCharacter({ method: "manual", age });
    const adjusted = applyInitialAgeAdjustments(c, () => 0);
    expect(
      adjusted.ageAudit.filter((line) => line.startsWith("教育增强")),
    ).toHaveLength(count);
    expect(
      AGE_RULES.find((rule) => age >= rule.min && age <= rule.max)?.eduChecks,
    ).toBe(count);
  });

  it("keeps the first luck roll and records the young investigator second roll", () => {
    const c = createCharacter({ method: "manual", age: 19 });
    const adjusted = applyInitialAgeAdjustments(c, () => 0.9999);
    expect(adjusted.attrs).toMatchObject({ str: 50, siz: 60, edu: 60 });
    expect(adjusted.creationAttrs).toEqual(DEFAULT_ATTRIBUTES);
    expect(adjusted.initialLuck).toBe(50);
    expect(adjusted.resources.luck).toBe(90);
    expect(adjusted.ageAudit.some((line) => /50 \/ 90 → 90/.test(line))).toBe(
      true,
    );
    expect(c.attrs).toEqual(DEFAULT_ATTRIBUTES);
    expect(c.resources.luck).toBe(50);
  });

  it("does not apply age twice or heal spent resources on a later call", () => {
    const c = applyInitialAgeAdjustments(
      createCharacter({ method: "manual", age: 50 }),
      () => 0,
    );
    c.resources.hp = 1;
    c.resources.mp = 0;
    const unused = vi.fn();
    expect(applyInitialAgeAdjustments(c, unused)).toEqual(c);
    expect(unused).not.toHaveBeenCalled();
  });

  it("caps education gains at 99 without lowering existing house-rule education", () => {
    const c = createCharacter({ method: "manual", age: 60 });
    c.creationAttrs.edu = 98;
    expect(applyInitialAgeAdjustments(c, () => 0.999).attrs.edu).toBe(99);
    c.creationAttrs.edu = 150;
    expect(applyInitialAgeAdjustments(c, () => 0.999).attrs.edu).toBe(150);
  });

  it("does not drive tiny physical attributes below their floor and reports missing deduction capacity", () => {
    const c = createCharacter({ method: "manual", age: 80 });
    c.creationAttrs = { ...c.creationAttrs, str: 1, con: 1, dex: 1, app: 1 };
    const adjusted = applyInitialAgeAdjustments(c, () => 0);
    expect(adjusted.attrs).toMatchObject({ str: 1, con: 1, dex: 1, app: 1 });
    expect(adjusted.ageAudit.some((line) => /余下 80/.test(line))).toBe(true);
  });

  it("leaves under-15 investigators unchanged and records the rules exception", () => {
    const c = createCharacter({ method: "manual", age: 14 });
    const rng = vi.fn();
    const adjusted = applyInitialAgeAdjustments(c, rng);
    expect(adjusted.attrs).toEqual(DEFAULT_ATTRIBUTES);
    expect(adjusted.ageAdjusted).toBe(false);
    expect(adjusted.ageAudit.some((line) => /15 岁以下/.test(line))).toBe(true);
    expect(rng).not.toHaveBeenCalled();
  });

  it("initializes an AI proposal once and reuses identical proposals without rerolling", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.9999);
    const c = createCharacter({ method: "concept", age: 40 });
    const attrs = { ...DEFAULT_ATTRIBUTES, dex: 75, pow: 60 };
    const first = initializeAttributes(c, attrs, 45);
    const draws = random.mock.calls.length;
    first.resources.hp = 2;
    const second = initializeAttributes(first, attrs, 45);
    expect(second).toEqual(first);
    expect(random).toHaveBeenCalledTimes(draws);
    expect(first.creationAttrs).toEqual(attrs);
    expect(first.initialLuck).toBe(45);
    expect(first.resources.mp).toBe(12);
    expect(first.resources.luck).toBe(45);
    expect(byName(first, "闪避").base).toBe(Math.floor(first.attrs.dex / 2));
    expect(byName(first, "母语").base).toBe(first.attrs.edu);
  });

  it("replaces a changed proposal from raw attributes rather than aging previous values again", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const c = createCharacter({ method: "concept", age: 50 });
    const first = initializeAttributes(c, DEFAULT_ATTRIBUTES, 50);
    const changed = { ...DEFAULT_ATTRIBUTES, str: 80 };
    const second = initializeAttributes(first, changed, 60);
    expect(second.creationAttrs).toEqual(changed);
    expect(second.attrs.str + second.attrs.con + second.attrs.dex).toBe(170);
    expect(
      second.ageAudit.filter((line) => /年龄体能修正/.test(line)),
    ).toHaveLength(1);
    expect(second.initialLuck).toBe(60);
  });
});

describe("computed values and independent play resources", () => {
  it("calculates dynamic skill bases from current attributes and never applies the creation cap to growth", () => {
    const c = createCharacter();
    const dodge = byName(c, "闪避");
    const ownLanguage = byName(c, "母语");
    dodge.occupationPoints = 20;
    dodge.growthPoints = 40;
    c.attrs.dex = 89;
    c.attrs.edu = 95;
    expect(skillTotal(dodge, c)).toBe(104);
    expect(skillTotal(dodge)).toBe(85);
    expect(skillTotal(ownLanguage, c)).toBe(95);
  });

  it("uses 99 minus Mythos as max SAN, not current POW or current SAN", () => {
    const c = createCharacter();
    c.resources.san = 12;
    c.attrs.pow = 80;
    byName(c, "克苏鲁神话").growthPoints = 17;
    expect(getDerived(c)).toMatchObject({ sanMax: 82, mp: 16 });
    expect(c.resources.san).toBe(12);
    byName(c, "克苏鲁神话").growthPoints = 120;
    expect(getDerived(c).sanMax).toBe(0);
  });

  it.each([
    [64, "-2", -2],
    [65, "-1", -1],
    [84, "-1", -1],
    [85, "0", 0],
    [124, "0", 0],
    [125, "+1D4", 1],
    [164, "+1D4", 1],
    [165, "+1D6", 2],
    [204, "+1D6", 2],
    [205, "+2D6", 3],
    [284, "+2D6", 3],
    [285, "+3D6", 4],
  ])("STR+SIZ=%i yields DB %s and Build %i", (sum, db, build) => {
    const c = createCharacter();
    c.attrs.str = Math.floor(sum / 2);
    c.attrs.siz = sum - c.attrs.str;
    expect(getDerived(c)).toMatchObject({ db, build });
  });

  it.each([
    [40, 40, 50, 20, 7],
    [60, 60, 50, 20, 9],
    [50, 50, 50, 20, 8],
    [60, 40, 50, 20, 8],
    [60, 60, 50, 40, 8],
    [60, 60, 50, 50, 7],
    [60, 60, 50, 60, 6],
    [60, 60, 50, 70, 5],
    [60, 60, 50, 80, 4],
  ])(
    "derives movement from STR %i, DEX %i, SIZ %i and age %i",
    (str, dex, siz, age, mov) => {
      const c = createCharacter();
      c.attrs = { ...c.attrs, str, dex, siz };
      c.age = age;
      expect(getDerived(c).mov).toBe(mov);
    },
  );

  it("honors explicit legacy overrides without copying them to current resources", () => {
    const c = createCharacter();
    c.derivedOverrides = {
      hp: "22",
      mp: 14,
      sanMax: 90,
      db: "+2D6",
      build: -1,
      mov: "4",
    };
    const before = { ...c.resources };
    expect(getDerived(c)).toEqual({
      hp: 22,
      mp: 14,
      sanMax: 90,
      db: "+2D6",
      build: -1,
      mov: 4,
    });
    expect(c.resources).toEqual(before);
    c.derivedOverrides.hp = "自订备注";
    expect(getDerived(c).hp).toBe(11);
  });

  it("follows linked weapon skills and respects a manual override of zero", () => {
    const c = createCharacter();
    const weapon = c.weapons[0];
    byName(c, "格斗（斗殴）").growthPoints = 20;
    expect(weaponValue(weapon, c)).toBe(45);
    expect(weaponValue({ ...weapon, manualValue: 0 }, c)).toBe(0);
    expect(weaponValue({ ...weapon, skillId: "unknown-id" }, c)).toBe(45);
    expect(weaponValue({ ...weapon, skillId: null, skillName: "" }, c)).toBe(0);
  });

  it("keeps credit linked to the skill", () => {
    const c = createCharacter();
    byName(c, "信用评级").occupationPoints = 30;
    byName(c, "信用评级").growthPoints = 5;
    expect(getCredit(c)).toBe(35);
  });

  it("recomputes budgets from attributes rather than cached values", () => {
    const c = selectOccupation(createCharacter(), "criminal");
    c.attrs = { ...c.attrs, str: 80, dex: 90, edu: 70, int: 75 };
    expect(getBudgets(c)).toMatchObject({
      occupationTotal: 320,
      interestTotal: 150,
    });
    c.attrs.dex = 40;
    expect(getBudgets(c).occupationTotal).toBe(300);
  });

  it("freezes completed creation budgets while current attributes can grow", () => {
    const draft = selectOccupation(createCharacter(), "doctor");
    const c = {
      ...draft,
      phase: "ready" as const,
      creationAttrs: { ...draft.attrs },
    };
    const before = getBudgets(c);
    c.attrs = { ...c.attrs, edu: 95, int: 90 };
    expect(getBudgets(c)).toEqual(before);
    c.occupationId = "custom";
    c.customOccupationName = "法医顾问";
    expect(occupationName(c)).toBe("法医顾问");
    const science = byName(c, "科学（自选）");
    science.name = "科学（法医）";
    expect(skillMatchesReference(science, "科学（自选）")).toBe(true);
  });

  it("warns for creation point defects while allowing legitimate play growth", () => {
    const c = autoAllocate(
      selectOccupation(
        createCharacter({ method: "manual", ageAdjustments: false }),
        "doctor",
      ),
    );
    c.name = "调查员";
    byName(c, "医学").growthPoints = 300;
    expect(validateCreation(c)).toEqual([]);
    byName(c, "克苏鲁神话").interestPoints = 1;
    expect(
      validateCreation(c).some((warning) =>
        warning.includes("克苏鲁神话不能分配建卡点数"),
      ),
    ).toBe(true);
  });
});
