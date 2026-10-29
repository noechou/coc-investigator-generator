import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCharacter } from "../domain/rules";
import type { Character } from "../domain/types";
import {
  DATABASE_NAME,
  LEGACY_STORAGE_KEY,
  RevisionConflictError,
  deleteCharacter,
  exportData,
  listCharacters,
  parseImport,
  readLegacySave,
  saveCharacter,
  saveCharactersAtomically,
} from "./repository";

function character(name = "调查员"): Character {
  return {
    ...createCharacter({ method: "manual", ageAdjustments: false }),
    name,
  };
}

beforeEach(async () => {
  await deleteDB(DATABASE_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("IndexedDB repository", () => {
  it("returns a new durable revision without mutating the input and lists persisted characters", async () => {
    const input = character();
    const saved = await saveCharacter(input, 0);
    expect(saved.revision).toBe(1);
    expect(input.revision).toBe(0);
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await listCharacters()).toEqual([saved]);
    const updated = await saveCharacter(
      { ...saved, name: "改名", resources: { hp: 0, mp: 0, san: 0, luck: 0 } },
      1,
    );
    expect(updated.revision).toBe(2);
    expect((await listCharacters())[0]).toEqual(updated);
    const db = await openDB(DATABASE_NAME, 1);
    expect(await db.get("characters", saved.id)).toEqual(updated);
    db.close();
  });

  it("rejects explicit and implicit stale revisions and retains the newer record", async () => {
    const original = character();
    const saved = await saveCharacter(original);
    const current = await saveCharacter(
      { ...saved, story: "新版本" },
      saved.revision,
    );
    await expect(
      saveCharacter({ ...saved, story: "旧页面修改" }, saved.revision),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    await expect(
      saveCharacter({ ...original, story: "最初的旧页面" }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    expect(await listCharacters()).toEqual([current]);
  });

  it("serializes two competing tab writes so only one matching revision wins", async () => {
    const saved = await saveCharacter(character());
    const results = await Promise.allSettled([
      saveCharacter({ ...saved, notes: "页面一" }, saved.revision),
      saveCharacter({ ...saved, notes: "页面二" }, saved.revision),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(RevisionConflictError);
    expect((await listCharacters())[0].revision).toBe(2);
  });

  it("rejects an ordinary stale save after deletion instead of resurrecting it", async () => {
    const saved = await saveCharacter(character());
    await deleteCharacter(saved.id);
    await expect(saveCharacter(saved, saved.revision)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    await expect(saveCharacter(saved)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    expect(await listCharacters()).toEqual([]);
  });

  it("requires zero for an explicitly new record", async () => {
    const input = character();
    await expect(saveCharacter(input, 7)).rejects.toMatchObject({
      expectedRevision: 7,
      actualRevision: 0,
    });
    expect(await listCharacters()).toEqual([]);
  });

  it("imports a complete new archive and uses current revisions for deliberate replacements", async () => {
    const first = character("甲");
    const second = { ...character("乙"), revision: 17 };
    await saveCharactersAtomically([first, second]);
    let all = await listCharacters();
    expect(all).toHaveLength(2);
    expect(all.every((c) => c.revision === 1)).toBe(true);
    const importedFirst = all.find((c) => c.id === first.id)!;
    await saveCharactersAtomically([{ ...importedFirst, notes: "替换版" }]);
    all = await listCharacters();
    expect(all.find((c) => c.id === first.id)).toMatchObject({
      revision: 2,
      notes: "替换版",
    });
  });

  it("rolls back every character when a later entry has a revision conflict", async () => {
    const saved = await saveCharacter(character("原卡"));
    const newer = await saveCharacter({ ...saved, notes: "新修改" });
    const newRecord = character("不应部分写入");
    await expect(
      saveCharactersAtomically([newRecord, { ...saved, notes: "过期替换" }]),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    expect(await listCharacters()).toEqual([newer]);
  });

  it("validates the complete batch and duplicate IDs before writing any entries", async () => {
    const first = character("有效");
    const invalid = {
      ...character("无效"),
      attrs: { ...first.attrs, str: Infinity },
    };
    await expect(saveCharactersAtomically([first, invalid])).rejects.toThrow();
    expect(await listCharacters()).toEqual([]);
    await expect(
      saveCharactersAtomically([first, { ...first, name: "重复" }]),
    ).rejects.toThrow("重复");
    expect(await listCharacters()).toEqual([]);
  });

  it("rolls back the first put when the browser rejects a later put", async () => {
    const originalPut = IDBObjectStore.prototype.put;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      calls += 1;
      if (calls === 2)
        throw new DOMException("Quota exhausted", "QuotaExceededError");
      return key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
    });
    await expect(
      saveCharactersAtomically([character("甲"), character("乙")]),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(await listCharacters()).toEqual([]);
  });

  it("fails visibly when browser storage is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(saveCharacter(character(), 0)).rejects.toThrow("尚未保存");
    await expect(listCharacters()).rejects.toThrow("无法使用本地数据库");
  });
});

describe("portable imports and exports", () => {
  it("round-trips long literal texts, empty arrays, resources zero and explicit numeric overrides", () => {
    const text = "<img src=x onerror=alert(1)>\n未完的调查".repeat(700);
    const c = {
      ...character(),
      story: text,
      notes: text,
      skills: [],
      weapons: [],
      resources: { hp: 0, mp: 0, san: 0, luck: 0 },
      initialLuck: 0,
      derivedOverrides: { hp: 0, mp: 0, db: "-2", build: -2, mov: 0 },
    };
    const portable = exportData([c]);
    const restored = parseImport(JSON.parse(JSON.stringify(portable)));
    expect(restored.characters).toEqual([c]);
    expect(restored.warnings).toEqual([]);
    expect(parseImport(c).characters).toEqual([c]);
  });

  it("strips settings and API credentials at every structured level", () => {
    const c = character();
    const input = {
      ...c,
      apiKey: "SECRET-TOP",
      settings: { apiKey: "SECRET-SETTINGS" },
      rules: { ...c.rules, apiKey: "SECRET-RULES" },
      attrs: { ...c.attrs, apiKey: "SECRET-ATTRS" },
      skills: c.skills.map((s) => ({ ...s, apiKey: "SECRET-SKILL" })),
      logs: [
        {
          id: "log-1",
          at: new Date().toISOString(),
          kind: "note" as const,
          title: "记录",
          detail: "内容",
          settings: { apiKey: "SECRET-LOG" },
        },
      ],
    };
    expect(JSON.stringify(exportData([input]))).not.toContain("SECRET");
    expect(JSON.stringify(parseImport(input))).not.toContain("SECRET");
  });

  it("rejects unsupported formats, versions, duplicate IDs and a mixed valid/invalid envelope", () => {
    const c = character();
    for (const input of [
      null,
      [],
      {},
      { format: "other", schemaVersion: 4, characters: [c] },
      { version: 2 },
      { schemaVersion: 5 },
    ]) {
      expect(() => parseImport(input)).toThrow();
    }
    expect(() =>
      parseImport({ ...exportData([c]), characters: [c, c] }),
    ).toThrow("重复");
    expect(() =>
      parseImport({
        ...exportData([c]),
        characters: [c, { ...character(), initialLuck: NaN }],
      }),
    ).toThrow();
  });

  it("rejects oversized archives explicitly instead of discarding entries", () => {
    const chars = Array.from({ length: 201 }, (_, index) => ({
      ...character(),
      id: `char-${index}`,
    }));
    expect(() => parseImport({ ...exportData([]), characters: chars })).toThrow(
      "200",
    );
  });

  it("does not execute or admit script, HTML or SVG portraits", () => {
    for (const portrait of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "data:image/svg+xml;base64,PHN2Zy8+",
      "https://example.com/avatar.svg",
      "https://example.com/avatar.html",
    ]) {
      expect(() => parseImport({ ...character(), portrait })).toThrow();
    }
  });
});

describe("legacy localStorage discovery", () => {
  it("returns null only for absent saves and never writes/removes a legacy save", () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem,
      removeItem,
    });
    expect(readLegacySave()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("reads the exact old key without writing to IndexedDB", async () => {
    const source = { version: 3, attrs: character().attrs, weapons: [] };
    const getItem = vi.fn(() => JSON.stringify(source));
    vi.stubGlobal("localStorage", { getItem });
    const result = readLegacySave();
    expect(getItem).toHaveBeenCalledWith(LEGACY_STORAGE_KEY);
    expect(result!.character.method).toBe("legacy");
    expect(result!.character.weapons).toEqual([]);
    expect(await listCharacters()).toEqual([]);
  });

  it("reports malformed and inaccessible old storage instead of hiding failures", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{invalid" });
    expect(() => readLegacySave()).toThrow("内容已损坏");
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ version: 3, attrs: {} }),
    });
    expect(() => readLegacySave()).toThrow("旧版存档无法迁移");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("Denied", "SecurityError");
      },
    });
    expect(() => readLegacySave()).toThrow("无法读取旧版本地存档");
  });
});
