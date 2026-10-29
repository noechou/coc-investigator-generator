# 页面总览

本目录用于让其他 agent 快速了解当前界面。先看截图索引，再按需要读取对应源码。

- 截图规格：**1920 × 1080 像素，PNG，浏览器原始输出**，未放大、未拼接。
- 版本基线：`faee721`，已合入克苏鲁卷宗风新前端，包含限阅书库、烛光档案、状态徽记和双主题材质。
- 数据：隔离浏览器中的虚构示例角色，不使用玩家现有存档或真实密钥。
- 范围：桌面主要页面与关键弹窗；长页面拍摄首屏，打印截图并非完整 PDF。
- 动画：截图停在稳定状态，不能通过静态图片判断动效。

用浏览器打开 [index.html](index.html) 可浏览缩略图并打开原图。所有原图位于 [1080p/](1080p/)，机器可读索引为 [manifest.json](1080p/manifest.json)。

| 截图 | 页面 | 主要内容 |
|---|---|---|
| [01-library-paper](1080p/01-library-paper.png) | 档案库 · 纸质 | 限阅书库、最近卷宗、档案卡与新建入口 |
| [02-library-dark](1080p/02-library-dark.png) | 档案库 · 深色 | 相同内容的深色工作台 |
| [03-create-ai-paper](1080p/03-create-ai-paper.png) | AI 建卡 | 烛光档案、人物概念、年代与服务配置入口 |
| [04-create-random-paper](1080p/04-create-random-paper.png) | 规则掷骰建卡 | 随机创建与展开的建卡规则 |
| [05-create-ai-dark](1080p/05-create-ai-dark.png) | AI 建卡 · 深色 | 深色建卡弹窗 |
| [06-play-character-paper](1080p/06-play-character-paper.png) | 跑团 · 角色 | 当前状态、肖像、常用技能、属性和检定台 |
| [07-play-character-dark](1080p/07-play-character-dark.png) | 跑团 · 深色 | 深色角色面板 |
| [08-play-skills-paper](1080p/08-play-skills-paper.png) | 跑团 · 技能 | 搜索、常用筛选、困难与极难值 |
| [09-play-equipment-paper](1080p/09-play-equipment-paper.png) | 跑团 · 装备 | 武器检定、随身物品与资产 |
| [10-play-notes-paper](1080p/10-play-notes-paper.png) | 跑团 · 记录 | 调查笔记、状态变化和检定历史 |
| [11-edit-identity-paper](1080p/11-edit-identity-paper.png) | 编辑 · 身份属性 | 预设肖像、身份、概念与属性编辑 |
| [12-edit-skills-paper](1080p/12-edit-skills-paper.png) | 编辑 · 职业技能 | 职业要求、点数预算与技能分配 |
| [13-edit-equipment-paper](1080p/13-edit-equipment-paper.png) | 编辑 · 装备资产 | 关联技能、武器数据与资产编辑 |
| [14-edit-backstory-paper](1080p/14-edit-backstory-paper.png) | 编辑 · 人物背景 | 背景细项与 AI 重写入口 |
| [15-ai-settings-paper](1080p/15-ai-settings-paper.png) | AI 服务设置 | 服务地址、模型名与空白密钥框 |
| [16-print-paper](1080p/16-print-paper.png) | 打印预览 | 核心角色卡在浏览器中的预览 |
| [17-import-paper](1080p/17-import-paper.png) | 导入确认 | 文件摘要与重复角色的处理方式 |
| [18-draft-paper](1080p/18-draft-paper.png) | 建卡草稿 | 草稿提示、身份填写和完成入口 |

## 对应源码

| 区域 | 文件 |
|---|---|
| 档案库 | `src/features/library/Library.tsx` |
| 建卡 | `src/features/creation/Creation.tsx` |
| 角色编辑 | `src/features/character/Editor.tsx` |
| 跑团面板 | `src/features/play/Play.tsx` |
| 打印 | `src/features/print/PrintSheet.tsx` |
| 应用壳、设置和导入 | `src/app/App.tsx` |
| 主题与布局 | `src/styles/tokens.css`、`app.css` |
| 美术和动效 | `src/styles/eldritch.css`、`src/components/VeilReveal.tsx`、`src/assets/art/` |

这些截图用于视觉交接，不代表一次新增的功能测试或真实 AI 联调。后续修改界面后应重新截图，并更新版本号与索引。
