import { describe, expect, it } from "vitest";
import { parseAllocation, parseBackground, parseProfile } from "../schemas";
import { createCharacter } from "../../domain/rules";
import { selectOccupation } from "../../domain/allocation";
import { SKILL_DEFINITIONS } from "../../domain/catalogs";
import { profileFixture, proposedBackstory } from "./fixtures";

const skillId = (name: string) =>
  SKILL_DEFINITIONS.find((skill) => skill.name === name)!.id;

describe("AI response boundaries", () => {
  it.each([NaN, Infinity, -Infinity, 10, 95, 52, "50", null])(
    "rejects invalid proposed attribute %s without coercion",
    (value) => {
      const profile = profileFixture();
      const input = { ...profile, attrs: { ...profile.attrs, str: value } };
      expect(() => parseProfile(input)).toThrow("年龄修正前");
    },
  );

  it("enforces the higher SIZ/INT/EDU floor and validates luck as an independent roll", () => {
    const profile = profileFixture();
    for (const attr of ["siz", "int", "edu"]) {
      expect(() =>
        parseProfile({ ...profile, attrs: { ...profile.attrs, [attr]: 35 } }),
      ).toThrow();
    }
    for (const luck of [0, 99, 22, Infinity, "50"]) {
      expect(() => parseProfile({ ...profile, luck })).toThrow();
    }
  });

  it("resolves catalogue skill IDs and rejects canonical duplicates", () => {
    const profile = profileFixture();
    profile.priorities = [skillId("图书馆使用"), skillId("侦查")];
    profile.equipment.weapons[0].skill = skillId("格斗（斗殴）");
    const parsed = parseProfile(profile);
    expect(parsed.priorities).toEqual(["图书馆使用", "侦查"]);
    expect(parsed.equipment.weapons[0].skill).toBe("格斗（斗殴）");
    expect(() =>
      parseProfile({ ...profile, priorities: [skillId("侦查"), "侦查"] }),
    ).toThrow();
  });

  it("rejects extra authority-bearing fields and unknown nested fields", () => {
    const profile = profileFixture();
    expect(() =>
      parseProfile({ ...profile, id: "overwrite-existing" }),
    ).toThrow();
    expect(() =>
      parseProfile({ ...profile, resources: { hp: 999 } }),
    ).toThrow();
    expect(() =>
      parseProfile({
        ...profile,
        identity: { ...profile.identity, apiKey: "mock-secret" },
      }),
    ).toThrow();
    expect(() =>
      parseProfile({ ...profile, attrs: { ...profile.attrs, armor: 999 } }),
    ).toThrow();
  });

  it("rejects oversized text rather than silently trimming it", () => {
    const profile = profileFixture();
    expect(() =>
      parseProfile({
        ...profile,
        identity: { ...profile.identity, name: "长".repeat(201) },
      }),
    ).toThrow();
    expect(() =>
      parseProfile({ ...profile, story: "长".repeat(30_001) }),
    ).toThrow();
    const literal = "  <img src=x onerror=alert(1)>\n原样保留  ";
    const parsed = parseProfile({ ...profile, story: literal });
    expect(parsed.story).toBe(literal);
  });

  it("rejects weapon links to invented or non-combat skills", () => {
    const profile = profileFixture();
    for (const skill of ["任意技能", "图书馆使用"]) {
      expect(() =>
        parseProfile({
          ...profile,
          equipment: {
            ...profile.equipment,
            weapons: [{ ...profile.equipment.weapons[0], skill }],
          },
        }),
      ).toThrow();
    }
  });

  it("accepts optional allocation targets, but rejects illegal skills, duplicate aliases and negative or non-finite points", () => {
    const character = selectOccupation(createCharacter(), "journalist");
    expect(parseAllocation({}, character)).toEqual({});
    expect(
      parseAllocation(
        {
          occupationAllocations: [{ skill: skillId("图书馆使用"), points: 40 }],
        },
        character,
      ),
    ).toEqual({ occupationAllocations: [{ skill: "图书馆使用", points: 40 }] });
    const invalid = [
      { occupationAllocations: [{ skill: "射击（手枪）", points: 20 }] },
      { interestAllocations: [{ skill: "克苏鲁神话", points: 1 }] },
      { interestAllocations: [{ skill: "不存在", points: 1 }] },
      { interestAllocations: [{ skill: "侦查", points: -1 }] },
      { interestAllocations: [{ skill: "侦查", points: 1.5 }] },
      { interestAllocations: [{ skill: "侦查", points: Infinity }] },
      { interestAllocations: [{ skill: "侦查", points: "10" }] },
      {
        interestAllocations: [
          { skill: "侦查", points: 1 },
          { skill: skillId("侦查"), points: 2 },
        ],
      },
    ];
    for (const proposal of invalid)
      expect(() => parseAllocation(proposal, character)).toThrow();
  });

  it("keeps full literal background text and rejects changes outside background/story", () => {
    const input = {
      backstory: { ...proposedBackstory },
      story: "<script>unchanged text</script>",
    };
    expect(parseBackground(input)).toEqual(input);
    expect(() => parseBackground({ ...input, skills: [] })).toThrow();
    expect(() =>
      parseBackground({
        ...input,
        backstory: { ...input.backstory, arbitrary: "unexpected" },
      }),
    ).toThrow();
    expect(() => parseBackground({ ...input, story: "" })).toThrow();
  });
});
