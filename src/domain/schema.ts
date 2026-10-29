import { z } from "zod";
import type { Character } from "./types";

// Quotas fail visibly; imports never trim stories, discard logs, or silently drop excess characters.
export const IMPORT_LIMITS = {
  characters: 200,
  skills: 1_000,
  weapons: 200,
  logs: 10_000,
  warnings: 500,
  text: 200_000,
  portrait: 8_000_000,
} as const;

const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
const text = (max: number = IMPORT_LIMITS.text) => z.string().max(max);
const id = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim().length > 0, "标识不能为空");
const timestamp = z.iso.datetime({ offset: true });
const attributesSchema = z.object({
  str: integer(0, 999),
  con: integer(0, 999),
  siz: integer(0, 999),
  dex: integer(0, 999),
  app: integer(0, 999),
  int: integer(0, 999),
  pow: integer(0, 999),
  edu: integer(0, 999),
});
const skillSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  base: integer(0, 999),
  baseType: z.enum(["dodge", "ownLanguage"]).optional(),
  occupationPoints: integer(0, 9_999),
  interestPoints: integer(0, 9_999),
  growthPoints: integer(0, 9_999),
  occupationSelected: z.boolean(),
  custom: z.boolean(),
  pinned: z.boolean(),
});
const weaponSchema = z.object({
  id,
  name: text(200),
  skillId: id.nullable(),
  skillName: text(200),
  manualValue: integer(0, 999).nullable(),
  damage: text(500),
  range: text(500),
  ammo: text(500),
  malfunction: text(500),
});
const playEventSchema = z.object({
  id,
  at: timestamp,
  kind: z.enum(["check", "dice", "resource", "note"]),
  title: text(500),
  detail: text(10_000),
  result: integer(-1_000_000_000, 1_000_000_000).optional(),
  target: integer(0, 99_999).optional(),
  outcome: text(200).optional(),
  annotation: text(10_000).optional(),
});
const portrait = text(IMPORT_LIMITS.portrait).refine((value) => {
  if (!value) return true;
  if (
    /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(
      value,
    )
  )
    return true;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }
  return (
    /^(?:\.\/)?assets\/[A-Za-z0-9_./%-]+$/.test(value) && !value.includes("..")
  );
}, "头像须为 PNG/JPEG/WebP/GIF 图片、HTTP(S) 地址或 assets 中的图片路径");
const numericOverride = (min = 0) => z.union([integer(min, 9_999), text(200)]);

// z.object strips unknown fields at every level, including settings/apiKey from a malformed export.
export const characterSchema = z
  .object({
    schemaVersion: z.literal(4),
    id,
    revision: integer(0, Number.MAX_SAFE_INTEGER),
    createdAt: timestamp,
    updatedAt: timestamp,
    archived: z.boolean(),
    phase: z.enum(["draft", "ready"]),
    name: text(200),
    age: integer(1, 150),
    gender: text(200),
    era: text(200),
    occupationId: text(200),
    customOccupationName: text(200),
    residence: text(2_000),
    birthplace: text(2_000),
    portrait,
    concept: text(),
    method: z.enum(["concept", "random", "manual", "legacy"]),
    attrs: attributesSchema,
    creationAttrs: attributesSchema,
    initialLuck: integer(0, 999),
    ageAdjusted: z.boolean(),
    ageAudit: z.array(text(2_000)).max(500),
    rules: z.object({
      skillCap: integer(1, 99),
      ageAdjustments: z.boolean(),
      houseRules: text(20_000),
    }),
    skills: z.array(skillSchema).max(IMPORT_LIMITS.skills),
    weapons: z.array(weaponSchema).max(IMPORT_LIMITS.weapons),
    resources: z.object({
      hp: integer(0, 9_999),
      mp: integer(0, 9_999),
      san: integer(0, 999),
      luck: integer(0, 999),
    }),
    derivedOverrides: z.object({
      hp: numericOverride().optional(),
      mp: numericOverride().optional(),
      sanMax: numericOverride().optional(),
      db: z.union([integer(-9_999, 9_999), text(200)]).optional(),
      build: numericOverride(-9_999).optional(),
      mov: numericOverride().optional(),
    }),
    possessions: text(),
    assetCash: text(20_000),
    assetSpending: text(20_000),
    assetDetails: text(),
    backstory: z.object({
      personalDescription: text(),
      ideologyBeliefs: text(),
      significantPeople: text(),
      meaningfulLocations: text(),
      treasuredPossessions: text(),
      traits: text(),
      injuriesScars: text(),
      phobiasManias: text(),
      mythosTomes: text(),
    }),
    story: text(),
    notes: text(),
    logs: z.array(playEventSchema).max(IMPORT_LIMITS.logs),
    warnings: z.array(text(2_000)).max(IMPORT_LIMITS.warnings),
  })
  .superRefine((character, context) => {
    for (const key of ["skills", "weapons", "logs"] as const) {
      const seen = new Set<string>();
      character[key].forEach((entry, index) => {
        if (seen.has(entry.id))
          context.addIssue({
            code: "custom",
            message: "同类记录的标识不得重复",
            path: [key, index, "id"],
          });
        seen.add(entry.id);
      });
    }
  });

export function parseCharacter(input: unknown): Character {
  return characterSchema.parse(input);
}

export function parseCharacterArray(input: unknown): Character[] {
  return z
    .array(characterSchema)
    .max(IMPORT_LIMITS.characters)
    .superRefine((characters, context) => {
      const seen = new Set<string>();
      characters.forEach((character, index) => {
        if (seen.has(character.id))
          context.addIssue({
            code: "custom",
            message: "角色标识不得重复",
            path: [index, "id"],
          });
        seen.add(character.id);
      });
    })
    .parse(input);
}
