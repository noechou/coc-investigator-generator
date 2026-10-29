import { useEffect, useRef, useState } from "react";
import type { AttributeKey, Character, Skill } from "../../domain/types";
import {
  ATTRIBUTE_LABELS,
  BACKSTORY_LABELS,
  OCCUPATIONS,
  SKILL_DEFINITIONS,
} from "../../domain/catalogs";
import { ATTRIBUTE_KEYS, BACKSTORY_KEYS } from "../../domain/types";
import {
  getBudgets,
  getDerived,
  getOccupation,
  initializeAttributes,
  skillTotal,
  validateCreation,
  weaponValue,
} from "../../domain/rules";
import { autoAllocate, selectOccupation } from "../../domain/allocation";
import { PORTRAITS, loadPortrait } from "../../components/art";
import { Field, Icon } from "../../components/ui";

type Props = {
  character: Character;
  onChange: (c: Character) => void;
  onRegenerate: () => void;
  onToast: (s: string) => void;
};
export default function Editor({
  character: c,
  onChange,
  onRegenerate,
  onToast,
}: Props) {
  const [section, setSection] = useState("identity");
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [portraitBusy, setPortraitBusy] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const latest = useRef(c);
  latest.current = c;
  const uploadJob = useRef(0);
  useEffect(
    () => () => {
      uploadJob.current += 1;
    },
    [],
  );
  const budgets = getBudgets(c);
  const warnings = validateCreation(c);
  const occupation = getOccupation(c.occupationId);
  function patch(value: Partial<Character>) {
    onChange({ ...c, ...value });
  }
  function editSkill(id: string, value: Partial<Skill>) {
    patch({
      skills: c.skills.map((s) => (s.id === id ? { ...s, ...value } : s)),
    });
  }
  function attrChange(key: AttributeKey, value: number) {
    const attrs = {
      ...c.attrs,
      [key]: Math.max(0, Math.min(999, Math.round(value || 0))),
    };
    const updated = {
      ...c,
      attrs,
      ...(c.phase === "draft"
        ? {
            creationAttrs: {
              ...c.creationAttrs,
              [key]: Math.max(
                0,
                c.creationAttrs[key] + attrs[key] - c.attrs[key],
              ),
            },
          }
        : {}),
    };
    onChange(updated);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      onToast("请选择 10MB 以内的 JPG、PNG 或 WebP 图片。");
      return;
    }
    const job = ++uploadJob.current;
    setPortraitBusy(null);
    try {
      const image = await createImageBitmap(file);
      if (job !== uploadJob.current) {
        image.close();
        return;
      }
      const scale = Math.min(1, 600 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close();
      onChange({
        ...latest.current,
        portrait: canvas.toDataURL("image/jpeg", 0.84),
      });
    } catch {
      onToast("图片读取失败，请换一张图片。");
    }
  }
  async function choosePortrait(preset: (typeof PORTRAITS)[number]) {
    const job = ++uploadJob.current;
    setPortraitBusy(preset.id);
    try {
      const portrait = await loadPortrait(preset.src);
      if (job === uploadJob.current) onChange({ ...latest.current, portrait });
    } catch (error) {
      if (job === uploadJob.current)
        onToast(error instanceof Error ? error.message : "肖像读取失败。");
    } finally {
      if (job === uploadJob.current) setPortraitBusy(null);
    }
  }
  function changeOccupation(id: string) {
    if (
      c.skills.some((s) => s.occupationPoints > 0) &&
      !window.confirm("更换职业将清除职业点分配，兴趣点和成长点保留。继续吗？")
    )
      return;
    onChange(selectOccupation(c, id));
  }
  function applyAge() {
    if (
      !window.confirm(
        "按当前属性执行一次年龄修正，并初始化生命、魔法、理智与幸运。之后不会重复执行。继续吗？",
      )
    )
      return;
    onChange(initializeAttributes(c, { ...c.creationAttrs }, c.initialLuck));
    onToast("年龄修正已记录，请重新检查技能点预算。");
  }
  function resetResources() {
    const d = getDerived(c);
    patch({
      resources: {
        hp: d.hp,
        mp: d.mp,
        san: Math.min(c.attrs.pow, d.sanMax),
        luck: c.resources.luck,
      },
    });
  }
  function fillPoints() {
    if (
      c.skills.some((s) => s.occupationPoints || s.interestPoints) &&
      !window.confirm(
        "重新建议将替换已有职业点和兴趣点分配，成长点保留。继续吗？",
      )
    )
      return;
    try {
      onChange(autoAllocate(c));
      onToast("已根据职业建议分配点数，请检查是否符合人物设定。");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "无法完成分配，请检查规则。");
    }
  }
  const sections = [
    ["identity", "身份与属性"],
    ["skills", "职业与技能"],
    ["equipment", "装备与资产"],
    ["story", "人物背景"],
  ];
  return (
    <div className="editor-layout">
      <nav className="editor-nav" aria-label="角色编辑分区">
        {sections.map(([value, label]) => (
          <button
            key={value}
            className={section === value ? "active" : ""}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="editor-content" key={section}>
        {c.phase === "draft" && (
          <div className="draft-note">
            <Icon name="edit" size={18} />
            <p>这是一份建卡草稿。可以先保存，准备好后再完成建卡。</p>
          </div>
        )}
        {section === "identity" && (
          <>
            <section className="editor-section">
              <div className="section-title">
                <h2>这个人是谁</h2>
                <div className="inline-actions">
                  <button
                    className="button small"
                    onClick={() => photo.current?.click()}
                  >
                    <Icon name="upload" size={16} />
                    上传头像
                  </button>
                  {c.portrait && (
                    <button
                      className="text-link"
                      onClick={() => {
                        uploadJob.current += 1;
                        setPortraitBusy(null);
                        patch({ portrait: "" });
                      }}
                    >
                      移除头像
                    </button>
                  )}
                </div>
                <input
                  ref={photo}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="portrait-picker" aria-label="预设档案肖像">
                <div className="portrait-picker-copy">
                  <strong>选一张档案照</strong>
                  <span>也可以上传自己的头像</span>
                </div>
                <div className="portrait-presets">
                  {PORTRAITS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => void choosePortrait(preset)}
                      disabled={portraitBusy !== null}
                      aria-label={`使用${preset.label}肖像`}
                    >
                      <img
                        src={preset.src}
                        alt=""
                        width={52}
                        height={68}
                        loading="lazy"
                      />
                      <span>
                        {portraitBusy === preset.id ? "读取中…" : preset.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-grid">
                <Field label="姓名">
                  <input
                    value={c.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="调查员姓名"
                  />
                </Field>
                <Field label="年龄">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={c.age}
                    onChange={(e) => {
                      const age = Math.max(
                        1,
                        Math.min(120, Math.round(Number(e.target.value) || 1)),
                      );
                      patch({
                        age,
                        ...(c.phase === "draft" && age !== c.age
                          ? { ageAdjusted: false }
                          : {}),
                      });
                    }}
                  />
                </Field>
                <Field label="性别">
                  <input
                    value={c.gender}
                    onChange={(e) => patch({ gender: e.target.value })}
                    placeholder="自由填写"
                  />
                </Field>
                <Field label="年代">
                  <select
                    value={c.era}
                    onChange={(e) => patch({ era: e.target.value })}
                  >
                    <option>1920s</option>
                    <option>现代</option>
                    <option>其他</option>
                    <option>-</option>
                  </select>
                </Field>
                <Field label="现居地">
                  <input
                    value={c.residence}
                    onChange={(e) => patch({ residence: e.target.value })}
                  />
                </Field>
                <Field label="出生地">
                  <input
                    value={c.birthplace}
                    onChange={(e) => patch({ birthplace: e.target.value })}
                  />
                </Field>
                <Field label="人物概念" className="full-width">
                  <textarea
                    rows={3}
                    value={c.concept}
                    onChange={(e) => patch({ concept: e.target.value })}
                    placeholder="用几句话记住这个人物。"
                  />
                </Field>
              </div>
            </section>
            <section className="editor-section">
              <div className="section-title">
                <h2>基础属性</h2>
                <span>常规 / 困难 / 极难</span>
              </div>
              <div className="attribute-edit-grid">
                {ATTRIBUTE_KEYS.map((key) => (
                  <label key={key} className="attribute-edit">
                    <span>
                      {ATTRIBUTE_LABELS[key]} <small>{key.toUpperCase()}</small>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={c.attrs[key]}
                      onChange={(e) => attrChange(key, Number(e.target.value))}
                    />
                    <small>
                      {Math.floor(c.attrs[key] / 2)} /{" "}
                      {Math.floor(c.attrs[key] / 5)}
                    </small>
                  </label>
                ))}
              </div>
              <p className="help-text">
                {c.phase === "draft"
                  ? "修改属性会更新初始点数预算和关联技能。已投入点数保留，请检查预算。"
                  : "当前状态与初始点数预算分别保留。修改属性不会恢复生命或理智。"}
              </p>
              <div className="derived-summary">
                {Object.entries(getDerived(c)).map(([key, value]) => (
                  <span key={key}>
                    {
                      (
                        {
                          hp: "生命上限",
                          mp: "魔法上限",
                          sanMax: "理智上限",
                          db: "伤害加值",
                          build: "体格",
                          mov: "移动率",
                        } as Record<string, string>
                      )[key]
                    }{" "}
                    <b>{value}</b>
                  </span>
                ))}
              </div>
            </section>
            <section className="editor-section">
              <h2>初始资源与年龄修正</h2>
              <div className="form-grid">
                <Field label="幸运（当前 / 开团值）">
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={c.resources.luck}
                    onChange={(e) => {
                      const luck = Math.max(
                        0,
                        Math.min(999, Math.round(Number(e.target.value) || 0)),
                      );
                      patch({
                        resources: { ...c.resources, luck },
                        ...(!c.ageAdjusted ? { initialLuck: luck } : {}),
                      });
                    }}
                  />
                </Field>
                <div className="inline-actions">
                  {c.phase === "draft" &&
                    c.rules.ageAdjustments &&
                    !c.ageAdjusted && (
                      <button className="button small" onClick={applyAge}>
                        执行一次年龄修正
                      </button>
                    )}
                </div>
              </div>
              {c.phase === "draft" && (
                <button className="button small" onClick={resetResources}>
                  按当前属性初始化资源
                </button>
              )}
              <p className="help-text">
                初始化生命、魔法和理智，保留独立设置的幸运。跑团中消耗的资源不会自动恢复。
              </p>
            </section>
            <section className="editor-section">
              <h2>规则与来源</h2>
              <p className="help-text">
                {
                  {
                    concept: "AI 人设生成",
                    random: "程序规则掷骰",
                    manual: "手动填写",
                    legacy: "旧版档案迁入",
                  }[c.method]
                }
                。年龄修正
                {c.ageAdjusted
                  ? "已应用，编辑时不会重复执行"
                  : "尚未执行或已关闭"}
                。
              </p>
              {c.ageAudit.length > 0 && (
                <ul className="audit-list">
                  {c.ageAudit.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              <Field label="初始技能上限">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={c.rules.skillCap}
                  onChange={(e) =>
                    patch({
                      rules: {
                        ...c.rules,
                        skillCap: Math.min(
                          99,
                          Math.max(1, Math.round(Number(e.target.value) || 1)),
                        ),
                      },
                    })
                  }
                />
              </Field>
              <Field label="团内规则说明">
                <textarea
                  rows={2}
                  value={c.rules.houseRules}
                  onChange={(e) =>
                    patch({ rules: { ...c.rules, houseRules: e.target.value } })
                  }
                  placeholder="与守秘人约定的例外或其他补充。"
                />
              </Field>
              {c.warnings.length > 0 && (
                <details>
                  <summary>迁移或生成说明（{c.warnings.length}）</summary>
                  <ul className="audit-list">
                    {c.warnings.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </>
        )}
        {section === "skills" && (
          <>
            <section className="editor-section">
              <div className="section-title">
                <h2>职业与点数</h2>
                <button
                  className="button small"
                  disabled={!c.occupationId}
                  onClick={fillPoints}
                >
                  <Icon name="spark" size={16} />
                  建议分配
                </button>
              </div>
              <Field label="职业">
                <select
                  value={c.occupationId}
                  onChange={(e) => changeOccupation(e.target.value)}
                >
                  <option value="">选择职业</option>
                  {OCCUPATIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              {c.occupationId === "custom" && (
                <Field label="自定义职业名称">
                  <input
                    value={c.customOccupationName}
                    onChange={(e) =>
                      patch({ customOccupationName: e.target.value })
                    }
                  />
                </Field>
              )}
              {occupation && (
                <p className="help-text">
                  {occupation.rule}。信用评级 {occupation.credit[0]}–
                  {occupation.credit[1]}。
                </p>
              )}
              <div className="budget-strip">
                <div>
                  <span>职业点剩余</span>
                  <strong
                    className={budgets.occupationRemaining < 0 ? "danger" : ""}
                  >
                    {budgets.occupationRemaining}
                    <small> / {budgets.occupationTotal}</small>
                  </strong>
                </div>
                <div>
                  <span>兴趣点剩余</span>
                  <strong
                    className={budgets.interestRemaining < 0 ? "danger" : ""}
                  >
                    {budgets.interestRemaining}
                    <small> / {budgets.interestTotal}</small>
                  </strong>
                </div>
                <div>
                  <span>职业技能（信用另计）</span>
                  <strong>
                    {
                      c.skills.filter(
                        (s) => s.occupationSelected && s.name !== "信用评级",
                      ).length
                    }
                    <small> / 8</small>
                  </strong>
                </div>
              </div>
              <p className="help-text">{budgets.formula}</p>
              {warnings.length ? (
                <details className="validation-details">
                  <summary>{warnings.length} 项待检查</summary>
                  <ul>
                    {warnings.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p className="success-text">
                  <Icon name="check" size={16} />
                  点数和职业要求检查通过。
                </p>
              )}
            </section>
            <section className="editor-section">
              <div className="section-title">
                <h2>技能分配</h2>
                <button
                  className="button small"
                  onClick={() => {
                    const id = crypto.randomUUID();
                    patch({
                      skills: [
                        ...c.skills,
                        {
                          id,
                          name: "自定义技能",
                          base: 1,
                          occupationPoints: 0,
                          interestPoints: 0,
                          growthPoints: 0,
                          occupationSelected: false,
                          custom: true,
                          pinned: false,
                        },
                      ],
                    });
                    setOnlySelected(false);
                    setQuery("");
                  }}
                >
                  <Icon name="plus" size={16} />
                  自定义技能
                </button>
              </div>
              <div className="skill-edit-tools">
                <label className="search-box">
                  <Icon name="search" size={17} />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索技能"
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={onlySelected}
                    onChange={(e) => setOnlySelected(e.target.checked)}
                  />
                  只看职业技能
                </label>
              </div>
              <div className="skill-edit-heading">
                <span>职业</span>
                <span>技能 / 基础值</span>
                <span>职业点</span>
                <span>兴趣点</span>
                <span>成长</span>
                <span>总值</span>
              </div>
              <div className="skill-edit-list">
                {c.skills
                  .filter(
                    (s) =>
                      s.name.includes(query) &&
                      (!onlySelected || s.occupationSelected),
                  )
                  .map((s) => (
                    <div
                      className={`skill-edit-row ${s.occupationSelected ? "selected" : ""}`}
                      key={s.id}
                    >
                      <label className="occupation-check">
                        <input
                          type="checkbox"
                          aria-label={`${s.name}设为职业技能`}
                          checked={s.occupationSelected}
                          disabled={
                            s.name === "克苏鲁神话" || s.name === "信用评级"
                          }
                          onChange={(e) =>
                            editSkill(s.id, {
                              occupationSelected: e.target.checked,
                            })
                          }
                        />
                      </label>
                      <div className="skill-edit-name">
                        {s.custom ||
                        SKILL_DEFINITIONS.find(
                          (d) => d.id === s.id,
                        )?.name.includes("（自选）") ? (
                          <input
                            value={s.name}
                            onChange={(e) =>
                              editSkill(s.id, { name: e.target.value })
                            }
                            aria-label={
                              s.custom ? "自定义技能名称" : "技能专长名称"
                            }
                          />
                        ) : (
                          <span>{s.name}</span>
                        )}
                        <small>
                          基础{" "}
                          {s.custom ? (
                            <input
                              className="custom-base-input"
                              aria-label={`${s.name}基础值`}
                              type="number"
                              min={0}
                              max={999}
                              value={s.base}
                              onChange={(e) =>
                                editSkill(s.id, {
                                  base: Math.max(
                                    0,
                                    Math.min(
                                      999,
                                      Math.round(Number(e.target.value) || 0),
                                    ),
                                  ),
                                })
                              }
                            />
                          ) : s.baseType === "dodge" ? (
                            Math.floor(c.attrs.dex / 2)
                          ) : s.baseType === "ownLanguage" ? (
                            c.attrs.edu
                          ) : (
                            s.base
                          )}
                          {s.custom && (
                            <button
                              className="text-link danger"
                              onClick={() =>
                                patch({
                                  skills: c.skills.filter((x) => x.id !== s.id),
                                })
                              }
                            >
                              删除
                            </button>
                          )}
                        </small>
                      </div>
                      {(
                        [
                          "occupationPoints",
                          "interestPoints",
                          "growthPoints",
                        ] as const
                      ).map((field, i) => (
                        <label className="skill-number" key={field}>
                          <span>{["职业点", "兴趣点", "成长"][i]}</span>
                          <input
                            aria-label={`${s.name}${["职业点", "兴趣点", "成长"][i]}`}
                            type="number"
                            min={0}
                            max={999}
                            value={s[field]}
                            disabled={
                              field !== "growthPoints" &&
                              (s.name === "克苏鲁神话" ||
                                (field === "occupationPoints" &&
                                  !s.occupationSelected))
                            }
                            onChange={(e) =>
                              editSkill(s.id, {
                                [field]: Math.max(
                                  0,
                                  Math.min(999, Number(e.target.value) || 0),
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <strong className="skill-edit-total">
                        {skillTotal(s, c)}
                      </strong>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}
        {section === "equipment" && (
          <>
            <section className="editor-section">
              <div className="section-title">
                <h2>武器</h2>
                <button
                  className="button small"
                  onClick={() =>
                    patch({
                      weapons: [
                        ...c.weapons,
                        {
                          id: crypto.randomUUID(),
                          name: "新武器",
                          skillId:
                            c.skills.find((s) => s.name === "格斗（斗殴）")
                              ?.id || null,
                          skillName: "格斗（斗殴）",
                          manualValue: null,
                          damage: "1D3+DB",
                          range: "接触",
                          ammo: "—",
                          malfunction: "—",
                        },
                      ],
                    })
                  }
                >
                  <Icon name="plus" size={16} />
                  添加武器
                </button>
              </div>
              {!c.weapons.length && (
                <p className="help-text">没有武器记录，可根据人物设定添加。</p>
              )}
              {c.weapons.map((w) => (
                <div className="weapon-editor" key={w.id}>
                  <div className="section-title">
                    <input
                      value={w.name}
                      aria-label="武器名称"
                      onChange={(e) =>
                        patch({
                          weapons: c.weapons.map((x) =>
                            x.id === w.id ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon-button danger"
                      aria-label="删除武器"
                      onClick={() =>
                        patch({
                          weapons: c.weapons.filter((x) => x.id !== w.id),
                        })
                      }
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field label="关联技能">
                      <select
                        value={w.skillId || ""}
                        onChange={(e) =>
                          patch({
                            weapons: c.weapons.map((x) =>
                              x.id === w.id
                                ? {
                                    ...x,
                                    skillId: e.target.value || null,
                                    skillName:
                                      c.skills.find(
                                        (s) => s.id === e.target.value,
                                      )?.name || x.skillName,
                                    manualValue: e.target.value
                                      ? null
                                      : x.manualValue,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="">独立成功率</option>
                        {c.skills.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={w.skillId ? "成功率（随技能变化）" : "独立成功率"}
                    >
                      <input
                        type="number"
                        value={weaponValue(w, c)}
                        readOnly={!!w.skillId}
                        onChange={(e) =>
                          patch({
                            weapons: c.weapons.map((x) =>
                              x.id === w.id
                                ? { ...x, manualValue: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                    </Field>
                    {(["damage", "range", "ammo", "malfunction"] as const).map(
                      (key, i) => (
                        <Field
                          key={key}
                          label={["伤害", "射程", "弹药", "故障"][i]}
                        >
                          <input
                            value={w[key]}
                            onChange={(e) =>
                              patch({
                                weapons: c.weapons.map((x) =>
                                  x.id === w.id
                                    ? { ...x, [key]: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </Field>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </section>
            <section className="editor-section">
              <h2>随身物品与资产</h2>
              <Field label="随身物品">
                <textarea
                  rows={6}
                  value={c.possessions}
                  onChange={(e) => patch({ possessions: e.target.value })}
                />
              </Field>
              <div className="form-grid">
                <Field label="现金">
                  <input
                    value={c.assetCash}
                    onChange={(e) => patch({ assetCash: e.target.value })}
                  />
                </Field>
                <Field label="消费水平">
                  <input
                    value={c.assetSpending}
                    onChange={(e) => patch({ assetSpending: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="资产与其他财务说明">
                <textarea
                  rows={5}
                  value={c.assetDetails}
                  onChange={(e) => patch({ assetDetails: e.target.value })}
                />
              </Field>
              <p className="help-text">
                信用评级引用技能表中的同一数值，避免重复填写。
              </p>
            </section>
          </>
        )}
        {section === "story" && (
          <>
            <section className="editor-section">
              <div className="section-title">
                <h2>人物的内里</h2>
                <button className="button small" onClick={onRegenerate}>
                  <Icon name="spark" size={16} />
                  AI 重写背景草稿
                </button>
              </div>
              <div className="form-grid">
                {BACKSTORY_KEYS.map((key) => (
                  <Field label={BACKSTORY_LABELS[key]} key={key}>
                    <textarea
                      rows={3}
                      value={c.backstory[key]}
                      onChange={(e) =>
                        patch({
                          backstory: { ...c.backstory, [key]: e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </section>
            <section className="editor-section">
              <h2>完整背景故事</h2>
              <Field label="人物经历">
                <textarea
                  rows={12}
                  value={c.story}
                  onChange={(e) => patch({ story: e.target.value })}
                  placeholder="这个人从哪里来，又为什么开始调查？"
                />
              </Field>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
