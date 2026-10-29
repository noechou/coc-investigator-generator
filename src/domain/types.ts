export const ATTRIBUTE_KEYS = [
  "str",
  "con",
  "siz",
  "dex",
  "app",
  "int",
  "pow",
  "edu",
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;
export type ResourceKey = "hp" | "mp" | "san" | "luck";
export type Resources = Record<ResourceKey, number>;
export const BACKSTORY_KEYS = [
  "personalDescription",
  "ideologyBeliefs",
  "significantPeople",
  "meaningfulLocations",
  "treasuredPossessions",
  "traits",
  "injuriesScars",
  "phobiasManias",
  "mythosTomes",
] as const;
export type BackstoryKey = (typeof BACKSTORY_KEYS)[number];
export type Method = "concept" | "random" | "manual" | "legacy";
export interface Skill {
  id: string;
  name: string;
  base: number;
  baseType?: "dodge" | "ownLanguage";
  occupationPoints: number;
  interestPoints: number;
  growthPoints: number;
  occupationSelected: boolean;
  custom: boolean;
  pinned: boolean;
}
export interface Weapon {
  id: string;
  name: string;
  skillId: string | null;
  skillName: string;
  manualValue: number | null;
  damage: string;
  range: string;
  ammo: string;
  malfunction: string;
}
export interface PlayEvent {
  id: string;
  at: string;
  kind: "check" | "dice" | "resource" | "note";
  title: string;
  detail: string;
  result?: number;
  target?: number;
  outcome?: string;
  annotation?: string;
}
export interface Character {
  schemaVersion: 4;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  phase: "draft" | "ready";
  name: string;
  age: number;
  gender: string;
  era: string;
  occupationId: string;
  customOccupationName: string;
  residence: string;
  birthplace: string;
  portrait: string;
  concept: string;
  method: Method;
  attrs: Attributes;
  creationAttrs: Attributes;
  initialLuck: number;
  ageAdjusted: boolean;
  ageAudit: string[];
  rules: { skillCap: number; ageAdjustments: boolean; houseRules: string };
  skills: Skill[];
  weapons: Weapon[];
  resources: Resources;
  derivedOverrides: Partial<
    Record<"hp" | "mp" | "sanMax" | "db" | "build" | "mov", number | string>
  >;
  possessions: string;
  assetCash: string;
  assetSpending: string;
  assetDetails: string;
  backstory: Record<BackstoryKey, string>;
  story: string;
  notes: string;
  logs: PlayEvent[];
  warnings: string[];
}
export interface Occupation {
  id: string;
  name: string;
  formula: string;
  credit: [number, number];
  required: string[];
  suggested: string[];
  groups?: { count: number; options: string[]; label: string }[];
  rule: string;
}
export interface AiSettings {
  provider: "deepseek" | "compatible";
  endpoint: string;
  model: string;
  apiKey: string;
}
export interface CreateOptions {
  method: Method;
  concept?: string;
  age?: number;
  era?: string;
  skillCap?: number;
  ageAdjustments?: boolean;
}
export interface Derived {
  hp: number;
  mp: number;
  sanMax: number;
  db: string;
  build: number;
  mov: number;
}
export interface Budgets {
  occupationTotal: number;
  occupationSpent: number;
  occupationRemaining: number;
  interestTotal: number;
  interestSpent: number;
  interestRemaining: number;
  formula: string;
}
export interface CheckResult {
  roll: number;
  candidates: number[];
  units: number;
  tens: number[];
  target: number;
  outcome: string;
  success: boolean;
  bonus: number;
}
export interface PortableLibrary {
  format: "coc-investigator-archive";
  schemaVersion: 4;
  exportedAt: string;
  characters: Character[];
}
