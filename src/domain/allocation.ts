import type { Character, Occupation, Skill } from "./types";
import {
  getBudgets,
  getOccupation,
  isCreditSkill,
  isMythosSkill,
  skillBase,
  skillMatchesReference,
} from "./rules";

export interface AllocationTargets {
  occupationAllocations?: { skill: string; points: number }[];
  interestAllocations?: { skill: string; points: number }[];
}

const ALLOCATION_PREFIX = "自动分配：";

function copyForSelection(c: Character, id: string): Character {
  return {
    ...c,
    occupationId: id,
    skills: c.skills.map((skill) => ({
      ...skill,
      occupationPoints: 0,
      occupationSelected: false,
    })),
    warnings: c.warnings.filter(
      (warning) => !warning.startsWith(ALLOCATION_PREFIX),
    ),
  };
}

function resolveReference(
  skills: Skill[],
  reference: string,
): Skill | undefined {
  return (
    skills.find((skill) => skill.id === reference) ??
    skills.find((skill) => skill.name === reference) ??
    skills.find((skill) => skillMatchesReference(skill, reference))
  );
}

function orderedSkills(skills: Skill[], references: string[]): Skill[] {
  const seen = new Set<string>();
  const result: Skill[] = [];
  for (const reference of references) {
    const skill = resolveReference(skills, reference);
    if (skill && !seen.has(skill.id)) {
      result.push(skill);
      seen.add(skill.id);
    }
  }
  return result;
}

/** Keep interest/growth unchanged; choosing a job always releases its old job points. */
export function selectOccupation(
  c: Character,
  id: string,
  priorities: string[] = [],
): Character {
  const next = copyForSelection(c, id);
  const occupation = getOccupation(id);
  if (!occupation) {
    if (id)
      next.warnings.push(
        `${ALLOCATION_PREFIX}找不到职业 ${id}，职业点已释放，请重新选择。`,
      );
    return next;
  }
  const selected = new Set<string>();
  const select = (skill?: Skill): void => {
    if (
      !skill ||
      isCreditSkill(skill) ||
      isMythosSkill(skill) ||
      selected.size >= 8
    )
      return;
    skill.occupationSelected = true;
    selected.add(skill.id);
  };
  for (const required of occupation.required)
    select(resolveReference(next.skills, required));
  for (const group of occupation.groups ?? []) {
    const matching = (skill: Skill): boolean =>
      group.options.some((option) => skillMatchesReference(skill, option));
    let count = next.skills.filter(
      (skill) => selected.has(skill.id) && matching(skill),
    ).length;
    // Custom science/art specializations may be absent from the static options.
    const candidates = [
      ...orderedSkills(next.skills, priorities).filter(matching),
      ...orderedSkills(next.skills, group.options),
      ...next.skills.filter(matching),
    ];
    for (const skill of candidates) {
      if (count >= group.count) break;
      if (!selected.has(skill.id)) {
        select(skill);
        if (selected.has(skill.id)) count += 1;
      }
    }
    if (count < group.count)
      next.warnings.push(
        `${ALLOCATION_PREFIX}无法满足职业技能组：${group.label}。`,
      );
  }
  for (const skill of orderedSkills(next.skills, [
    ...priorities,
    ...occupation.suggested,
    ...next.skills.map((item) => item.id),
  ]))
    select(skill);
  const credit = next.skills.find(isCreditSkill);
  if (credit) credit.occupationSelected = true;
  else
    next.warnings.push(
      `${ALLOCATION_PREFIX}缺少信用评级技能，无法安排信用点数。`,
    );
  if (selected.size < 8)
    next.warnings.push(
      `${ALLOCATION_PREFIX}仅有 ${selected.size} 项可用职业技能，需补足到 8 项。`,
    );
  for (const required of occupation.required) {
    if (
      !next.skills.some(
        (skill) =>
          skill.occupationSelected && skillMatchesReference(skill, required),
      )
    ) {
      next.warnings.push(`${ALLOCATION_PREFIX}缺少必选职业技能：${required}。`);
    }
  }
  return next;
}

function capacity(skill: Skill, c: Character, occupation?: Occupation): number {
  const cap = isCreditSkill(skill)
    ? (occupation?.credit[1] ?? 99)
    : c.rules.skillCap;
  // Growth belongs to play and does not consume a creation budget or cap.
  return Math.max(
    0,
    Math.floor(
      cap - skillBase(skill, c) - skill.occupationPoints - skill.interestPoints,
    ),
  );
}

function applyTargets(
  c: Character,
  targets: { skill: string; points: number }[],
  field: "occupationPoints" | "interestPoints",
  occupation: Occupation | undefined,
  remaining: number,
): number {
  const seen = new Set<string>();
  for (const item of targets) {
    const skill =
      item && typeof item.skill === "string"
        ? resolveReference(c.skills, item.skill)
        : undefined;
    if (
      !skill ||
      isMythosSkill(skill) ||
      (field === "occupationPoints" && !skill.occupationSelected)
    )
      continue;
    if (seen.has(skill.id)) continue; // duplicate AI rows must not multiply a target
    seen.add(skill.id);
    if (!Number.isFinite(item.points) || item.points < 0) continue;
    const requested = Math.max(0, Math.floor(item.points) - skill[field]);
    const increase = Math.min(
      requested,
      capacity(skill, c, occupation),
      remaining,
    );
    skill[field] += increase;
    remaining -= increase;
    if (remaining <= 0) break;
  }
  return remaining;
}

function fillPool(
  c: Character,
  candidates: Skill[],
  field: "occupationPoints" | "interestPoints",
  occupation: Occupation | undefined,
  remaining: number,
): number {
  // Each pass spends points or exits. The step size also bounds large house-rule
  // budgets; there is no retry-until-random-success loop.
  while (remaining > 0) {
    let spent = 0;
    for (const skill of candidates) {
      const increase = Math.min(10, capacity(skill, c, occupation), remaining);
      if (increase <= 0) continue;
      skill[field] += increase;
      remaining -= increase;
      spent += increase;
      if (remaining <= 0) break;
    }
    if (spent === 0) break;
  }
  return remaining;
}

/** Redistribute creation points deterministically; never mutate the source card. */
export function autoAllocate(
  c: Character,
  priorities: string[] = [],
  targets: AllocationTargets = {},
): Character {
  let next: Character = {
    ...c,
    warnings: c.warnings.filter(
      (warning) => !warning.startsWith(ALLOCATION_PREFIX),
    ),
    skills: c.skills.map((skill) => ({
      ...skill,
      occupationPoints: 0,
      interestPoints: 0,
    })),
  };
  const occupation = getOccupation(c.occupationId);
  if (occupation) {
    const existing = next.skills.filter(
      (skill) =>
        skill.occupationSelected &&
        !isCreditSkill(skill) &&
        !isMythosSkill(skill),
    );
    const satisfies =
      existing.length === 8 &&
      occupation.required.every((reference) =>
        existing.some((skill) => skillMatchesReference(skill, reference)),
      ) &&
      (occupation.groups ?? []).every(
        (group) =>
          existing.filter((skill) =>
            group.options.some((reference) =>
              skillMatchesReference(skill, reference),
            ),
          ).length >= group.count,
      );
    if (!satisfies) next = selectOccupation(next, c.occupationId, priorities);
    else {
      for (const skill of next.skills) {
        if (isMythosSkill(skill)) skill.occupationSelected = false;
        if (isCreditSkill(skill)) skill.occupationSelected = true;
      }
    }
  } else {
    for (const skill of next.skills) skill.occupationSelected = false;
    next.warnings.push(`${ALLOCATION_PREFIX}尚未选择有效职业，仅分配兴趣点。`);
  }
  const budgets = getBudgets(next);
  let occupationRemaining = Math.max(0, Math.floor(budgets.occupationTotal));
  let interestRemaining = Math.max(0, Math.floor(budgets.interestTotal));
  const credit = next.skills.find(isCreditSkill);
  if (occupation && credit) {
    const minimum = Math.max(
      0,
      Math.ceil(occupation.credit[0] - skillBase(credit, next)),
    );
    const funded = Math.min(
      minimum,
      occupationRemaining,
      capacity(credit, next, occupation),
    );
    credit.occupationPoints = funded;
    occupationRemaining -= funded;
    if (funded < minimum)
      next.warnings.push(
        `${ALLOCATION_PREFIX}职业预算不足以达到信用评级下限 ${occupation.credit[0]}。`,
      );
    if (skillBase(credit, next) > occupation.credit[1])
      next.warnings.push(
        `${ALLOCATION_PREFIX}信用评级基础值高于职业上限 ${occupation.credit[1]}，请人工确认。`,
      );
  }
  occupationRemaining = applyTargets(
    next,
    targets.occupationAllocations ?? [],
    "occupationPoints",
    occupation,
    occupationRemaining,
  );
  const ordered = orderedSkills(next.skills, [
    ...priorities,
    ...next.skills.map((skill) => skill.id),
  ]);
  const occupationCandidates = ordered.filter(
    (skill) => skill.occupationSelected && !isMythosSkill(skill),
  );
  occupationRemaining = fillPool(
    next,
    occupationCandidates,
    "occupationPoints",
    occupation,
    occupationRemaining,
  );
  interestRemaining = applyTargets(
    next,
    targets.interestAllocations ?? [],
    "interestPoints",
    occupation,
    interestRemaining,
  );
  interestRemaining = fillPool(
    next,
    ordered.filter((skill) => !isMythosSkill(skill)),
    "interestPoints",
    occupation,
    interestRemaining,
  );
  if (occupationRemaining > 0)
    next.warnings.push(
      `${ALLOCATION_PREFIX}技能上限内仍有 ${occupationRemaining} 点职业点无法分配，请调整上限或职业技能。`,
    );
  if (interestRemaining > 0)
    next.warnings.push(
      `${ALLOCATION_PREFIX}技能上限内仍有 ${interestRemaining} 点兴趣点无法分配，请调整上限或补充技能。`,
    );
  return next;
}
