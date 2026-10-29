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
