import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Character, PortableLibrary } from "../domain/types";
import { IMPORT_LIMITS } from "../domain/schema";
import { portableCharacter } from "./portable";
import { migrateLegacy } from "./migrateLegacy";

export const DATABASE_NAME = "coc-investigator-archive-v2";
export const LEGACY_STORAGE_KEY = "coc7-investigator-sheet-v1";

interface InvestigatorDatabase extends DBSchema {
  characters: {
    key: string;
    value: Character;
    indexes: { updatedAt: string };
  };
}

export class RevisionConflictError extends Error {
  readonly characterId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(id: string, expected: number, actual: number) {
    super(
      "这张角色卡已在另一个页面修改或删除。请先导出当前内容，再重新载入角色卡。",
    );
    this.name = "RevisionConflictError";
    this.characterId = id;
    this.expectedRevision = expected;
    this.actualRevision = actual;
  }
}

async function database(): Promise<IDBPDatabase<InvestigatorDatabase>> {
  if (typeof globalThis.indexedDB === "undefined") {
    throw new Error(
      "当前浏览器无法使用本地数据库，角色尚未保存。请导出备份或允许本站存储。",
    );
  }
  // Each operation owns a short connection. There is no memory-only "saved" fallback,
  // and a page left open cannot indefinitely block a future database upgrade.
  return openDB<InvestigatorDatabase>(DATABASE_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore("characters", { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
    },
    blocking() {
      /* Operations close their connection in finally. */
    },
  });
}

function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("角色版本号必须是非负整数。");
  return value;
}

function nextRevision(previous: number): number {
  if (previous >= Number.MAX_SAFE_INTEGER)
    throw new Error("角色版本号已超出可保存范围，请导出后另存副本。");
  return previous + 1;
}

function uniqueCharacters(inputs: Character[]): Character[] {
  if (inputs.length > IMPORT_LIMITS.characters)
    throw new Error(
      `单个角色库最多支持 ${IMPORT_LIMITS.characters} 张角色卡，请分开导入。`,
    );
  const ids = new Set<string>();
  return inputs.map((input) => {
    const c = portableCharacter(input);
    revision(c.revision);
    if (ids.has(c.id))
      throw new Error("文件内含有重复角色编号，请先将重复角色另存副本。");
    ids.add(c.id);
    return c;
  });
}

export async function listCharacters(): Promise<Character[]> {
  const db = await database();
  try {
    const characters = await db.getAll("characters");
    return characters
      .map(portableCharacter)
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      );
  } finally {
    db.close();
  }
}

/** Compare and write in the same transaction, including across browser tabs. */
export async function saveCharacter(
  input: Character,
  expectedRevision?: number,
): Promise<Character> {
  const c = portableCharacter(input);
  const expected = revision(expectedRevision ?? c.revision);
  const db = await database();
  const transaction = db.transaction("characters", "readwrite", {
    durability: "strict",
  });
  const completion = transaction.done;
  void completion.catch(() => undefined);
  try {
    const stored = await transaction.store.get(c.id);
    const actual = stored ? revision(stored.revision) : 0;
    if (
      (stored && expected !== actual) ||
      (!stored && expectedRevision !== undefined && expected !== 0) ||
      (!stored && expectedRevision === undefined && c.revision > 0)
    ) {
      throw new RevisionConflictError(c.id, expected, actual);
    }
    const saved: Character = {
      ...c,
      revision: nextRevision(actual),
      updatedAt: new Date().toISOString(),
    };
    await transaction.store.put(saved);
    await completion;
    return saved;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* The browser may already have aborted it. */
    }
    await completion.catch(() => undefined);
    throw error;
  } finally {
    db.close();
  }
}

export async function deleteCharacter(id: string): Promise<void> {
  const db = await database();
  try {
    const transaction = db.transaction("characters", "readwrite", {
      durability: "strict",
    });
    const completion = transaction.done;
    void completion.catch(() => undefined);
    await transaction.store.delete(id);
    await completion;
  } finally {
    db.close();
  }
}

/** Validate every entry first; any stale entry or write failure rolls back the whole batch. */
export async function saveCharactersAtomically(
  inputs: Character[],
): Promise<void> {
  if (!Array.isArray(inputs)) throw new Error("角色备份必须是列表。");
  const characters = uniqueCharacters(inputs);
  if (!characters.length) return;
  const db = await database();
  const transaction = db.transaction("characters", "readwrite", {
    durability: "strict",
  });
  const completion = transaction.done;
  void completion.catch(() => undefined);
  try {
    const current = await Promise.all(
      characters.map((c) => transaction.store.get(c.id)),
    );
    // Check the entire batch before enqueueing any writes, in one locked transaction.
    const now = new Date().toISOString();
    const saved = characters.map((c, index) => {
      const stored = current[index];
      const actual = stored ? revision(stored.revision) : 0;
      if (stored && c.revision !== actual)
        throw new RevisionConflictError(c.id, c.revision, actual);
      return { ...c, revision: nextRevision(actual), updatedAt: now };
    });
    // Async callbacks also capture a synchronous put failure (e.g. quota or
    // cloning errors), so requests already queued have rejection handlers.
    await Promise.all(saved.map(async (c) => transaction.store.put(c)));
    await completion;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* The browser may already have aborted it. */
    }
    await completion.catch(() => undefined);
    throw error;
  } finally {
    db.close();
  }
}

export function exportData(characters: Character[]): PortableLibrary {
  if (!Array.isArray(characters)) throw new Error("要导出的角色必须是列表。");
  return {
    format: "coc-investigator-archive",
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    characters: uniqueCharacters(characters),
  };
}

/** Parsing has no side effects; the caller chooses duplication/overwrite before writing. */
export function parseImport(input: unknown): {
  characters: Character[];
  warnings: string[];
} {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("无法识别存档格式，请选择本项目导出的 JSON 文件。");
  }
  const raw = input as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, "format")) {
    if (
      raw.format !== "coc-investigator-archive" ||
      raw.schemaVersion !== 4 ||
      !Array.isArray(raw.characters) ||
      typeof raw.exportedAt !== "string" ||
      !Number.isFinite(Date.parse(raw.exportedAt))
    ) {
      throw new Error("角色库备份格式或版本不受支持。");
    }
    return {
      characters: uniqueCharacters(raw.characters as Character[]),
      warnings: [],
    };
  }
  if (raw.schemaVersion === 4)
    return {
      characters: [portableCharacter(input as Character)],
      warnings: [],
    };
  if (
    raw.version === 3 &&
    !Object.prototype.hasOwnProperty.call(raw, "schemaVersion")
  ) {
    const result = migrateLegacy(input);
    return { characters: [result.character], warnings: result.warnings };
  }
  throw new Error(
    "存档版本不受支持；可导入第 4 版角色、角色库备份或第 3 版旧角色卡。",
  );
}

/** Read only; an absent save is normal, but inaccessible or malformed data must be visible. */
export function readLegacySave(): {
  character: Character;
  warnings: string[];
} | null {
  let saved: string | null;
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    saved = globalThis.localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    throw new Error("无法读取旧版本地存档；请在旧版页面导出 JSON 后导入。");
  }
  if (saved === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(saved);
  } catch {
    throw new Error(
      "发现旧版存档，但内容已损坏；旧存档仍保留，请先备份原始文件。",
    );
  }
  try {
    return migrateLegacy(raw);
  } catch (error) {
    throw new Error(
      `旧版存档无法迁移：${error instanceof Error ? error.message : "存档格式无效。"}旧存档仍保留。`,
    );
  }
}
