import { z } from "zod";
import { BACKSTORY_KEYS } from "../domain/types";
import type { Attributes, BackstoryKey, Character } from "../domain/types";
import { OCCUPATIONS, SKILL_DEFINITIONS } from "../domain/catalogs";
import { AiError } from "./client";

const text = (max = 10_000) => z.string().max(max);
const nonemptyText = (max: number) =>
  text(max).refine((value) => value.trim().length > 0);
const standardAttribute = z
  .number()
  .finite()
  .int()
  .min(15)
  .max(90)
  .multipleOf(5);
const educatedAttribute = z
  .number()
  .finite()
  .int()
  .min(40)
  .max(90)
  .multipleOf(5);
const attrsSchema = z
  .object({
    str: standardAttribute,
    con: standardAttribute,
    siz: educatedAttribute,
    dex: standardAttribute,
    app: standardAttribute,
    int: educatedAttribute,
    pow: standardAttribute,
    edu: educatedAttribute,
  })
  .strict();

const availableSkill = text(200).refine((value) =>
  SKILL_DEFINITIONS.some(
    (skill) =>
      (skill.id === value || skill.name === value) &&
      skill.name !== "克苏鲁神话",
  ),
);
const unique = (values: string[]) =>
  new Set(
    values.map(
      (reference) =>
        SKILL_DEFINITIONS.find(
          (skill) => skill.id === reference || skill.name === reference,
        )?.id ?? reference,
    ),
  ).size === values.length;
const backstorySchema = z
  .object(
    Object.fromEntries(BACKSTORY_KEYS.map((key) => [key, text()])) as Record<
      BackstoryKey,
      z.ZodString
    >,
  )
  .strict();
const weaponSkill = availableSkill.refine((reference) => {
  const skill = SKILL_DEFINITIONS.find(
    (candidate) => candidate.id === reference || candidate.name === reference,
  );
  return Boolean(skill && /^(格斗|射击|炮术|投掷)/.test(skill.name));
});
const weaponSchema = z
  .object({
    name: nonemptyText(200),
    skill: weaponSkill,
    damage: text(200),
    range: text(200),
    ammo: text(200),
    malfunction: text(200),
  })
  .strict();
const profileSchema = z
  .object({
    attrs: attrsSchema,
    luck: standardAttribute,
    identity: z
      .object({
        name: nonemptyText(200),
        gender: text(200),
        residence: text(1_000),
        birthplace: text(1_000),
      })
      .strict(),
    occupationId: text(200).refine((value) =>
      OCCUPATIONS.some(
        (occupation) => occupation.id === value && occupation.id !== "custom",
      ),
    ),
    priorities: z.array(availableSkill).max(8).refine(unique),
    equipment: z
      .object({
        weapons: z.array(weaponSchema).max(5),
        possessions: text(20_000),
      })
      .strict(),
    backstory: backstorySchema,
    story: nonemptyText(30_000),
  })
  .strict();

export type AiProfile = z.infer<typeof profileSchema> & {
  attrs: Attributes;
  backstory: Character["backstory"];
};
export interface AllocationTargets {
  occupationAllocations?: { skill: string; points: number }[];
  interestAllocations?: { skill: string; points: number }[];
}

/** The response schema limits data volume by rejecting it, never by clipping user-visible text. */
export function parseProfile(input: unknown): AiProfile {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    throw new AiError(
      "format",
      "AI 人物资料不完整或字段不符合约定。属性须为年龄修正前的标准范围数值，职业与技能须来自目录。",
    );
  }
  // Resolve both supported skill references to the exact catalogue name used by the allocator.
  return {
    ...parsed.data,
    priorities: parsed.data.priorities.map(skillName),
    equipment: {
      ...parsed.data.equipment,
      weapons: parsed.data.equipment.weapons.map((weapon) => ({
        ...weapon,
        skill: skillName(weapon.skill),
      })),
    },
  };
}

function skillName(reference: string): string {
  return SKILL_DEFINITIONS.find(
    (skill) => skill.id === reference || skill.name === reference,
  )!.name;
}

const allocationSchema = z
  .object({
    occupationAllocations: z
      .array(
        z
          .object({
            skill: text(200),
            points: z.number().finite().int().min(0).max(10_000),
          })
          .strict(),
      )
      .max(SKILL_DEFINITIONS.length)
      .optional(),
    interestAllocations: z
      .array(
        z
          .object({
            skill: text(200),
            points: z.number().finite().int().min(0).max(10_000),
          })
          .strict(),
      )
      .max(SKILL_DEFINITIONS.length)
      .optional(),
  })
  .strict();

export function parseAllocation(
  input: unknown,
  c: Character,
): AllocationTargets {
  const parsed = allocationSchema.safeParse(input);
  if (!parsed.success)
    throw new AiError("format", "AI 技能建议格式无效，点数须为非负整数。");
  const targets: AllocationTargets = {};
  for (const field of [
    "occupationAllocations",
    "interestAllocations",
  ] as const) {
    const items = parsed.data[field];
    if (!items) continue;
    const names = new Set<string>();
    targets[field] = items.map((item) => {
      const skill = c.skills.find(
        (candidate) =>
          candidate.id === item.skill || candidate.name === item.skill,
      );
      if (
        !skill ||
        skill.name === "克苏鲁神话" ||
        (field === "occupationAllocations" && !skill.occupationSelected) ||
        names.has(skill.name)
      ) {
        throw new AiError(
          "format",
          "AI 技能建议包含未知、重复或不可分配的技能。",
        );
      }
      names.add(skill.name);
      return { skill: skill.name, points: item.points };
    });
  }
  return targets;
}

const backgroundSchema = z
  .object({ backstory: backstorySchema, story: nonemptyText(30_000) })
  .strict();

export function parseBackground(
  input: unknown,
): Pick<Character, "backstory" | "story"> {
  const parsed = backgroundSchema.safeParse(input);
  if (!parsed.success)
    throw new AiError(
      "format",
      "AI 背景资料不完整，请返回全部背景字段和完整故事。",
    );
  return parsed.data;
}
