import { describe, expect, it } from "vitest";
import type { Character } from "./types";
import { OCCUPATIONS } from "./catalogs";
import { autoAllocate, selectOccupation } from "./allocation";
import {
  createCharacter,
  getBudgets,
  getCredit,
  isCreditSkill,
  isMythosSkill,
  skillBase,
  skillMatchesReference,
  validateCreation,
} from "./rules";

const make = () => ({
  ...createCharacter({ method: "manual", ageAdjustments: false }),
  name: "测试调查员",
});
const selectedNames = (c: Character) =>
  c.skills
    .filter((skill) => skill.occupationSelected && !isCreditSkill(skill))
    .map((skill) => skill.name);

describe("occupation selection", () => {
  it.each(OCCUPATIONS.map((o) => [o.id, o] as const))(
    "%s includes every required/group skill, 8 plus credit",
    (id, occupation) => {
      const c = selectOccupation(make(), id, [
        "克苏鲁神话",
        "侦查",
        "侦查",
        "不存在",
      ]);
      const selected = c.skills.filter(
        (skill) => skill.occupationSelected && !isCreditSkill(skill),
      );
      expect(selected).toHaveLength(8);
      expect(
        c.skills.filter(
          (skill) => skill.occupationSelected && isCreditSkill(skill),
        ),
      ).toHaveLength(1);
      expect(selected.some(isMythosSkill)).toBe(false);
      for (const required of occupation.required)
        expect(
          selected.some((skill) => skillMatchesReference(skill, required)),
          required,
        ).toBe(true);
      for (const group of occupation.groups ?? []) {
        expect(
          selected.filter((skill) =>
            group.options.some((option) =>
              skillMatchesReference(skill, option),
            ),
          ).length,
        ).toBeGreaterThanOrEqual(group.count);
      }
    },
  );

  it("clears old occupation investments but retains interest, growth, and source data", () => {
    const c = autoAllocate(selectOccupation(make(), "doctor"));
    c.skills[0].growthPoints = 20;
    const before = structuredClone(c);
    const next = selectOccupation(c, "author", ["博物学", "导航"]);
    expect(c).toEqual(before);
    expect(next.skills.every((skill) => skill.occupationPoints === 0)).toBe(
      true,
    );
    expect(next.skills.map((skill) => skill.interestPoints)).toEqual(
      c.skills.map((skill) => skill.interestPoints),
    );
    expect(next.skills[0].growthPoints).toBe(20);
    expect(selectedNames(next)).toContain("博物学");
    expect(selectedNames(next)).toContain("导航");
  });

  it("honors musician interpersonal and real archaeology science priorities", () => {
    const musician = selectOccupation(make(), "musician", ["说服"]);
    expect(selectedNames(musician)).toContain("说服");
    const archaeologist = selectOccupation(make(), "archaeologist", [
      "科学（化学）",
    ]);
    expect(selectedNames(archaeologist)).toContain("科学（化学）");
    expect(selectedNames(archaeologist)).not.toContain("导航");
  });

  it("allows custom renamed science specialization to meet group rules", () => {
    const c = make();
    const science = c.skills.find((skill) => skill.id === "science")!;
    science.name = "科学（地质学）";
    const next = selectOccupation(c, "archaeologist", ["science"]);
    expect(selectedNames(next)).toContain("科学（地质学）");
    expect(
      validateCreation(next).some((warning) =>
        warning.includes("技能要求未满足"),
      ),
    ).toBe(false);
    expect(
      skillMatchesReference(
        { ...science, name: "科学（地质学）" },
        "科学（自选）",
      ),
    ).toBe(true);
  });

  it("reports limited catalogs and invalid jobs without inventing replacement skills", () => {
    const c = make();
    c.skills = c.skills.slice(0, 2);
    const next = selectOccupation(c, "author");
    expect(next.skills).toHaveLength(2);
    expect(next.warnings.join("")).toContain("仅有 2 项");
    expect(next.warnings.join("")).toContain("必选职业技能");
    const invalid = selectOccupation(c, "not-a-job");
    expect(
      invalid.skills.every(
        (skill) => !skill.occupationSelected && !skill.occupationPoints,
      ),
    ).toBe(true);
  });
});

describe("deterministic point allocation", () => {
  it.each(OCCUPATIONS.map((o) => o.id))(
    "fully allocates default %s without exceeding any cap or pool",
    (id) => {
      const source = selectOccupation(make(), id);
      const before = structuredClone(source);
      const c = autoAllocate(source, ["侦查", "聆听", "图书馆使用"]);
      expect(source).toEqual(before);
      expect(getBudgets(c)).toMatchObject({
        occupationRemaining: 0,
        interestRemaining: 0,
      });
      expect(validateCreation(c)).toEqual([]);
      expect(autoAllocate(source, ["侦查", "聆听", "图书馆使用"])).toEqual(c);
      for (const skill of c.skills) {
        if (isMythosSkill(skill))
          expect(skill.occupationPoints + skill.interestPoints).toBe(0);
        if (!skill.occupationSelected) expect(skill.occupationPoints).toBe(0);
        const cap = isCreditSkill(skill)
          ? OCCUPATIONS.find((o) => o.id === id)!.credit[1]
          : c.rules.skillCap;
        if (skill.occupationPoints + skill.interestPoints)
          expect(
            skillBase(skill, c) + skill.occupationPoints + skill.interestPoints,
          ).toBeLessThanOrEqual(cap);
      }
    },
  );

  it("reserves credit minimum before oversized or invalid requests, without losing growth", () => {
    const c = selectOccupation(make(), "explorer");
    c.skills.find((skill) => skill.name === "侦查")!.growthPoints = 300;
    const next = autoAllocate(c, ["射击（步枪/霰弹枪）"], {
      occupationAllocations: [
        { skill: "射击（步枪/霰弹枪）", points: 1_000_000 },
        { skill: "射击（步枪/霰弹枪）", points: 40 },
        { skill: "克苏鲁神话", points: 900 },
        { skill: "会计", points: 10 },
        { skill: "不存在", points: 100 },
      ],
      interestAllocations: [
        { skill: "侦查", points: 50 },
        { skill: "侦查", points: 50 },
        { skill: "信用评级", points: 9_999 },
      ],
    });
    expect(getCredit(next)).toBeGreaterThanOrEqual(55);
    expect(getCredit(next)).toBeLessThanOrEqual(80);
    expect(
      next.skills.find((skill) => skill.name === "侦查")!.growthPoints,
    ).toBe(300);
    expect(validateCreation(next)).toEqual([]);
  });

  it("accepts stable IDs, treats target rows as pool contribution, and does not spend twice for duplicates", () => {
    const c = selectOccupation(make(), "private-investigator");
    const spy = c.skills.find((s) => s.name === "侦查")!;
    const a = autoAllocate(c, [], {
      occupationAllocations: [{ skill: spy.id, points: 50 }],
    });
    const b = autoAllocate(c, [], {
      occupationAllocations: [
        { skill: spy.id, points: 50 },
        { skill: spy.id, points: 50 },
      ],
    });
    expect(a).toEqual(b);
    expect(a.skills.find((s) => s.id === spy.id)!.occupationPoints).toBe(50);
  });

  it("finishes when capacity is exhausted, leaves finite budgets and actionable warnings", () => {
    const c = selectOccupation(make(), "professor");
    c.rules.skillCap = 1;
    c.attrs.int = 999;
    c.attrs.edu = 999;
    const next = autoAllocate(c);
    expect(getBudgets(next).occupationRemaining).toBeGreaterThan(0);
    expect(getBudgets(next).interestRemaining).toBeGreaterThan(0);
    expect(next.warnings.join("")).toContain("无法分配");
    expect(
      next.skills.every((skill) =>
        Number.isFinite(skill.occupationPoints + skill.interestPoints),
      ),
    ).toBe(true);
  });

  it("cannot fund a richer occupation with tiny EDU and never creates a negative pool", () => {
    const c = selectOccupation(make(), "dilettante");
    c.attrs.edu = 0;
    c.attrs.app = 0;
    c.attrs.int = 0;
    const next = autoAllocate(c);
    expect(getBudgets(next)).toMatchObject({
      occupationTotal: 0,
      occupationSpent: 0,
      interestSpent: 0,
    });
    expect(getCredit(next)).toBe(0);
    expect(next.warnings.join("")).toContain("预算不足");
  });

  it("preserves a valid manually chosen set and only releases creation allocations", () => {
    const c = selectOccupation(make(), "custom", [
      "医学",
      "聆听",
      "导航",
      "说服",
      "侦查",
      "历史",
      "游泳",
      "潜行",
    ]);
    const selected = selectedNames(c);
    c.resources.hp = 1;
    c.resources.luck = 5;
    const next = autoAllocate(c);
    expect(selectedNames(next)).toEqual(selected);
    expect(next.resources).toEqual(c.resources);
    expect(next.creationAttrs).toEqual(c.creationAttrs);
  });
});
