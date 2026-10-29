import { useCallback, useEffect, useRef, useState } from "react";
import type { AiSettings, Character } from "../domain/types";
import {
  createCharacter,
  occupationName,
  validateCreation,
} from "../domain/rules";
import { autoAllocate, selectOccupation } from "../domain/allocation";
import {
  listCharacters,
  saveCharacter,
  deleteCharacter,
  saveCharactersAtomically,
  exportData,
  parseImport,
  readLegacySave,
} from "../storage/repository";
import { regenerateBackground } from "../ai/generateCharacter";
import { PORTRAITS, loadPortrait } from "../components/art";
import { Field, Icon, Modal } from "../components/ui";
import Library from "../features/library/Library";
import Creation from "../features/creation/Creation";
import Editor from "../features/character/Editor";
import Play from "../features/play/Play";
import PrintSheet from "../features/print/PrintSheet";

type Route = { id: string | null; mode: "play" | "edit" | "print" };
function readRoute(): Route {
  const [, section, id, mode] = location.hash.split("/");
  return {
    id: section === "character" && id ? decodeURIComponent(id) : null,
    mode: mode === "edit" || mode === "print" ? mode : "play",
  };
}
function navigate(id: string | null, mode = "play") {
  location.hash = id ? `/character/${encodeURIComponent(id)}/${mode}` : "/";
}
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const defaultSettings: AiSettings = {
  provider: "deepseek",
  endpoint: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
};
function savedSettings(): AiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem("coc-v2-provider") || "null");
    return raw
      ? {
          ...defaultSettings,
          provider: raw.provider === "compatible" ? "compatible" : "deepseek",
          endpoint:
            typeof raw.endpoint === "string"
              ? raw.endpoint
              : defaultSettings.endpoint,
          model:
            typeof raw.model === "string" ? raw.model : defaultSettings.model,
          apiKey: "",
        }
      : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export default function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const data = useRef(new Map<string, Character>());
  const revisions = useRef(new Map<string, number>());
  const dirty = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [route, setRoute] = useState<Route>(readRoute);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("coc-v2-theme") === "dark" ? "dark" : "paper";
    } catch {
      return "paper";
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AiSettings>(savedSettings);
  const [creation, setCreation] = useState(false);
  const [imported, setImported] = useState<{
    characters: Character[];
    warnings: string[];
  } | null>(null);
  const [importChoice, setImportChoice] = useState("copy");
  const [importBusy, setImportBusy] = useState(false);
  const [legacy, setLegacy] = useState<{
    character: Character;
    warnings: string[];
  } | null>(null);
  const [finish, setFinish] = useState(false);
  const [houseNote, setHouseNote] = useState("");
  const [bgJob, setBgJob] = useState<{ id: string; stage: string } | null>(
    null,
  );
  const bgCtrl = useRef<AbortController | null>(null);
  const [bgDraft, setBgDraft] = useState<{
    source: Character;
    result: Character;
  } | null>(null);
  const undo = useRef(new Map<string, Character[]>());
  const [undoTick, setUndoTick] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const active = route.id
    ? characters.find((c) => c.id === route.id)
    : undefined;
  const showToast = useCallback((s: string) => setToast(s), []);
  const publish = useCallback(
    () =>
      setCharacters(
        [...data.current.values()].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
      ),
    [],
  );

  const persist = useCallback(
    async (id: string) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      if (
        inFlight.current.has(id) ||
        !dirty.current.has(id) ||
        !data.current.has(id)
      )
        return;
      inFlight.current.add(id);
      setSaving(true);
      try {
        while (dirty.current.has(id) && data.current.has(id)) {
          const snapshot = data.current.get(id)!;
          const stored = await saveCharacter(
            snapshot,
            revisions.current.get(id) ?? snapshot.revision,
          );
          revisions.current.set(id, stored.revision);
          const current = data.current.get(id);
          if (current === snapshot) {
            data.current.set(id, stored);
            dirty.current.delete(id);
          } else if (current) {
            data.current.set(id, { ...current, revision: stored.revision });
          }
          publish();
          channel.current?.postMessage({ id });
        }
        if (dirty.current.size === 0) setStorageError("");
      } catch (e) {
        setStorageError(
          e instanceof Error
            ? e.message
            : "保存失败，内容仍在当前页面，请先导出备份。",
        );
      } finally {
        inFlight.current.delete(id);
        setSaving(inFlight.current.size > 0 || dirty.current.size > 0);
      }
    },
    [publish],
  );
  const change = useCallback(
    (c: Character, undoable = false) => {
      const previous = data.current.get(c.id);
      if (undoable && previous) {
        const list = undo.current.get(c.id) || [];
        undo.current.set(c.id, [...list.slice(-19), previous]);
        setUndoTick((x) => x + 1);
      }
      const updated = {
        ...c,
        revision: revisions.current.get(c.id) ?? c.revision,
        updatedAt: new Date().toISOString(),
      };
      data.current.set(c.id, updated);
      dirty.current.add(c.id);
      publish();
      setSaving(true);
      const timer = timers.current.get(c.id);
      if (timer) clearTimeout(timer);
      timers.current.set(
        c.id,
        setTimeout(
          () => {
            void persist(c.id);
          },
          undoable ? 0 : 450,
        ),
      );
    },
    [persist, publish],
  );
  function add(c: Character) {
    change(c);
    navigate(c.id, c.phase === "draft" ? "edit" : "play");
  }
  function exportCharacters(list: Character[]) {
    try {
      download(
        exportData(list),
        list.length === 1
          ? `COC-${list[0].name || "调查员"}.json`
          : `COC-档案备份-${new Date().toISOString().slice(0, 10)}.json`,
      );
      showToast(list.length === 1 ? "档案文件已导出。" : "全部档案已备份。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败，请检查角色数据。");
    }
  }

  useEffect(() => {
    let cancelled = false;
    listCharacters()
      .then((list) => {
        if (cancelled) return;
        list.forEach((c) => {
          data.current.set(c.id, c);
          revisions.current.set(c.id, c.revision);
        });
        publish();
      })
      .catch((e) => {
        if (!cancelled)
          setStorageError(
            `档案库暂时无法打开：${e instanceof Error ? e.message : "请检查浏览器存储权限"}。仍可建卡并导出文件。`,
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    try {
      setLegacy(readLegacySave());
    } catch (e) {
      setError(e instanceof Error ? e.message : "旧存档暂时无法读取。");
    }
    return () => {
      cancelled = true;
    };
  }, [publish]);
  useEffect(() => {
    const handler = () => {
      setRoute(readRoute());
      bgCtrl.current?.abort();
      setBgJob(null);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("coc-v2-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const flush = () => {
      dirty.current.forEach((id) => {
        void persist(id);
      });
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        flush();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [persist]);
  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const bc = new BroadcastChannel("coc-v2-archives");
    channel.current = bc;
    bc.onmessage = () => {
      listCharacters()
        .then((list) => {
          const storedIds = new Set(list.map((c) => c.id));
          for (const id of data.current.keys()) {
            if (
              !storedIds.has(id) &&
              !dirty.current.has(id) &&
              !inFlight.current.has(id)
            ) {
              data.current.delete(id);
              revisions.current.delete(id);
              undo.current.delete(id);
            }
          }
          for (const c of list) {
            if (dirty.current.has(c.id)) {
              if (c.revision !== (revisions.current.get(c.id) ?? 0))
                setStorageError(
                  "另一个标签页修改了当前档案。请导出当前内容或另存副本，避免覆盖。",
                );
              continue;
            }
            if (revisions.current.get(c.id) !== c.revision)
              undo.current.delete(c.id);
            data.current.set(c.id, c);
            revisions.current.set(c.id, c.revision);
          }
          setUndoTick((x) => x + 1);
          publish();
        })
        .catch(() => {});
    };
    return () => {
      bc.close();
      channel.current = null;
    };
  }, [publish]);
  async function importFile(file: File) {
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error("文件超过50MB，请分卡导入或缩小头像后重试。");
      const parsed = parseImport(JSON.parse(await file.text()));
      setImported(parsed);
      setImportChoice("copy");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "文件无法读取，请选择角色卡 JSON。",
      );
    }
  }
  async function confirmImport() {
    if (!imported) return;
    setImportBusy(true);
    try {
      if (dirty.current.size || inFlight.current.size)
        throw new Error(
          "还有修改正在保存，请稍后再导入；保存失败时请先导出当前档案。",
        );
      const incoming = imported.characters.map((c) => {
        const existing = data.current.get(c.id);
        if (existing && importChoice === "copy")
          return {
            ...c,
            id: crypto.randomUUID(),
            revision: 0,
            name: `${c.name || "调查员"}（副本）`,
            createdAt: new Date().toISOString(),
          };
        if (existing)
          return {
            ...c,
            revision: revisions.current.get(c.id) ?? existing.revision,
          };
        return { ...c, revision: 0 };
      });
      await saveCharactersAtomically(incoming);
      incoming.forEach((c) => undo.current.delete(c.id));
      setUndoTick((x) => x + 1);
      const all = await listCharacters();
      data.current = new Map(all.map((c) => [c.id, c]));
      revisions.current = new Map(all.map((c) => [c.id, c.revision]));
      publish();
      channel.current?.postMessage({ import: true });
      setImported(null);
      setLegacy(null);
      showToast(`已导入 ${incoming.length} 份档案。`);
      navigate(
        incoming.length === 1 ? incoming[0].id : null,
        incoming[0]?.phase === "draft" ? "edit" : "play",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入没有完成，原档案未改动。");
    } finally {
      setImportBusy(false);
    }
  }
  async function createExample() {
    let portrait = "";
    try {
      portrait = await loadPortrait(PORTRAITS[0].src);
    } catch {
      /* The example remains usable without its portrait. */
    }
    let c = createCharacter({
      method: "manual",
      age: 32,
      era: "1920s",
      ageAdjustments: false,
    });
    c = {
      ...c,
      name: "沈砚舟",
      portrait,
      gender: "男",
      residence: "阿卡姆",
      birthplace: "上海",
      concept:
        "示例角色：一位旅居阿卡姆的私家侦探，循着失踪友人的信件，追查密斯卡托尼克河畔的旧案。",
      story:
        "这是一份可以自由修改的示例档案。沈砚舟曾替报社追踪一桩港口走私案，在调查中失去了最信任的朋友。三年后，一封没有邮戳的信出现在他的门下。信里只有一张渡轮票，以及朋友惯用的那句叮嘱：天黑以后，不要去河边。",
      possessions: "皮面记事本、手电筒、旧相机、一封没有邮戳的信",
      backstory: {
        ...c.backstory,
        personalDescription: "深色旧外套，习惯在谈话时转动铅笔。",
        ideologyBeliefs: "所有失踪的人，都值得有人继续寻找。",
        significantPeople: "三年前失踪的同事陆闻。",
        meaningfulLocations: "阿卡姆河畔那间已经歇业的照相馆。",
        treasuredPossessions: "一张背面写着日期的合影。",
        traits: "耐心、执拗，偶尔会用玩笑掩饰不安。",
      },
    };
    c = autoAllocate(selectOccupation(c, "private-investigator"), [
      "侦查",
      "聆听",
      "图书馆使用",
      "心理学",
      "格斗（斗殴）",
    ]);
    c = {
      ...c,
      phase: "ready",
      skills: c.skills.map((s) => ({
        ...s,
        pinned: [
          "侦查",
          "聆听",
          "图书馆使用",
          "心理学",
          "格斗（斗殴）",
          "闪避",
        ].includes(s.name),
      })),
    };
    add(c);
  }
  function undoState() {
    if (!active) return;
    const stack = undo.current.get(active.id);
    const prev = stack?.pop();
    if (prev) {
      const current = data.current.get(active.id)!;
      const removedIds = new Set(prev.logs.map((l) => l.id));
      const resourceLog = current.logs.find(
        (l) => l.kind === "resource" && !removedIds.has(l.id),
      );
      change({
        ...current,
        resources: prev.resources,
        logs: resourceLog
          ? current.logs.filter((l) => l.id !== resourceLog.id)
          : current.logs,
      });
      setUndoTick((x) => x + 1);
      showToast("已撤销上次状态调整。");
    }
  }
  function copyActive() {
    if (!active) return;
    add({
      ...structuredClone(active),
      id: crypto.randomUUID(),
      revision: 0,
      createdAt: new Date().toISOString(),
      name: `${active.name || "调查员"}（副本）`,
    });
    showToast("已另存一份角色副本。");
  }
  async function removeActive() {
    if (!active) return;
    if (
      !window.confirm(
        `删除“${active.name || "未命名调查员"}”？此操作无法撤销，建议先导出备份。`,
      )
    )
      return;
    if (dirty.current.has(active.id) || inFlight.current.has(active.id)) {
      showToast("请等待当前修改保存完成后再删除。");
      return;
    }
    try {
      await deleteCharacter(active.id);
      data.current.delete(active.id);
      revisions.current.delete(active.id);
      publish();
      navigate(null);
      channel.current?.postMessage({ deleted: active.id });
      showToast("档案已删除。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败。");
    }
  }
  function complete() {
    if (!active) return;
    const warnings = validateCreation(active);
    if (warnings.length && !houseNote.trim()) {
      setError("请填写与守秘人约定的团内规则说明，或先修正待检查项。");
      return;
    }
    change({
      ...active,
      phase: "ready",
      creationAttrs: { ...active.attrs },
      rules: {
        ...active.rules,
        houseRules: houseNote.trim() || active.rules.houseRules,
      },
    });
    setFinish(false);
    navigate(active.id);
    showToast("建卡已完成，可以开始调查。");
  }
  async function rewriteBackground() {
    if (!active) return;
    if (!settings.apiKey) {
      setShowSettings(true);
      showToast("先配置会话密钥，再生成背景草稿。");
      return;
    }
    const source = active,
      ctrl = new AbortController();
    bgCtrl.current = ctrl;
    setBgJob({ id: source.id, stage: "正在生成背景草稿…" });
    try {
      const result = await regenerateBackground(
        source,
        settings,
        (stage) => {
          if (!ctrl.signal.aborted) setBgJob({ id: source.id, stage });
        },
        ctrl.signal,
      );
      if (!ctrl.signal.aborted && readRoute().id === source.id)
        setBgDraft({ source, result });
    } catch (e) {
      if (!ctrl.signal.aborted)
        setError(
          e instanceof Error ? e.message : "背景生成失败，现有内容未改动。",
        );
    } finally {
      if (bgCtrl.current === ctrl) {
        bgCtrl.current = null;
        setBgJob(null);
      }
    }
  }
  const readyCount = characters.filter(
    (c) => !c.archived && c.phase === "ready",
  ).length;
  void undoTick;
  return (
    <div
      className={`app ${route.mode === "print" && active ? "is-printing" : ""}`}
    >
      <aside className="app-sidebar">
        <a className="brand" href="#/" aria-label="回到调查员档案库">
          <span className="brand-emblem">
            <Icon name="archive" size={24} />
          </span>
          <span>
            调查员档案<small>克苏鲁的呼唤 7 版</small>
          </span>
        </a>
        <nav className="main-nav">
          <button
            className={!route.id ? "active" : ""}
            onClick={() => navigate(null)}
          >
            <Icon name="folder" />
            我的档案<span>{characters.length}</span>
          </button>
          <button onClick={() => setCreation(true)}>
            <Icon name="plus" />
            新建调查员
          </button>
        </nav>
        <div className="sidebar-characters">
          <p>最近的调查员</p>
          {characters
            .filter((c) => !c.archived)
            .slice(0, 6)
            .map((c) => (
              <button
                key={c.id}
                className={route.id === c.id ? "active" : ""}
                onClick={() =>
                  navigate(c.id, c.phase === "draft" ? "edit" : "play")
                }
              >
                <span className="character-initial">
                  {(c.name || "未").slice(0, 1)}
                </span>
                <span>
                  {c.name || "未命名调查员"}
                  <small>{occupationName(c)}</small>
                </span>
              </button>
            ))}
          {!characters.length && (
            <span className="sidebar-empty">
              你的第一位调查员
              <br />
              还没有入柜。
            </span>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            onClick={() => setTheme((t) => (t === "paper" ? "dark" : "paper"))}
          >
            <Icon name={theme === "paper" ? "moon" : "sun"} />
            {theme === "paper" ? "切换深色工作台" : "切换纸质档案"}
          </button>
          <button onClick={() => setShowSettings(true)}>
            <Icon name="settings" />
            AI 服务设置
          </button>
          <small>
            非官方玩家辅助工具
            <br />
            规则以守秘人裁定为准
          </small>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="breadcrumb">
            <button onClick={() => navigate(null)}>调查员档案</button>
            {active && (
              <>
                <span>/</span>
                <strong>{active.name || "未命名调查员"}</strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span
              className={`save-indicator ${storageError ? "save-error" : ""}`}
            >
              <i />
              {storageError
                ? "保存需要处理"
                : saving
                  ? "正在保存…"
                  : loading
                    ? "正在读取…"
                    : active
                      ? "已自动保存"
                      : `${readyCount} 位调查员在案`}
            </span>
            <button
              className="icon-button mobile-settings"
              onClick={() => setShowSettings(true)}
              aria-label="AI 设置"
            >
              <Icon name="settings" size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() =>
                setTheme((t) => (t === "paper" ? "dark" : "paper"))
              }
              aria-label={theme === "paper" ? "切换深色主题" : "切换纸质主题"}
            >
              <Icon name={theme === "paper" ? "moon" : "sun"} size={19} />
            </button>
          </div>
        </header>
        {storageError && (
          <div className="storage-error" role="alert">
            <div>
              <strong>修改尚未安全保存</strong>
              <p>{storageError}</p>
            </div>
            <button
              className="button small"
              onClick={() => exportCharacters([...data.current.values()])}
            >
              导出当前内容
            </button>
            <button
              className="button small"
              onClick={() => {
                dirty.current.forEach((id) => {
                  void persist(id);
                });
              }}
            >
              重试保存
            </button>
            {active && (
              <button className="button small" onClick={copyActive}>
                另存副本
              </button>
            )}
          </div>
        )}
        {!route.id ? (
          <Library
            characters={characters}
            loading={loading}
            onOpen={(id) => {
              const c = data.current.get(id);
              navigate(id, c?.phase === "draft" ? "edit" : "play");
            }}
            onCreate={() => setCreation(true)}
            onImport={() => upload.current?.click()}
            onBackup={() => exportCharacters(characters)}
            onExample={createExample}
            onLegacy={
              legacy
                ? () => {
                    setImported({
                      characters: [legacy.character],
                      warnings: legacy.warnings,
                    });
                    setImportChoice("copy");
                  }
                : undefined
            }
          />
        ) : active ? (
          route.mode === "print" ? (
            <PrintSheet
              character={active}
              onClose={() => navigate(active.id)}
            />
          ) : (
            <main className="character-main page-main">
              <header className="character-title-row">
                <div>
                  <span className="section-context">
                    {active.phase === "draft"
                      ? "正在建立档案"
                      : active.archived
                        ? "已归档调查员"
                        : "调查员档案"}{" "}
                    <span className="source-label">
                      {
                        {
                          concept: "人设生成",
                          random: "规则掷骰",
                          manual: "手动建卡",
                          legacy: "旧版迁入",
                        }[active.method]
                      }
                    </span>
                  </span>
                  <h1>{active.name || "未命名调查员"}</h1>
                </div>
                <div className="character-actions">
                  <div className="segmented">
                    <button
                      className={route.mode === "play" ? "active" : ""}
                      onClick={() => navigate(active.id)}
                    >
                      跑团
                    </button>
                    <button
                      className={route.mode === "edit" ? "active" : ""}
                      onClick={() => navigate(active.id, "edit")}
                    >
                      编辑档案
                    </button>
                  </div>
                  {active.phase === "draft" && (
                    <button
                      className="button primary"
                      onClick={() => {
                        setHouseNote(active.rules.houseRules);
                        setFinish(true);
                      }}
                    >
                      <Icon name="check" size={17} />
                      完成建卡
                    </button>
                  )}
                  <details className="action-menu">
                    <summary className="button" aria-label="更多档案操作">
                      更多 <span>⌄</span>
                    </summary>
                    <div>
                      {[
                        [
                          "download",
                          "导出角色卡",
                          () => exportCharacters([active]),
                        ],
                        [
                          "print",
                          "打印 / PDF",
                          () => navigate(active.id, "print"),
                        ],
                        ["copy", "复制角色", copyActive],
                        [
                          "archive",
                          active.archived ? "移回档案库" : "归档角色",
                          () => {
                            change({ ...active, archived: !active.archived });
                            navigate(null);
                          },
                        ],
                        [
                          "trash",
                          "删除角色",
                          () => {
                            void removeActive();
                          },
                        ],
                      ].map(([icon, label, action]) => (
                        <button
                          key={label as string}
                          onClick={(e) => {
                            e.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            (action as () => void)();
                          }}
                        >
                          <Icon name={icon as string} size={17} />
                          {label as string}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </header>
              {route.mode === "edit" ? (
                <Editor
                  key={active.id}
                  character={active}
                  onChange={change}
                  onToast={showToast}
                  onRegenerate={() => {
                    void rewriteBackground();
                  }}
                />
              ) : (
                <Play
                  key={active.id}
                  character={active}
                  onChange={change}
                  onToast={showToast}
                  onUndo={undoState}
                  canUndo={!!undo.current.get(active.id)?.length}
                />
              )}
            </main>
          )
        ) : (
          <main className="empty-state">
            <Icon name="folder" size={40} />
            <h1>{loading ? "正在读取档案…" : "找不到这位调查员"}</h1>
            <p>
              {loading ? "请稍候。" : "档案可能已删除，或位于另一个浏览器。"}
            </p>
            <button className="button" onClick={() => navigate(null)}>
              返回档案库
            </button>
          </main>
        )}
      </div>
      <input
        type="file"
        hidden
        ref={upload}
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      {creation && (
        <Creation
          settings={settings}
          onSettings={() => setShowSettings(true)}
          onClose={() => setCreation(false)}
          onCreated={(c) => {
            setCreation(false);
            add(c);
          }}
        />
      )}
      {showSettings && (
        <Settings
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            setSettings(s);
            try {
              localStorage.setItem(
                "coc-v2-provider",
                JSON.stringify({
                  provider: s.provider,
                  endpoint: s.endpoint,
                  model: s.model,
                }),
              );
            } catch {}
            setShowSettings(false);
            showToast("AI 设置已更新。密钥仅留在当前会话。");
          }}
        />
      )}
      {imported && (
        <Modal
          title="导入调查员档案"
          onClose={() => {
            if (!importBusy) setImported(null);
          }}
        >
          <p>
            文件包含 {imported.characters.length}{" "}
            份档案。导入前的现有数据会保留。
          </p>
          <ul className="import-list">
            {imported.characters.map((c, i) => (
              <li key={i}>
                <strong>{c.name || "未命名调查员"}</strong>
                <span>
                  {c.age} 岁 / {occupationName(c)}
                  {data.current.has(c.id) ? " / 已存在同一角色" : ""}
                </span>
              </li>
            ))}
          </ul>
          {imported.characters.some((c) => data.current.has(c.id)) && (
            <Field label="同一角色已存在时">
              <select
                value={importChoice}
                onChange={(e) => setImportChoice(e.target.value)}
              >
                <option value="copy">另存副本（推荐）</option>
                <option value="replace">整卡替换现有版本</option>
              </select>
              <small>替换将覆盖现有内容，不自动合并电脑和手机上的修改。</small>
            </Field>
          )}
          {imported.warnings.length > 0 && (
            <details open>
              <summary>迁移说明</summary>
              <ul className="audit-list">
                {imported.warnings.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="modal-actions">
            <button
              className="button"
              disabled={importBusy}
              onClick={() => setImported(null)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={importBusy}
              onClick={() => void confirmImport()}
            >
              {importBusy ? "正在导入…" : "确认导入"}
            </button>
          </div>
        </Modal>
      )}
      {finish && active && (
        <Modal title="完成调查员建卡" onClose={() => setFinish(false)}>
          {validateCreation(active).length > 0 ? (
            <>
              <p>
                这份档案有以下待检查项。可以返回修改，或与守秘人约定后按团内规则完成。
              </p>
              <ul className="validation-list">
                {validateCreation(active).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <Field label="团内规则说明">
                <textarea
                  rows={3}
                  value={houseNote}
                  onChange={(e) => setHouseNote(e.target.value)}
                  placeholder="写下已经约定的例外。"
                />
              </Field>
            </>
          ) : (
            <p className="success-text">
              <Icon name="check" />
              职业技能、点数和信用评级检查通过。完成后可直接使用跑团面板。
            </p>
          )}
          <div className="modal-actions">
            <button className="button" onClick={() => setFinish(false)}>
              返回修改
            </button>
            <button className="button primary" onClick={complete}>
              {validateCreation(active).length
                ? "按团内规则完成"
                : "完成并开始调查"}
            </button>
          </div>
        </Modal>
      )}
      {bgJob && (
        <Modal
          title="生成背景草稿"
          onClose={() => {
            bgCtrl.current?.abort();
            setBgJob(null);
          }}
        >
          <div className="generation-progress">
            <span className="loading-mark" />
            <p>{bgJob.stage}</p>
          </div>
          <p className="help-text">现有角色没有改动。完成后会让你审阅。</p>
          <div className="modal-actions">
            <button
              className="button"
              onClick={() => {
                bgCtrl.current?.abort();
                setBgJob(null);
              }}
            >
              取消生成
            </button>
          </div>
        </Modal>
      )}
      {bgDraft && (
        <Modal title="审阅新的背景草稿" onClose={() => setBgDraft(null)} wide>
          <p className="help-text">
            只替换人物背景，不改动属性、技能、状态和装备。
          </p>
          <div className="bg-draft-preview">
            <p className="prose">{bgDraft.result.story}</p>
            {Object.entries(bgDraft.result.backstory)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <p key={k} className="prose">
                  {v}
                </p>
              ))}
          </div>
          <div className="modal-actions">
            <button className="button" onClick={() => setBgDraft(null)}>
              保留现有背景
            </button>
            <button
              className="button primary"
              onClick={() => {
                const current = data.current.get(bgDraft.source.id);
                if (
                  current &&
                  (current.story !== bgDraft.source.story ||
                    JSON.stringify(current.backstory) !==
                      JSON.stringify(bgDraft.source.backstory)) &&
                  !window.confirm(
                    "当前背景在生成后又有修改。采用新草稿将替换这些修改，继续吗？",
                  )
                )
                  return;
                if (current) {
                  change({
                    ...current,
                    story: bgDraft.result.story,
                    backstory: bgDraft.result.backstory,
                  });
                }
                setBgDraft(null);
              }}
            >
              采用这份背景
            </button>
          </div>
        </Modal>
      )}
      {error && (
        <Modal title="这一步没有完成" onClose={() => setError("")}>
          <p className="error-text">{error}</p>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setError("")}>
              知道了
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Settings({
  settings,
  onSave,
  onClose,
}: {
  settings: AiSettings;
  onSave: (s: AiSettings) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState({ ...settings });
  return (
    <Modal title="AI 服务设置" onClose={onClose}>
      <p className="modal-intro">
        使用自己的模型服务生成角色。密钥只保留在当前会话，刷新后需要重新填写。
      </p>
      <Field label="服务">
        <select
          value={value.provider}
          onChange={(e) => {
            const provider = e.target.value as AiSettings["provider"];
            setValue((v) =>
              provider === "deepseek"
                ? {
                    ...v,
                    provider,
                    endpoint: defaultSettings.endpoint,
                    model: defaultSettings.model,
                  }
                : { ...v, provider, endpoint: "", model: "" },
            );
          }}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="compatible">自定义兼容服务</option>
        </select>
      </Field>
      <Field
        label="API 地址"
        hint={
          value.provider === "compatible"
            ? "填写兼容 Chat Completions 的服务地址，服务需允许浏览器直连。"
            : "请求直接发往 DeepSeek。"
        }
      >
        <input
          value={value.endpoint}
          onChange={(e) => setValue({ ...value, endpoint: e.target.value })}
          placeholder="https://api.example.com/v1"
          type="url"
        />
      </Field>
      <Field label="模型名称">
        <input
          value={value.model}
          onChange={(e) => setValue({ ...value, model: e.target.value })}
          placeholder="模型提供方给出的名称"
          list="model-options"
        />
        <datalist id="model-options">
          <option value="deepseek-v4-flash" />
          <option value="deepseek-v4-pro" />
        </datalist>
      </Field>
      <Field label="API 密钥">
        <input
          type="password"
          value={value.apiKey}
          onChange={(e) => setValue({ ...value, apiKey: e.target.value })}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <p className="help-text">
        自定义服务的跨域限制由服务方决定。密钥不会进入角色档案、备份或导出文件。
      </p>
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          取消
        </button>
        <button
          className="button primary"
          onClick={() =>
            onSave({
              ...value,
              apiKey: value.apiKey.trim(),
              endpoint: value.endpoint.trim(),
              model: value.model.trim(),
            })
          }
        >
          使用这些设置
        </button>
      </div>
    </Modal>
  );
}
