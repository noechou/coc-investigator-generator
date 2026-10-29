import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Character, PlayEvent, ResourceKey } from "../../domain/types";
import { ATTRIBUTE_KEYS, BACKSTORY_KEYS } from "../../domain/types";
import { ATTRIBUTE_LABELS, BACKSTORY_LABELS } from "../../domain/catalogs";
import {
  getCredit,
  getDerived,
  occupationName,
  skillTotal,
  weaponValue,
} from "../../domain/rules";
import { rollCheck, rollDice } from "../../domain/checks";
import { Icon, Modal, Portrait, formatTime } from "../../components/ui";
import { ART, EMBLEMS } from "../../components/art";

type Props = {
  character: Character;
  onChange: (c: Character, undoable?: boolean) => void;
  onUndo: () => void;
  canUndo: boolean;
  onToast: (s: string) => void;
};
const RESOURCES: [ResourceKey, string, string][] = [
  ["hp", "生命", "heart"],
  ["mp", "魔法", "spark"],
  ["san", "理智", "book"],
  ["luck", "幸运", "dice"],
];
const OUTCOME_TONE: Record<string, string> = {
  大成功: "crit",
  极难成功: "extreme",
  困难成功: "hard",
  普通成功: "regular",
  失败: "fail",
  大失败: "fumble",
};
export const outcomeTone = (outcome?: string) =>
  (outcome && OUTCOME_TONE[outcome]) || "neutral";
const SANITY_LABELS: Record<string, string> = {
  steady: "心神安定",
  uneasy: "隐隐不安",
  shaken: "心神动摇",
  fraying: "濒临崩溃",
  lost: "理智尽失",
};
// Starting SAN equals POW, so the descent is measured against that, not 99.
function sanityLevel(c: Character, sanMax: number) {
  const start = Math.max(
    1,
    Math.min(sanMax, c.creationAttrs?.pow || c.attrs.pow || 1),
  );
  const ratio = c.resources.san / start;
  if (c.resources.san <= 0) return "lost";
  if (ratio < 0.25) return "fraying";
  if (ratio < 0.5) return "shaken";
  if (ratio < 0.8) return "uneasy";
  return "steady";
}
export default function Play({
  character: c,
  onChange,
  onUndo,
  canUndo,
  onToast,
}: Props) {
  const [tab, setTab] = useState("character");
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("all");
  const [bonus, setBonus] = useState(0);
  const [dice, setDice] = useState("1d100");
  const [resourceEdit, setResourceEdit] = useState<ResourceKey | null>(null);
  const [resourceValue, setResourceValue] = useState("");
  const [checkResult, setCheckResult] = useState<{
    title: string;
    roll: number;
    outcome: string;
    detail: string;
  } | null>(null);
  const derived = getDerived(c);
  const sanity = sanityLevel(c, derived.sanMax);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.sanity = sanity;
    return () => {
      delete root.dataset.sanity;
    };
  }, [sanity]);
  const resourceMax: Record<ResourceKey, number> = {
    hp: derived.hp,
    mp: derived.mp,
    san: derived.sanMax,
    luck: 99,
  };
  const pinned = c.skills.filter((s) => s.pinned);
  const frequent = pinned.length
    ? pinned
    : [...c.skills]
        .sort((a, b) => skillTotal(b, c) - skillTotal(a, c))
        .slice(0, 8);
  const append = (
    event: Omit<PlayEvent, "id" | "at">,
    updates: Partial<Character> = {},
    undoable = false,
  ) =>
    onChange(
      {
        ...c,
        ...updates,
        logs: [
          { ...event, id: crypto.randomUUID(), at: new Date().toISOString() },
          ...c.logs,
        ],
      },
      undoable,
    );
  function check(title: string, target: number, modifier = bonus) {
    const r = rollCheck(target, modifier);
    const mod =
      modifier > 0
        ? `${modifier}颗奖励骰`
        : modifier < 0
          ? `${-modifier}颗惩罚骰`
          : "普通检定";
    const detail = `目标 ${target} / 困难 ${Math.floor(target / 2)} / 极难 ${Math.floor(target / 5)}；${mod}；骰点 ${r.candidates.join("、")}`;
    append({
      kind: "check",
      title,
      detail,
      result: r.roll,
      target,
      outcome: r.outcome,
    });
    if (matchMedia("(max-width: 1050px)").matches)
      setCheckResult({ title, roll: r.roll, outcome: r.outcome, detail });
  }
  function generalRoll() {
    try {
      const r = rollDice(dice);
      append({
        kind: "dice",
        title: r.expression,
        detail: `各骰：${r.rolls.join(" + ")}`,
        result: r.total,
        outcome: "掷骰结果",
      });
    } catch (err) {
      onToast(err instanceof Error ? err.message : "骰子表达式不正确。");
    }
  }
  function resourceChange(key: ResourceKey, value: number) {
    const next = Math.max(0, Math.min(999, Math.round(value)));
    const label = RESOURCES.find((x) => x[0] === key)![1];
    append(
      {
        kind: "resource",
        title: `${label}调整`,
        detail: `${c.resources[key]} → ${next}`,
      },
      { resources: { ...c.resources, [key]: next } },
      true,
    );
  }
  function togglePin(id: string) {
    onChange({
      ...c,
      skills: c.skills.map((s) =>
        s.id === id ? { ...s, pinned: !s.pinned } : s,
      ),
    });
  }
  const rows = c.skills.filter(
    (s) =>
      s.name.includes(query) &&
      (skillFilter !== "pinned" || s.pinned) &&
      (skillFilter !== "occupation" || s.occupationSelected),
  );
  const last = c.logs[0];
  return (
    <div className="play-layout">
      <div className="sanity-veil" aria-hidden="true" />
      <div className="play-primary">
        <section className="resource-strip" aria-label="当前状态">
          {RESOURCES.map(([key, label]) => (
            <div
              key={key}
              className={`resource-item resource-${key}`}
              style={
                {
                  "--fill": `${Math.min(100, (c.resources[key] / Math.max(1, resourceMax[key])) * 100)}%`,
                } as CSSProperties
              }
            >
              <img className="resource-emblem" src={EMBLEMS[key]} alt="" />
              <span className="resource-label">
                {label}
                <small>{key.toUpperCase()}</small>
              </span>
              <div className="resource-number">
                <button
                  className="resource-adjust"
                  aria-label={`减少${label}`}
                  disabled={c.resources[key] <= 0}
                  onClick={() => resourceChange(key, c.resources[key] - 1)}
                >
                  <span aria-hidden="true">−</span>
                </button>
                <button
                  className="resource-value"
                  aria-label={`编辑${label}当前值`}
                  onClick={() => {
                    setResourceValue(String(c.resources[key]));
                    setResourceEdit(key);
                  }}
                >
                  {c.resources[key]}
                  <small>
                    {key === "hp"
                      ? ` / ${derived.hp}`
                      : key === "mp"
                        ? ` / ${derived.mp}`
                        : key === "san"
                          ? ` / ${derived.sanMax}`
                          : ""}
                  </small>
                </button>
                <button
                  className="resource-adjust"
                  aria-label={`增加${label}`}
                  onClick={() => resourceChange(key, c.resources[key] + 1)}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              <span className="resource-meter" aria-hidden="true">
                <i />
              </span>
              {key === "san" && (
                <span className={`sanity-state sanity-${sanity}`}>
                  {SANITY_LABELS[sanity]}
                </span>
              )}
              {(key === "san" || key === "luck") && (
                <button
                  className="resource-check"
                  aria-label={`${label}检定`}
                  onClick={() => check(`${label}检定`, c.resources[key], 0)}
                >
                  <Icon name="dice" size={13} />
                  检定
                </button>
              )}
            </div>
          ))}
        </section>
        <div className="mobile-roll-controls">
          <span>本次检定</span>
          <select
            aria-label="手机检定奖惩骰"
            value={bonus}
            onChange={(e) => setBonus(Number(e.target.value))}
          >
            <option value={2}>2 颗奖励骰</option>
            <option value={1}>1 颗奖励骰</option>
            <option value={0}>普通检定</option>
            <option value={-1}>1 颗惩罚骰</option>
            <option value={-2}>2 颗惩罚骰</option>
          </select>
        </div>
        <nav className="play-tabs" aria-label="跑团面板">
          {[
            ["character", "角色", "user"],
            ["skills", "技能", "book"],
            ["equipment", "装备", "bag"],
            ["logs", "记录", "log"],
          ].map(([value, label, icon]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              <Icon name={icon} size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div key={tab} className="play-page-content">
          {tab === "character" && (
            <>
              <section className="character-overview">
                <div className="overview-portrait">
                  <img
                    className="overview-clip"
                    src={ART.paperclip}
                    alt=""
                    aria-hidden="true"
                  />
                  <Portrait name={c.name} src={c.portrait} large />
                </div>
                <img
                  className="overview-seal"
                  src={ART.waxSeal}
                  alt=""
                  aria-hidden="true"
                />
                <div className="overview-copy">
                  <span className="overview-file">
                    档案 No.{c.id.slice(-6).toUpperCase()} · 机密
                  </span>
                  <span className="overview-occupation">
                    {occupationName(c)} / {c.age} 岁 / {c.era}
                  </span>
                  <h2>{c.name || "未命名调查员"}</h2>
                  <p>{c.concept || "这个人物的故事，尚待记录。"}</p>
                  <span className="overview-place">
                    {[
                      c.residence && `现居 ${c.residence}`,
                      c.birthplace && `来自 ${c.birthplace}`,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "居住地未记录"}
                  </span>
                </div>
              </section>
              <section className="play-section">
                <div className="section-title">
                  <h2>常用技能</h2>
                  <button
                    className="text-link"
                    onClick={() => setTab("skills")}
                  >
                    查看全部 <Icon name="arrow" size={15} />
                  </button>
                </div>
                <p className="section-description">
                  点击数值即可检定。可在技能页固定常用项。
                </p>
                <div className="quick-skills">
                  {frequent.map((s) => (
                    <button
                      className="quick-skill"
                      key={s.id}
                      onClick={() => check(s.name, skillTotal(s, c))}
                    >
                      <span>{s.name}</span>
                      <strong>{skillTotal(s, c)}</strong>
                      <small>
                        {Math.floor(skillTotal(s, c) / 2)} /{" "}
                        {Math.floor(skillTotal(s, c) / 5)}
                      </small>
                      <Icon name="dice" size={17} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="play-section">
                <div className="section-title">
                  <h2>基础属性</h2>
                  <span>点击检定</span>
                </div>
                <div className="play-attributes">
                  {ATTRIBUTE_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => check(ATTRIBUTE_LABELS[key], c.attrs[key])}
                    >
                      <span>
                        {ATTRIBUTE_LABELS[key]}
                        <small>{key.toUpperCase()}</small>
                      </span>
                      <strong>{c.attrs[key]}</strong>
                      <small>
                        {Math.floor(c.attrs[key] / 2)} /{" "}
                        {Math.floor(c.attrs[key] / 5)}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="derived-summary">
                  <span>
                    伤害加值 <b>{derived.db}</b>
                  </span>
                  <span>
                    体格 <b>{derived.build}</b>
                  </span>
                  <span>
                    移动 <b>{derived.mov}</b>
                  </span>
                  <span>
                    信用 <b>{getCredit(c)}</b>
                  </span>
                </div>
              </section>
              <section className="play-section">
                <div className="section-title">
                  <h2>人物背景</h2>
                </div>
                {c.story && <p className="prose story-preview">{c.story}</p>}
                <div className="background-view-grid">
                  {BACKSTORY_KEYS.filter((key) => c.backstory[key]).map(
                    (key) => (
                      <article key={key}>
                        <h3>{BACKSTORY_LABELS[key]}</h3>
                        <p className="prose">{c.backstory[key]}</p>
                      </article>
                    ),
                  )}
                </div>
                {!c.story && !BACKSTORY_KEYS.some((k) => c.backstory[k]) && (
                  <p className="help-text">
                    尚未填写背景，可以在编辑档案中补充。
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "skills" && (
            <section className="play-section skill-play-section">
              <div className="section-title">
                <h2>技能</h2>
                <span>常规 / 困难 / 极难</span>
              </div>
              <label className="search-box">
                <Icon name="search" size={18} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="查找技能，如侦查、聆听"
                  aria-label="查找跑团技能"
                />
              </label>
              <div className="filter-chips">
                {[
                  ["all", "全部"],
                  ["pinned", "常用"],
                  ["occupation", "职业技能"],
                ].map(([value, label]) => (
                  <button
                    className={skillFilter === value ? "active" : ""}
                    onClick={() => setSkillFilter(value)}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="play-skill-list">
                {rows.map((s) => (
                  <div className="play-skill-row" key={s.id}>
                    <button
                      className={`icon-button pin-button ${s.pinned ? "pinned" : ""}`}
                      aria-label={`${s.pinned ? "取消固定" : "固定"}${s.name}`}
                      aria-pressed={s.pinned}
                      onClick={() => togglePin(s.id)}
                    >
                      <Icon name="pin" size={17} />
                    </button>
                    <button
                      className="skill-roll-button"
                      onClick={() => check(s.name, skillTotal(s, c))}
                    >
                      <span>
                        {s.name}
                        {s.occupationSelected && <small>职业</small>}
                      </span>
                      <strong>{skillTotal(s, c)}</strong>
                      <small>{Math.floor(skillTotal(s, c) / 2)}</small>
                      <small>{Math.floor(skillTotal(s, c) / 5)}</small>
                      <Icon name="dice" size={19} />
                    </button>
                  </div>
                ))}
              </div>
              {!rows.length && (
                <p className="empty-inline">没有符合条件的技能。</p>
              )}
            </section>
          )}
          {tab === "equipment" && (
            <>
              <section className="play-section">
                <div className="section-title">
                  <h2>武器</h2>
                  <span>成功率随关联技能更新</span>
                </div>
                {c.weapons.map((w) => (
                  <div className="weapon-play" key={w.id}>
                    <div>
                      <h3>{w.name}</h3>
                      <span>{w.skillName}</span>
                    </div>
                    <button
                      className="button"
                      onClick={() => check(w.name, weaponValue(w, c))}
                    >
                      <Icon name="dice" size={18} />
                      {weaponValue(w, c)} 检定
                    </button>
                    <dl>
                      <div>
                        <dt>伤害</dt>
                        <dd>{w.damage || "—"}</dd>
                      </div>
                      <div>
                        <dt>射程</dt>
                        <dd>{w.range || "—"}</dd>
                      </div>
                      <div>
                        <dt>弹药</dt>
                        <dd>{w.ammo || "—"}</dd>
                      </div>
                      <div>
                        <dt>故障</dt>
                        <dd>{w.malfunction || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
                {!c.weapons.length && (
                  <p className="help-text">尚未记录武器。</p>
                )}
              </section>
              <section className="play-section">
                <h2>随身物品</h2>
                <p className="prose">{c.possessions || "未记录"}</p>
              </section>
              <section className="play-section">
                <h2>资产</h2>
                <div className="derived-summary">
                  <span>
                    信用 <b>{getCredit(c)}</b>
                  </span>
                  <span>
                    现金 <b>{c.assetCash || "—"}</b>
                  </span>
                  <span>
                    消费 <b>{c.assetSpending || "—"}</b>
                  </span>
                </div>
                <p className="prose">{c.assetDetails}</p>
              </section>
            </>
          )}
          {tab === "logs" && (
            <>
              <section className="play-section">
                <div className="section-title">
                  <h2>调查笔记</h2>
                  <span>自动保存</span>
                </div>
                <textarea
                  rows={7}
                  value={c.notes}
                  onChange={(e) => onChange({ ...c, notes: e.target.value })}
                  placeholder="线索、待办、人物关系，还有暂时说不清的事。"
                  aria-label="调查笔记"
                />
              </section>
              <section className="play-section">
                <div className="section-title">
                  <h2>检定与状态记录</h2>
                  <button
                    className="button small"
                    onClick={onUndo}
                    disabled={!canUndo}
                  >
                    <Icon name="undo" size={15} />
                    撤销上次状态调整
                  </button>
                </div>
                <div className="full-log">
                  {c.logs.map((log) => (
                    <article key={log.id} className="log-entry">
                      <div>
                        <span>{formatTime(log.at)}</span>
                        <h3>{log.title}</h3>
                        <strong className={`tone-${outcomeTone(log.outcome)}`}>
                          {log.result !== undefined ? `${log.result} · ` : ""}
                          {log.outcome || ""}
                        </strong>
                      </div>
                      <p>{log.detail}</p>
                      <input
                        value={log.annotation || ""}
                        aria-label={`${log.title}的备注`}
                        placeholder="为这条记录补充备注…"
                        onChange={(e) =>
                          onChange({
                            ...c,
                            logs: c.logs.map((l) =>
                              l.id === log.id
                                ? { ...l, annotation: e.target.value }
                                : l,
                            ),
                          })
                        }
                      />
                    </article>
                  ))}
                  {!c.logs.length && (
                    <p className="empty-inline">
                      第一次检定之后，记录会留在这里。
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      <aside className="roll-sidebar">
        <section className="roll-panel">
          <div className="section-title">
            <h2>检定台</h2>
            <Icon name="dice" size={20} />
          </div>
          <label className="field">
            <span>奖励 / 惩罚</span>
            <select
              value={bonus}
              onChange={(e) => setBonus(Number(e.target.value))}
            >
              <option value={2}>2 颗奖励骰</option>
              <option value={1}>1 颗奖励骰</option>
              <option value={0}>普通检定</option>
              <option value={-1}>1 颗惩罚骰</option>
              <option value={-2}>2 颗惩罚骰</option>
            </select>
          </label>
          <div
            key={last?.id ?? "no-roll"}
            className={`latest-roll ${last ? "roll-reveal" : ""} tone-${outcomeTone(last?.outcome)}`}
            aria-live="polite"
          >
            <img
              className="roll-sigil"
              src={ART.sigil}
              alt=""
              aria-hidden="true"
            />
            {last ? (
              <>
                <span>{last.title}</span>
                <strong>
                  {last.result !== undefined ? (
                    last.result
                  ) : (
                    <Icon
                      name={last.kind === "resource" ? "heart" : "log"}
                      size={38}
                    />
                  )}
                </strong>
                <b>{last.outcome || last.detail}</b>
                {last.target !== undefined && (
                  <small>目标值 {last.target}</small>
                )}
              </>
            ) : (
              <>
                <span>等待下一次检定</span>
                <strong className="roll-placeholder">—</strong>
                <b>点击技能或属性开始</b>
                <small>记录只保留在本机</small>
              </>
            )}
          </div>
          <div className="general-dice">
            <label className="field">
              <span>普通骰子</span>
              <input
                value={dice}
                onChange={(e) => setDice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") generalRoll();
                }}
                placeholder="如 2d6+3"
                aria-label="骰子表达式"
              />
            </label>
            <button className="button primary" onClick={generalRoll}>
              <Icon name="dice" size={18} />
              投掷
            </button>
          </div>
          <button
            className="text-link undo-link"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Icon name="undo" size={15} />
            撤销上次状态调整
          </button>
        </section>
        <section className="recent-log">
          <div className="section-title">
            <h3>最近记录</h3>
            <button className="text-link" onClick={() => setTab("logs")}>
              全部
            </button>
          </div>
          {c.logs.slice(0, 5).map((log) => (
            <div
              key={log.id}
              className={`mini-log tone-${outcomeTone(log.outcome)}`}
            >
              <Icon
                name={log.kind === "resource" ? "heart" : "dice"}
                size={15}
              />
              <div>
                <span>{log.title}</span>
                <small>{log.outcome || log.detail}</small>
              </div>
              <b>{log.result ?? ""}</b>
            </div>
          ))}
          {!c.logs.length && (
            <p className="help-text">这里会留下骰点和状态变化。</p>
          )}
        </section>
      </aside>
      {checkResult && (
        <Modal title={checkResult.title} onClose={() => setCheckResult(null)}>
          <div
            className={`latest-roll roll-reveal tone-${outcomeTone(checkResult.outcome)}`}
          >
            <img
              className="roll-sigil"
              src={ART.sigil}
              alt=""
              aria-hidden="true"
            />
            <span>检定结果</span>
            <strong>{checkResult.roll}</strong>
            <b>{checkResult.outcome}</b>
          </div>
          <p className="help-text">{checkResult.detail}</p>
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => setCheckResult(null)}
            >
              继续调查
            </button>
          </div>
        </Modal>
      )}
      {resourceEdit && (
        <Modal
          title={`调整${RESOURCES.find((x) => x[0] === resourceEdit)![1]}`}
          onClose={() => setResourceEdit(null)}
        >
          <label className="field">
            <span>当前值</span>
            <input
              autoFocus
              type="number"
              min={0}
              max={999}
              value={resourceValue}
              onChange={(e) => setResourceValue(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  Number.isFinite(Number(resourceValue))
                ) {
                  resourceChange(resourceEdit, Number(resourceValue));
                  setResourceEdit(null);
                }
              }}
            />
          </label>
          <div className="modal-actions">
            <button className="button" onClick={() => setResourceEdit(null)}>
              取消
            </button>
            <button
              className="button primary"
              onClick={() => {
                if (
                  resourceValue.trim() &&
                  Number.isFinite(Number(resourceValue))
                ) {
                  resourceChange(resourceEdit, Number(resourceValue));
                  setResourceEdit(null);
                }
              }}
            >
              记录调整
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
