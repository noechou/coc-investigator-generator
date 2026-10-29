import { describe, expect, it } from "vitest";
import { createCharacter } from "./rules";
import { IMPORT_LIMITS, parseCharacter, parseCharacterArray } from "./schema";

const make = () => createCharacter({ method: "manual", ageAdjustments: false });

describe("complete archive schema", () => {
  it("round trips a complete new character, preserves verbatim text and strips unknown fields", () => {
    const c = make();
    c.story = '<img src=x onerror="alert(1)">\n  故事正文 & 原始符号';
    c.notes = "  不裁剪的笔记  ";
    c.derivedOverrides = { hp: "18", mov: "特殊", db: "+1D8", build: -2 };
    const raw = {
      ...c,
      apiKey: "do-not-export",
      settings: { apiKey: "secret" },
      rules: { ...c.rules, apiKey: "secret" },
      attrs: { ...c.attrs, extension: 55 },
      skills: c.skills.map((skill) => ({
        ...skill,
        apiKey: "secret",
        occupationLocked: true,
      })),
      backstory: { ...c.backstory, hidden: "secret" },
      derivedOverrides: {
        ...c.derivedOverrides,
        settings: { apiKey: "secret" },
      },
    };
    const parsed = parseCharacter(raw);
    expect(parsed).toEqual(c);
    expect(parsed).not.toBe(raw);
    expect(parsed.story).toBe(c.story);
    expect(parsed.notes).toBe(c.notes);
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(JSON.stringify(parsed)).not.toContain("do-not-export");
  });

  it.each([NaN, Infinity, -Infinity, "20", null, {}, -1, 0.5])(
    "rejects malformed skill base %s",
    (base) => {
      const c = make();
      expect(() =>
        parseCharacter({ ...c, skills: [{ ...c.skills[0], base }] }),
      ).toThrow();
    },
  );

  it("validates each nested numeric field without coercion", () => {
    const c = make();
    for (const field of [
      "occupationPoints",
      "interestPoints",
      "growthPoints",
    ]) {
      for (const value of [-1, 1.2, "10", NaN, Infinity]) {
        expect(() =>
          parseCharacter({
            ...c,
            skills: [{ ...c.skills[0], [field]: value }],
          }),
        ).toThrow();
      }
    }
    expect(() =>
      parseCharacter({ ...c, attrs: { ...c.attrs, dex: "70" } }),
    ).toThrow();
    expect(() =>
      parseCharacter({ ...c, resources: { ...c.resources, luck: NaN } }),
    ).toThrow();
    expect(() =>
      parseCharacter({ ...c, derivedOverrides: { hp: Infinity } }),
    ).toThrow();
    expect(() => parseCharacter({ ...c, initialLuck: "50" })).toThrow();
  });

  it.each(["skills", "weapons", "logs", "ageAudit", "warnings"])(
    "rejects wrong %s nested structures",
    (key) => {
      const c = make();
      expect(() => parseCharacter({ ...c, [key]: {} })).toThrow();
      expect(() => parseCharacter({ ...c, [key]: [null] })).toThrow();
      expect(() => parseCharacter({ ...c, [key]: [[c.skills[0]]] })).toThrow();
    },
  );

  it("rejects broken enums, missing fields, duplicates, unsafe portrait schemes and invalid timestamps", () => {
    const c = make();
    expect(() => parseCharacter({ ...c, phase: "playing" })).toThrow();
    expect(() => parseCharacter({ ...c, schemaVersion: 3 })).toThrow();
    expect(() => parseCharacter({ ...c, name: undefined })).toThrow();
    expect(() =>
      parseCharacter({ ...c, skills: [c.skills[0], c.skills[0]] }),
    ).toThrow();
    expect(() => parseCharacter({ ...c, createdAt: "yesterday" })).toThrow();
    for (const portrait of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "file:///etc/passwd",
    ]) {
      expect(() => parseCharacter({ ...c, portrait })).toThrow();
    }
    expect(
      parseCharacter({
        ...c,
        portrait: "assets/default-investigator-portrait.jpg",
      }).portrait,
    ).toContain("assets/");
    expect(
      parseCharacter({ ...c, portrait: "data:image/png;base64,aGVsbG8=" })
        .portrait,
    ).toContain("data:image/png");
  });

  it("retains reasonable legacy overrides and played skill growth independently of creation caps", () => {
    const c = make();
    c.attrs.edu = 150;
    c.skills[0].growthPoints = 400;
    c.skills[0].occupationPoints = 250;
    c.derivedOverrides = {
      hp: "旧设定：20",
      mov: "飞行",
      db: "半DB",
      sanMax: 120,
    };
    expect(parseCharacter(c)).toEqual(c);
  });

  it("fails excessive logs, skills, characters and text instead of silently truncating data", () => {
    const c = make();
    const log = {
      id: "event",
      at: c.createdAt,
      kind: "note",
      title: "笔记",
      detail: "正文",
    };
    expect(() =>
      parseCharacter({ ...c, story: "文".repeat(IMPORT_LIMITS.text + 1) }),
    ).toThrow();
    expect(() =>
      parseCharacter({
        ...c,
        logs: Array.from({ length: IMPORT_LIMITS.logs + 1 }, (_, i) => ({
          ...log,
          id: `log-${i}`,
        })),
      }),
    ).toThrow();
    expect(() =>
      parseCharacter({
        ...c,
        skills: Array.from({ length: IMPORT_LIMITS.skills + 1 }, (_, i) => ({
          ...c.skills[0],
          id: `skill-${i}`,
        })),
      }),
    ).toThrow();
    expect(() =>
      parseCharacterArray(
        Array.from({ length: IMPORT_LIMITS.characters + 1 }, (_, i) => ({
          ...c,
          id: `c-${i}`,
        })),
      ),
    ).toThrow();
    expect(() => parseCharacterArray([c, c])).toThrow();
    expect(
      parseCharacter({ ...c, story: "文".repeat(IMPORT_LIMITS.text) }).story,
    ).toHaveLength(IMPORT_LIMITS.text);
  });
});
