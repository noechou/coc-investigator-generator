# 视觉资产

2026-10-29 使用 Magpie 生图 MCP（返回模型为 `codex/gpt-image-2`）为本项目生成。人物均为虚构角色肖像，不对应真实人物。

| 网页文件 | 内容 | 使用位置 |
|---|---|---|
| `arkham-rain.jpg` | 1920 年代阿卡姆雨夜、钟楼与街灯 | 档案库街景 |
| `arkham-rain-small.jpg` | 同图的 720px 版本 | 手机档案库 |
| `investigation-desk.jpg` | 台灯、旧照、手记和放大镜 | 建卡窗口 |
| `portrait-investigator.jpg` | 调查员肖像 | 可选预设、示例人物 |
| `portrait-journalist.jpg` | 记者肖像 | 可选预设 |
| `portrait-scholar.jpg` | 学者肖像 | 可选预设 |

全部网页图片约 880KB；手机首页仅加载约 120KB 的街景版本，肖像按需加载。生成原图留在本地 `art-source/`，不进入网站构建和 git。网页版本由 `sips` 裁切、压缩为 JPEG。

肖像预设选用后转成 data URL 写入角色，随 JSON 备份携带，不依赖预设图片地址。现有玩家头像保持原样。

动效放在 `src/styles/atmosphere.css`：首次展开、页签与弹窗、卡片反馈、骰点揭晓。雨幕仅在街景区域使用 CSS 动画，无视频、动效库或外部运行时；系统开启“减少动态效果”时停止动画与过渡。

## 第三版视觉（克苏鲁卷宗风）

2026-10-29 同样用 Magpie 生图 MCP 生成。新素材放在 `src/assets/art/`，由 Vite 打包并加哈希；原图留在本地 `art-source/`（不进 git）。

| 文件 | 内容 | 使用位置 |
|---|---|---|
| `paper-tile.jpg` / `dark-tile.jpg` | 旧纸与暗皮革纹理，已压平光照并镜像成无缝平铺 | 两套主题的页面底纹、卡片纸面 |
| `library-hero.jpg` | 密斯卡托尼克大学限阅书库 | 档案库主视觉 |
| `creation-ritual.jpg` | 烛光下的空白档案，烟雾聚成人形 | 建卡弹窗侧图 |
| `roll-board.jpg` | 烛光仪式桌与骰子 | 检定台背景、检定结果弹窗 |
| `veil.jpg` | 刻有远古印记的暗色玻璃帷幕 | 生成角色后的“帷幕破碎”动画 |
| `sigil.png` | 旧印（透明） | 品牌标、检定台底纹、加载动画 |
| `emblem-hp/mp/san/luck.png` | 四项状态的铜版画徽记 | 状态条 |
| `wax-seal.png` `paperclip.png` `tape.png` | 火漆、回形针、胶带 | 人物概览、档案库最近卷宗 |
| `corner-tentacle.png` `divider.png` `empty-tome.png` | 触手角花、分隔饰、空状态插画 | 弹窗、档案库页脚、空状态 |

样式集中在 `src/styles/eldritch.css`，最后加载，覆盖 `app.css` 的材质与配色，不改布局。主题令牌在 `tokens.css`。

- 理智联动：`Play.tsx` 按“当前理智 / 初始 POW”算出五档，写到 `<html data-sanity>`；CSS 据此加深屏幕四周的暗角，低理智时标题偶发抖动。离开跑团页即清除。
- 检定结果按六档（大成功 … 大失败）着色，大失败轻微震动，大成功印记发光。
- 帷幕破碎：`src/components/VeilReveal.tsx`，AI 生成或规则掷骰建卡后播放约 2.5 秒，点击可跳过；手动建卡不播放。系统开启“减少动态效果”时不显示。
