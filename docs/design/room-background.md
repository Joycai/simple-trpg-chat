# 设计方案:房间背景图(沉浸模式)

> 状态:方案已确认,待实现(2026-07-14)。全部决策见 §9,无遗留开放问题。
> 目标:主持人可在房间内预先上传若干背景图并随时切换,全屏氛围展示;
> 通过"主题罩层 + 玩家强度滑块"解决主题一致性与聊天可读性问题。

## 0. 需求回顾

1. 主持人在房间内预传若干背景图,游玩中随时切换(或关闭)。
2. 背景图全屏展示,但不得破坏主题一致性、不得影响聊天区可读性。
3. 上传上限放宽到 **5MB**;服务端统一压缩为 **WebP** 保存(节约带宽与空间)。
4. **GIF 直接拒收**(不做动图背景)。
5. 背景图存储与聊天图片缓存**目录区隔**;admin 后台清理时背景图作为**显式独立选项**。
6. 部署文档需说明 nginx / Caddy 的请求体大小配置。
7. 目标部署环境为 Linux,`sharp` 无兼容性顾虑。

## 1. 现状调研结论

### 1.1 可复用的基建

| 现有能力 | 位置 | 复用方式 |
| -------- | ---- | -------- |
| 聊天图片上传管线(multipart、MIME 白名单、防路径穿越、按房间鉴权) | `/api/rooms/[id]/images` + `src/lib/uploads.ts` | 结构照搬,新开一组 backgrounds 路由与独立目录 |
| 房间设置广播 | `broadcastToRoom(roomId, { type: "room_settings_updated" })`(`src/app/actions/room.ts` 多处) | 切换背景直接复用;客户端 `useRoomEvents.ts:66` 收到即 `router.refresh()`,无需新事件类型 |
| 主题系统(6 主题,`--theme-*` RGB 变量) | `src/themes/<name>/theme.css` + `globals.css` `@theme inline` | 每主题新增罩层变量,背景图经主题滤镜显示 |
| admin 图片缓存管理(按房间/时间范围清理、用量统计) | `src/lib/image-cache.ts` + `src/app/actions/image-cache.ts` + `AdminImageCacheManager.tsx` | 扩展为双目录统计;清理面板加"背景图"显式选项 |
| 房间设置面板(host 侧) | `src/components/room/RoomSettings.tsx` | 新增"背景图"区块 |

### 1.2 关键差异:背景图不是"缓存"

`cache/chat-images` 的语义是可丢弃缓存(丢了聊天里 404 降级)。背景图是主持人**预先准备、跨场次复用**的素材,被清掉会直接破坏备团成果。因此:

- 独立目录 `cache/room-backgrounds/`(可经 `ROOM_BACKGROUND_DIR` 覆盖);
- **不参与**聊天图片的常规清理;admin 清理时必须显式勾选才动它(§6);
- 数据库存文件登记表(§2),文件与 DB 行同生共死,避免"目录里有孤儿文件"或"DB 指向不存在的文件"。

## 2. 数据库设计

### 2.1 新表 `room_backgrounds`

```ts
export const roomBackgrounds = pgTable('room_backgrounds', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),   // 磁盘文件名:<roomId>-<ts>-<rand>.webp
  title: text('title'),                   // 可选备注,如"教堂内景",列表里好认
  sizeBytes: integer('size_bytes').notNull(), // 压缩后大小,admin 统计直接 SUM
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull().defaultNow(),
}, (t) => ({
  idxRoom: index('idx_room_backgrounds_room').on(t.roomId),
}));
```

### 2.2 `rooms` 表新增列

```ts
backgroundId: integer('background_id')
  .references(() => roomBackgrounds.id, { onDelete: 'set null' }),
```

语义:当前激活的背景;`null` = 关闭背景。用外键而非 URL 字符串,删除背景行时 `set null` 自动兜底,不会残留悬空引用(删除激活背景的 action 内仍需主动广播一次,见 §4)。

迁移:`pnpm db:push`(新表 + 可空新列,无破坏性;沿用对 `ai_token_usages` truncate 提示答 No 的注意事项)。

## 3. 上传与压缩管线

### 3.1 新依赖:`sharp`

`pnpm add sharp`。目标环境 Linux,预编译二进制开箱即用。若未来采用 Next `output: "standalone"` 部署,需确认 sharp 的原生文件被带进产物(next/image 场景下 Next 官方本就推荐安装 sharp,风险低)。

重编码顺带的安全红利:输出永远是 sharp 重新生成的干净 WebP,原文件的 EXIF、畸形块、隐藏 payload 一律丢弃。

### 3.2 路由:`POST /api/rooms/[id]/backgrounds`

新文件 `src/app/api/rooms/[id]/backgrounds/route.ts`,流程:

```
checkRoomAccess(roomId, true)            // 仅 host(第二参 requireHost)
接收 multipart "file"
MIME 白名单:image/jpeg | image/png | image/webp   // ← GIF 不在名单,直接 415
原始大小校验:0 < size ≤ 5MB(读入 buffer 后二次校验,防伪造 header)
数量上限:该房间已有背景数 < ROOM_BACKGROUND_MAX_COUNT(建议 12)→ 超限 409
sharp(buffer)
  .rotate()                              // 按 EXIF 方向摆正(随后元数据即被丢弃)
  .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 80 })
  .toBuffer()
  // sharp 解码失败(伪装成图片的非图片)→ 415
写文件 cache/room-backgrounds/<roomId>-<ts>-<rand>.webp
插入 room_backgrounds 行(事务外写文件、成功后插行;插行失败则删文件回滚)
返回 { id, url, sizeBytes }
```

压缩参数汇总:长边 ≤ 2560px、quality 80、强制 WebP。5MB 的照片级原图预期落在 200–600KB。

常量与目录助手放 `src/lib/backgrounds.ts`(对照 `uploads.ts`):`BACKGROUND_UPLOAD_MAX_BYTES = 5MB`、`ROOM_BACKGROUND_MAX_COUNT = 12`、`getRoomBackgroundDir()`(`ROOM_BACKGROUND_DIR` env 可覆盖,默认 `<cwd>/cache/room-backgrounds`)、`resolveRoomBackgroundPath()`(同款防穿越校验)。

### 3.3 路由:`GET /api/rooms/[id]/backgrounds/[filename]`

对照聊天图片的 serving 路由:房间成员鉴权 → 文件名单段校验 → 读文件返回,`Content-Type: image/webp`,`Cache-Control: private, max-age=31536000, immutable`(文件名含随机段,内容不可变,可放心长缓存)。文件缺失返回 404,客户端按"背景关闭"降级。

## 4. Server Actions(新文件 `src/app/actions/background.ts`)

沿用项目约定:`"use server"`、zod、返回结果对象。

| Action | 权限 | 行为 |
| ------ | ---- | ---- |
| `listRoomBackgroundsAction(roomId)` | host | 返回该房间全部背景(id、url、title、sizeBytes、是否激活) |
| `setRoomBackgroundAction(roomId, backgroundId \| null)` | host | 校验 backgroundId 属于本房间 → 更新 `rooms.backgroundId` → `broadcastToRoom(room_settings_updated)`。`null` = 关闭背景 |
| `renameRoomBackgroundAction(roomId, id, title)` | host | 改备注,≤50 字符 |
| `deleteRoomBackgroundAction(roomId, id)` | host | 删 DB 行(激活中则外键 `set null`)→ 删磁盘文件(失败仅告警,不阻塞)→ 若删的是激活背景,广播一次 |

上传走 §3.2 的 Route Handler 而非 server action(multipart + 二进制,route 更合适,且绕开 server action 的 body 限制,见 §7)。

## 5. 前端呈现:主题罩层 + 玩家滑块

### 5.1 渲染层级

房间页(`src/app/rooms/[id]/page.tsx` 服务端已取 room,把激活背景 URL 传入 `RoomClient`)新增背景层,置于全部 UI 之下:

```
z-0  背景图层   fixed inset-0,object-cover,opacity 由玩家滑块控制
z-0  罩层       fixed inset-0,主题色 scrim(见 5.2)+ backdrop-blur
z-10 现有 UI    聊天区、面板等
```

切换背景时 `room_settings_updated` → `router.refresh()` → 新 URL 下发;客户端对图片层做 300ms 淡入淡出(与 `globals.css` 现有过渡风格一致),预加载完成后再切,避免闪白。

### 5.2 主题罩层变量

每个 `src/themes/<name>/theme.css` 新增(dark/light 两形态各配一套):

```css
--theme-bg-scrim: 10 19 22;        /* 罩层颜色,通常取 --theme-bg 同族 */
--theme-bg-scrim-alpha: 0.72;      /* 罩层不透明度 */
--theme-bg-image-blur: 6px;        /* 背景图模糊半径 */
```

`globals.css` 提供默认值兜底(未定义的主题自动获得合理罩层)。效果:任何图片先被模糊再被主题色调染色,提供的是氛围而非像素细节——图片与主题的"打架"由罩层吸收,六个主题各自决定自己的染色倾向(cthulhu 深渊黑绿、parchment 暖褐……)。

### 5.3 聊天区可读性底线

背景激活时,消息流容器与各面板由 `bg-surface` 切换为高不透明度半透明(约 92%)+ `backdrop-blur-sm`。做法:背景激活时在根节点挂 `data-room-bg` 属性,由 CSS 统一下调 surface 透明度,**不改动**各组件的语义 token 用法。对比度由 surface 自身保证,与背景内容完全解耦。

### 5.4 玩家侧强度滑块(localStorage,不进 DB)

设置入口放 TopBar 齿轮菜单的个人设置分区(紧随"个人设置"一项),仅当 host 已设背景时出现,滑块 0–100:

- 控制背景图层 opacity;**0 = 完全关闭**(同时移除 blur 与罩层渲染,省 GPU);
- key:`room-bg-intensity`(全局一份即可,无需按房间);默认 60;
- 顺带解决低配设备 `backdrop-filter` 性能问题——拉到 0 即回到纯色主题渲染路径。

滑块状态由 `src/components/room/hooks/useRoomBgIntensity.ts`(模块级 store + `useSyncExternalStore`)在 `RoomBackground`(绘制图层)与 `RoomTopBar`(滑块 UI)两棵互不相干的子树间共享,避免穿过 RoomTopBar 冗长的 props 透传。

> 早期实现曾把滑块做成聊天区右下角的浮动按钮,与"回到最新消息"按钮重叠(两者分属不同子树,z-index 只能决定谁盖住谁),已按本节回归菜单入口。该角落现在只属于滚动按钮。

### 5.5 Host 管理 UI

`RoomSettings.tsx` 新增"背景图"区块(仅 host 可见):缩略图网格(每格:图、备注、大小、激活标记)、点击即切换、"关闭背景"按钮、上传按钮(前端限 5MB + 类型提示)、每格悬浮删除/重命名。数量上限 12,满时上传按钮禁用并提示。

## 6. Admin 后台:统计与显式清理

扩展现有 `image-cache` 体系,不另起页面:

- `src/lib/image-cache.ts`:`getImageCacheStats()` 增加背景目录的独立统计(总量、按房间),与聊天图片**分列**返回;背景图大小可直接 SUM `room_backgrounds.sizeBytes`,与磁盘实测互为校验。
- `cleanupImageCacheAction(scope, range)` 增加参数 `includeBackgrounds: boolean`,**默认 false**——不勾选永远不碰背景图(需求 5 的"显式选项")。
- 勾选清理背景时:删文件 + 删 `room_backgrounds` 行(激活引用被 `set null`)+ 对受影响且激活了背景的房间各广播一次 `room_settings_updated`。
- `AdminImageCacheManager.tsx`:分栏展示"聊天图片 / 背景图"两组用量;清理对话框加"同时清理背景图"复选框,并配红色警示文案("背景图为主持人备团素材,清理不可恢复")。
- `admin/actions.ts` 的 `deleteRoom`:级联删除该房间背景文件(DB 行由外键 cascade 自动删)。

## 7. 部署文档(写入 README / docs 部署章节)

上传路由是 Route Handler(非 server action),Next.js 侧对 route body 无 1MB 限制,**无需**调 `serverActions.bodySizeLimit`。需要配置的是反向代理:

### nginx

默认 `client_max_body_size 1m`,5MB 上传会被 nginx 直接 413,请求根本到不了应用:

```nginx
# 全局或 server 块;也可只对上传路径放宽
client_max_body_size 6m;   # 留 1m 余量

# 精确控制(可选):
location ~ ^/api/rooms/[0-9]+/backgrounds$ {
    client_max_body_size 6m;
    proxy_pass http://127.0.0.1:3000;
    # ...其余 proxy_* 同站点通用配置
}
```

SSE 端点的既有要求不变(`proxy_buffering off`、超时放宽),与本功能无冲突。

### Caddy

Caddy v2 **默认不限制**请求体大小,零配置即可工作。若站点显式配置过 `request_body`,确保不低于 6MB:

```caddyfile
example.com {
    request_body {
        max_size 6MB
    }
    reverse_proxy 127.0.0.1:3000
}
```

## 8. 涉及文件清单

| 类型 | 文件 |
| ---- | ---- |
| 依赖 | `package.json`(+`sharp`) |
| 改 | `src/db/schema.ts`(`room_backgrounds` 表 + `rooms.backgroundId` + relations) |
| 新 | `src/lib/backgrounds.ts`(常量、目录助手、路径校验、sharp 压缩封装) |
| 新 | `src/app/api/rooms/[id]/backgrounds/route.ts`(POST 上传+压缩) |
| 新 | `src/app/api/rooms/[id]/backgrounds/[filename]/route.ts`(GET 服务) |
| 新 | `src/app/actions/background.ts`(list / set / rename / delete) |
| 改 | `src/app/rooms/[id]/page.tsx`(下发激活背景 URL) |
| 新 | `src/components/room/RoomBackground.tsx`(背景层+罩层+淡入淡出) |
| 新 | `src/components/room/hooks/useRoomBgIntensity.ts`(强度 store,跨子树共享) |
| 改 | `src/components/room/RoomTopBar.tsx`(齿轮菜单内的强度滑块) |
| 改 | `src/components/room/RoomClient.tsx`(挂载背景层与 `data-room-bg`) |
| 改 | `src/components/room/RoomSettings.tsx`(host 背景管理区块) |
| 改 | `src/themes/*/theme.css` ×6 + `src/app/globals.css`(scrim 变量 + surface 半透明规则 + 兜底) |
| 改 | `src/lib/image-cache.ts`、`src/app/actions/image-cache.ts`(双目录统计 + `includeBackgrounds`) |
| 改 | `src/components/admin/images/AdminImageCacheManager.tsx`(分栏 + 显式复选框) |
| 改 | `src/app/admin/actions.ts`(`deleteRoom` 级联删背景文件) |
| 改 | `messages/zh.json`、`messages/en.json`(`roomBackground.*`、admin 清理文案) |
| 改 | README / 部署文档(§7 反代配置) |
| 测试 | 上传路由测试(MIME 拒收含 GIF、5MB 边界、数量上限、host-only)、serving 路由测试(对照现有 `images` 路由测试)、清理 `includeBackgrounds` 默认不触碰背景 |

## 9. 已确认决策(2026-07-14,Joycai)

1. 背景图为**主持人预传多张、随时切换**模式。
2. 呈现采用**全屏氛围模式**:主题色罩层 + 模糊 + 玩家本地强度滑块(0 = 关闭);聊天区 surface 保持高不透明度,可读性与背景内容解耦。
3. 上传上限 **5MB**,服务端 **sharp 压缩为 WebP** 后保存与使用(长边 2560px / q80)。
4. **GIF 直接拒收**。
5. 背景图**独立目录**,不参与聊天图片常规清理;admin 清理面板中为**显式独立选项**(默认不清理)。
6. 目标环境 Linux,sharp 兼容性不作为风险项。
7. 部署文档标注 nginx / Caddy 请求体配置(§7)。
8. 每房间背景数量上限 **12**;主持人可为每张背景**命名**(`title` 字段 + 重命名入口,§2.1 / §4 / §5.5)。
9. **不做**场景横幅模式(含后续迭代均不列入)。
10. 玩家强度滑块默认值 **60**,玩家本地自行调整。
11. 所有新增 UI(host 背景管理区块、玩家滑块、admin 清理复选框)必须**只用语义 token**(`bg-surface`、`border-border`、`text-text-muted`、`rounded-theme` 等),风格对齐现有面板(如 `InvitesTab` / `AiPointsTab` 的卡片风格),六主题自动覆盖,不出现任何硬编码颜色。
