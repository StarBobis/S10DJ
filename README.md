# Set 10 混音台

**简体中文** | [English](README.en.md)

一个把《云顶之弈》**S10 强音争霸（Remix Rumble）/ 13.24 补丁**的自适应配乐系统搬到桌面的项目，使用 Tauri 2 + Vue 3 构建。把英雄放上棋盘，程序会像游戏一样选择鼓组、和弦与旋律三层；也可以完全不管英雄，直接手动编排整段混音。

最新发布：[v0.2.0](https://github.com/StarBobis/S10DJ/releases/tag/v0.2.0)

![混音台](assets/screenshots/desk.webp)

## 功能

- **单页工作台**：英雄池、4x7 六边形棋盘、英雄 Spotlight、羁绊和三通道混音台同屏显示。
- **电台模式**：自动生成主题阵容并开始播放，一个流派组合完整放完一首歌（约 **2:45–3:22**，取决于流派和时期）才切换组合与时期；可一键跳到下一台。爱心喜欢当前组合，心碎则以后不再随机到这个组合，设置页可管理不喜欢列表。
- **流派工坊**：不需要上阵英雄，生成全部 **458 种可用 1-3 流派组合**；支持给单个流派和组合点赞，点赞会改变推荐排序，烬（戏命师）组合默认置顶。
- **天选**：把某个英雄设为天选，使其一个羁绊 +1，对应游戏里推动羁绊层级的天选机制。
- **阵容文件**：把棋盘、星级、天选、时期、混音模式和三层设置导出/导入为 JSON。
- **中文本地化**：英雄、羁绊、流派名支持英文和简体中文，中文名来自 Riot 的 `zh_CN` 赛季数据。
- **实时视觉**：选中的英雄会成为全局模糊壁纸，面板保持半透明；混音台顶部有实时波形/频谱分析。
- **S10 美术**：60 张云顶英雄 Banner 用于界面，60 张方形赛季原画只用于全局壁纸。

![流派工坊](assets/screenshots/style-lab.webp)

## 游戏混音机制

配乐由三层组成，每层由自己的 Wwise 开关选择：

```
Set_Switch_set10_<style>_<layer>      layer in { drums, chords, top }
```

13.24 的 `Map22.wad.client` 开关表里共有 **33 个开关名**。当某层没有任何流派占用时，使用 `none` 基础音轨。

| 流派 id | 羁绊 | 提供的层 |
| --- | --- | --- |
| `8bit` | 8 比特 | 鼓组、和弦 |
| `classical` | 戏命师（烬） | 旋律 |
| `country` | 乡村音乐 | 鼓组、和弦 |
| `dj` | DJ 娑娜 | 鼓组 |
| `edm` | 电子舞曲 | 鼓组、和弦 |
| `emo` | EMO | 鼓组、和弦 |
| `funk` | 迪斯科 | 鼓组、和弦 |
| `hyperpop` | 高能流行 | 旋律 |
| `illbeats` | 大触打击乐 | 鼓组、旋律 |
| `jazz` | 爵士乐 | 旋律 |
| `kda` | K/DA | 鼓组、和弦、旋律 |
| `none` | 基础 | 鼓组、和弦、旋律 |
| `pentakill` | 五杀摇滚 | 鼓组、和弦、旋律 |
| `popband` | 心之钢 | 鼓组、和弦、旋律 |
| `punkrock` | 朋克 | 鼓组、和弦 |
| `truedamage` | 真实伤害 | 鼓组、和弦、旋律 |

Riot 的设计访谈确认：混音由**弈子数量**驱动；羁绊层级会提高该流派的占比；像戏命师（烬）这样的单体羁绊总会占住一层。本项目的实现是：

```
weight(style) = units(style) + tierIndex(style breakpoints, count)

对每一层：
  选择能提供该层、权重最高的流派
  权重相同 -> 羁绊层级更高者优先，再按数据优先级
  没有可用流派 -> none

单体羁绊（classical、dj、illbeats）在普通胜者之前占一层
天选：在计算层级前给指定羁绊 +1
```

精确的权重算术和平局规则是**有证据支持的重建**，不是对游戏原生客户端的逐字节复制。已确认和未建模的部分都列在 **设置 -> 混音规则审计** 里：

![规则审计](assets/screenshots/rules-audit.webp)

未建模：会增加羁绊或英雄的纹章、强化符文、传送门；Wwise 阶段音乐和转场音效；客户端内部精确的平局规则。

## 快速开始

### 环境要求

- Windows 10/11，带 WebView2 运行时（Tauri 桌面版）
- [Bun](https://bun.sh/)，用于前端
- Rust 稳定版，用于 `tauri dev` / `tauri build`
- 只有重新生成美术/数据时才需要 Python 3.14 + Pillow + NumPy

### 运行

```powershell
bun install
bun run dev        # 浏览器开发服务器：http://127.0.0.1:8787
bun run app:dev    # Tauri 窗口（无边框、自定义标题栏）
bun run build      # vue-tsc --noEmit + 生产构建
bun run app:build  # NSIS 安装包
```

浏览器模式适合调 UI。Tauri 模式额外提供原生窗口、asset 协议以及 Rust 的数据/设置命令。

### 音频分轨

源码仓库刻意不包含提取后的音频（`assets/audio_ogg` 和 `assets/audio` 都在 git 忽略列表中）。没有分轨时界面仍能运行，但播放会提示文件缺失。

把转换好的分轨放到 `assets/audio_ogg`：

```
assets/audio_ogg/
  kda_late_drums.ogg
  kda_late_main.ogg
  ...
  durations.json
```

`tools/convert_stems.py` 会把 `assets/audio` 里的 AAC 提取音频转成 OGG，`tools/build_dataset.py` 负责重建 JSON 数据。**设置 -> 音频诊断** 会显示解析到的目录、找到的分轨数量、缺失项，并做一次 3 条分轨的解码测试。

### 英雄原画与舞台

120 张英雄图片和舞台背景已经提交到仓库，所以新克隆下来就能看到完整界面。需要重新生成时：

```powershell
python tools/fetch_hero_art.py     # banner/ + wallpaper/ + credits.json
python tools/make_board_art.py     # stage.webp + grain.png
```

两个脚本都是幂等的；第一个脚本加 `--force` 会重新下载全部原画。重新生成美术后要重启 Vite，因为 `import.meta.glob` 只会求值一次。

## 使用混音台

1. 在英雄池里选英雄，或把英雄池切换到 **羁绊** 分组。
2. 左键上阵，右键移除，拖动六边形移动/交换，双击升星。
3. 选中英雄打开 Spotlight：升星、移除，或设为天选。
4. 按 **播放**，然后实时切换层开关、推音量、手动指定流派。
5. 把 **模式** 切到 **流派**（Style Lab），不上英雄也能编排；层机架、筛选和点赞都在那里。
6. 用顶栏的两个箭头导出/导入阵容 JSON。
7. **电台** 会自动生成阵容；`下一台` 立即切换，爱心喜欢当前组合，心碎以后不再随机到它，停止后会恢复你之前的棋盘和设置。被拉黑的组合在 **设置 > 不喜欢的组合** 里管理。

阵容文件是可移植的 JSON：

```json
{
  "format": "set10-desk-lineup",
  "version": 1,
  "set": 10,
  "patch": "13.24",
  "era": "late",
  "mixMode": "board",
  "units": [
    { "apiName": "TFT10_Jhin", "star": 2, "slot": 10, "headliner": "Maestro" }
  ],
  "layers": {
    "drums": { "enabled": true, "volume": 1, "override": null },
    "chords": { "enabled": true, "volume": 1, "override": null },
    "top": { "enabled": true, "volume": 1, "override": null }
  }
}
```

## 架构

```
Vue 3 + TypeScript (Vite)
  ChampionPool / BoardStage / StyleLab / HeroSpotlight / TraitsPanel
  MixerPanel / Waveform / TransportBar / GlobalWallpaper
        |
  src/stores/desk.ts  (棋盘、方案、电台、阵容、传输控制)
  src/stores/likes.ts (持久化的点赞与电台拉黑)
        |
  src/core/  data.ts  rules.ts  combos.ts  audio.ts  art.ts
        |
  Tauri 2 / Rust
    asset_root, scan_stems, load_data, load_settings,
    save_settings, log_event
```

关键实现说明：

- `src/core/rules.ts` 计算流派权重、单体羁绊占位和三层的最终方案。
- `src/core/combos.ts` 为每个可用 1-3 流派组做流派与不同层的匹配，保证组合里的每个流派都真的参与。
- `src/core/audio.ts` 每条分轨一个 Web Audio voice，平滑增益、共享循环区间，并暴露主分析器。
- `src/stores/desk.ts` 负责棋盘编辑、手动模式、由音频播放位置驱动的电台轮换和阵容导入导出。
- 打包版通过 Rust 命令和 Tauri asset 协议读取 `data/` 与 `assets/audio_ogg/`；英雄美术由 Vite 打进包里。

### Rust 命令

| 命令 | 用途 |
| --- | --- |
| `asset_root` | 解析分轨目录 |
| `scan_stems` | 列出 OGG 分轨、时长、缺失项 |
| `load_data` | 从仓库/资源目录读取 JSON 数据 |
| `load_settings` / `save_settings` | 读写应用配置目录里的 JSON 设置 |
| `log_event` | 把混音诊断输出到 stdout |

## 项目结构

```
data/set10_units.json        60 个英雄：费用、羁绊、流派、美术、nameZh
data/music_rules.json        流派、层、阈值、分轨、中文标签
src/core/rules.ts            权重、单体羁绊、层分配
src/core/combos.ts           458 种可用流派组合
src/core/audio.ts            Web Audio 混音器 + 分析器
src/core/data.ts             数据加载、Tauri 命令、分轨 URL
src/core/art.ts              Banner / 壁纸 / 舞台查找
src/stores/desk.ts           响应式工作台、电台、阵容
src/stores/likes.ts          持久化点赞与电台拉黑
src/components/              英雄池、棋盘、Spotlight、羁绊、混音台、
                             StyleLab、PoolCard、Waveform、GlobalWallpaper
src/assets/heroes/banner/    60 张云顶英雄 Banner
src/assets/heroes/wallpaper/ 60 张方形赛季原画
src/assets/board/            生成的舞台和颗粒纹理
src/assets/screenshots/      README 截图
src/i18n/                    英文 + 简体中文文案
src-tauri/                   Rust 后端和 Tauri 配置
assets/audio_ogg/            转换后的分轨（git 忽略）
tools/                       提取、转换、数据集和美术脚本
.agents/skills/              可复用的流程经验
tmp/                         临时目录（不提交）
```

## 重新生成数据

```powershell
curl.exe -k -o tmp/tftdata/en_us.json https://raw.communitydragon.org/13.24/cdragon/tft/en_us.json
curl.exe -k -o tmp/tftdata/zh_cn.json  https://raw.communitydragon.org/13.24/cdragon/tft/zh_cn.json
python tools/build_dataset.py
```

脚本会把 `nameZh`、`traitNamesZh`、`styleNamesZh` 写成 `\u` 转义，因此数据文件保持 ASCII，UI 里正常显示中文。

## 常见问题

**8787 端口被占用** - `bun run app:dev` 会通过 `tools/dev-server-guard.mjs` 复用已有的 Vite 服务。Vite 绑定的是 `127.0.0.1`，不要用 `localhost`（它可能解析到 `::1`）。

**没有声音** - 打开 **设置 -> 音频诊断**。分轨目录里必须有 OGG 文件和 `durations.json`。浏览器模式由 Vite 提供文件；打包版通过 `asset_root` 和 asset 协议解析 `assets/audio_ogg`。

**浏览器里改了代码不生效** - 如果某个 Vue 组件的转换结果看起来是旧的，停掉并重新运行 `bun run dev`；快速连续编辑时 Vite 偶尔会保留单个文件的旧转换缓存。

**Tauri 窗口里拖拽无效** - 保持 `app.windows[0].dragDropEnabled` 为 `false`；否则 WebView2 的文件拖放处理会吞掉 HTML5 拖拽事件。

**打包版找不到数据** - `load_data` 读取打包进去的 `data` 资源。检查 `src-tauri/tauri.conf.json -> bundle.resources` 是否同时包含 `../data` 和 `../assets/audio_ogg`。

## 来源与致谢

- 音频：从 S10 游戏构建和社区提取版中整理；OGG 转换和分轨清单在 `tools/` 里。音频文件不提交到源码仓库。
- 美术：来自 CommunityDragon 的 13.24 云顶英雄 Banner / 原画；`src/assets/heroes/credits.json` 记录了每个来源 URL。
- 规则：13.24 `Map22.wad.client` 的开关/状态表、CommunityDragon 赛季数据，以及 Riot 的强音争霸设计访谈。
- 这是粉丝项目。《云顶之弈》及其素材归 Riot Games 所有，本项目与 Riot 无关联，也未获其背书。

可复用的研究和构建笔记在 `.agents/skills/`：
`tft-set10-music-system`、`tft-champion-portraits`、`lol-wad-extraction`、
`riot-old-patch-extraction`、`tauri-vue-mixing-desk`、`browser-cdp-smoke-test`。

## 许可证

本仓库的源代码使用 **GNU 通用公共许可证第 3 版（GPL-3.0-only）**。完整文本见 [LICENSE](LICENSE)。

《云顶之弈》《英雄联盟》及其游戏素材、音频、名称和图像归 Riot Games 所有，**不**在 GPL 的覆盖范围内。它们仅作为非商业粉丝项目的一部分被使用或下载；来源和署名见 [来源与致谢](#来源与致谢)。如果你重新分发构建，请保留代码的 GPL 声明，并单独尊重 Riot 的素材权利。

## 已知限制

- 权重公式和平局规则是重建的；游戏内的选层代码是原生实现，并没有以可读规则表的形式随游戏发布。
- 点赞与电台拉黑都保存在本机（没有账号或服务器），没有全局点赞数。
- 纹章、强化符文、传送门、阶段音乐和转场音效不在范围内。
- 应用优先支持 Windows（Tauri/WebView2）；Web 开发服务器也可以在其他桌面平台运行。
