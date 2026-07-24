# 设计方案:事件模块(Events)

> 状态:**需求 & 方案设计中**(2026-07-24)。本文档为实现前的需求与架构设计,UI 视觉设计随后进行。
> 若干产品决策仍待 Joycai 拍板,见 §9「开放问题」。

## 0. 需求回顾

主持人在房间内可创建「事件」并分阶段向玩家公开,类似道具/线索但语义是「叙事事件」。

1. **入口**:主持人功能区的「道具管理」按钮重命名为「**道具/事件**」,点击展开一个**主题化下拉菜单**(不能用原生 `<select>`/未经主题覆盖的控件),含两项:「道具管理」(即现有道具管理)与「事件管理」(新增)。
2. **创建事件**:标题;时间(可选,复用「插入时间线分割」的各种时间表达);事件描述(支持 markdown,且可用 `@` 引用背包里的角色/物品/线索/情报,逻辑同记事本 —— 查看者若没有该引用则回退成普通文本);可附加 **0~3 张图片**。创建后进入事件面板。
3. **排序**:事件可上移/下移/置顶/置底/输入序号定位。
4. **公开**:事件创建后默认「未公开」。主持人可点击事件选择「公开」,公开时选择**全体**或**有限玩家**;公开后向公共频道发送一张**卡片**。若为有限玩家,则**未选中的玩家能看到卡片但内容不可见**,选中的玩家可见完整内容。
5. **玩家查看**:被授权的玩家(全体公开时=所有人)可在自己的事件信息里随时回看完整内容。
6. **玩家事件面板**:玩家视角顶栏也要有一个事件面板,用来回顾历史事件。
7. **记事本联动**:记事本也能 `@` 链接事件。
8. **公开状态(主持人视角)**:每个事件有 3 态 —— **未公开 / 部分公开 / 完全公开**。部分公开可随时**追加知晓人员**,并可**转为完全公开**;已公开可**撤回**(需二次确认)。

## 1. 现状调研结论(决定架构的关键事实)

### 1.1 道具系统是最接近的模板,但它没有排序

- 道具用**两表**建模:`inventory_items`(母本,主持人所有)+ `inventory_distributions`(每个接收者一行的授予记录,`toUserId = null` 表示公开给全体)。四类道具(clue/info/character/item)靠 `item_type` 一个判别列区分,无独立表。(`src/db/schema.ts:227-271`)
- **没有 `sortOrder`/`position` 列**,所有读取一律 `orderBy desc(createdAt)`;需求 3 的手动排序需要我们**新增**排序列 + 排序 action —— 道具系统不能直接照抄这一点。(确认:全库无 reorder/moveUp 等逻辑)
- 图片**不以 base64 存库**:上传经 `POST /api/rooms/[id]/images`(≤1MB,JPEG/PNG/GIF/WebP,`ImageCropper` 画布裁剪并重编码为 JPEG),落盘到 `cache/chat-images/`,DB 只存相对路径 URL(`imageUrl` 单值,当前每项仅 1 张)。事件需要 0~3 张 —— 复用同一上传接口,但用**数组**存多张。(`src/app/api/rooms/[id]/images/route.ts`、`src/components/shared/ImageCropper.tsx`)

### 1.2 `@` 引用有两套,事件要复用「记事本那套」

- **`MentionTarget`**(`src/components/room/types.ts:43`)是**聊天**的 @ 成员系统 —— 引用的是房间成员,**不是**背包条目。事件描述**不用**它。
- **`NotebookLinkEntity`**(`src/lib/notebook.ts:29`,`{ id, type, title }`)才是记事本引用**背包条目**用的。核心解析 `segmentMentions()`(`src/lib/notebook.ts:44`):`@` 后按**标题最长前缀**匹配,匹配不到就当普通文本(自然降级)。存的是**纯标题不是 id**,所以引用的条目消失/查看者没有时会静默退化为纯文本。
- `MarkdownRenderer`(`src/components/shared/MarkdownRenderer.tsx`)接受可选 `mentions={{ entities, render }}`,聊天不传、记事本传。事件描述渲染**直接复用**这条链路,无需改渲染器。
- 让**事件本身可被记事本 `@`**(需求 7):往记事本可链接实体表里追加 `{ id, type:'event', title }`,并在 `notebook-helpers.tsx` 的 `ENTITY_META` 加一个 `event` 条目(图标/主题色)。**注意**:`NotebookLinkEntity.id` 目前被假定全表唯一(去重按 `entity.id`),事件 id 与道具 id 会撞号 —— 需改为按 `type:id` 复合键去重,否则同号的事件与道具会被当成同一实体。

### 1.3 「未选中玩家看到锁定卡片」是全新可见性形态

这是本功能**最需要设计**的一点。现有可见性模型是**二元**的:

- `canSee()`(`src/lib/messaging/audience.ts:38`)对 `everyone/self/recipient/directed/dm/gm` 做全有或全无判定。**非接收者根本收不到那条消息** —— SSE 路由在推送前就把事件丢弃(`src/app/api/rooms/[id]/events/route.ts:109`),历史加载也用等价的 SQL `WHERE` 过滤掉(`messageVisibilityWhere`)。**不存在**「广播给所有人、对部分人脱敏」的机制。
- 现有「有限公开线索」的做法(`src/app/actions/clue.ts:145`)恰恰**回避**把内容放进公共频道:它只给选中者发 `recipient` 回执 pill(内容在背包里),对未选中者什么都不发。

因此需求 4 的「未选中者看到锁定卡片」必须新造**脱敏广播**:公共频道那张卡片只承载**非敏感元数据**(事件 id + 标题 + 公开模式),**绝不**在广播 payload 里带描述正文;是否解锁由客户端判断「本 id 是否在本人可访问事件集合内」。正文永远走**受控的服务端拉取**(按可见性表鉴权),客户端拿不到未授权内容。详见 §3。

### 1.4 卡片/时间/SSE 的现成件

- **卡片渲染**:消息表用复用的 `dice_detail` 列(text)承载结构化 JSON,按 `type`/`systemKind` 分派渲染(`ChatMessage.tsx`)。现代「卡片」范式 = `type:'system'` + 新 `systemKind` + 结构化 `diceDetail` + 专属渲染组件(**`timeline-divider` 就是这个范式**)。事件卡片照此新增一个 `systemKind`。
- **时间表达**:`src/lib/messaging/timeline-payload.ts` 就是需求 2 要复用的时间模型 —— 两条正交轴:日期轴 `mode`(第 N 日 / 日历日期 / 自由文本)+ 时段轴 `timeMode`(上午/下午/夜晚 段落,或 `HH:MM` 时钟)。可直接复用 `TimelineDividerData` 类型、`buildTimelinePayload/parseTimelinePayload`、`composeTimelineLabel(data,t,locale)`。选择器 UI 照 `TimelineDividerDialog.tsx`。
- **主题化下拉**:顶栏已有两处**内联主题下拉**(齿轮系统菜单、AI/Bot 菜单,`RoomTopBar.tsx:283/432`),用 `relative` 容器 + 图标按钮 + 条件渲染 `absolute ... bg-surface border border-border rounded-lg shadow-xl py-1.5 overlay-pop` 菜单 + `useClickOutside`。需求 1 的「道具/事件」菜单**照此内联范式**做(比全宽表单控件 `BadgeDropdown` 更贴合小图标菜单)。
- **顶栏按钮 & 状态接线**:玩家面板开关是 `showX/setShowX` 对,声明在 `RoomClient`,同时下发给 `RoomTopBar`(按钮)与 `RoomOverlays`(渲染面板)。新事件面板照抄这条接线。(`RoomTopBar.tsx:231-279`、`RoomClient.tsx:67-86`)
- **SSE 广播**:`broadcastToRoom(roomId, { type, ... })`(`src/lib/events.ts`),客户端在 `useRoomEvents.ts` 按 `data.type` 加分支。`inventory_updated`(bump 一个 refreshKey 触发面板重取)是最贴切的先例。新增 type 定为 `events_updated`。

## 2. 数据模型

> 命名避让:SSE 事件中枢在 `src/lib/events.ts`、SSE 路由在 `src/app/api/rooms/[id]/events/`。本功能领域是「叙事事件」,故库表用 `story_events` 前缀以免与 SSE 概念混淆;server action 文件 `src/app/actions/event.ts`;i18n 命名空间 `event`。

### `story_events` —— 事件母本(主持人所有)

| 列 | 类型 | 空 | 说明 |
| --- | --- | --- | --- |
| `id` | serial PK | 否 | |
| `roomId` | integer FK→rooms (cascade) | 否 | |
| `creatorId` | integer FK→users (cascade) | 否 | 创建的主持人 |
| `title` | text | 否 | 标题 |
| `description` | text default `''` | 否 | markdown 正文,含 `@标题` 引用(存纯标题,渲染期解析) |
| `timePayload` | text | **是** | 可选。`TimelineDividerData` 的 JSON;渲染期用 `composeTimelineLabel` 出标签 |
| `imagesJson` | text default `'[]'` | 否 | 0~3 张图片 URL 的 JSON 数组(复用图片上传路由的相对路径) |
| `status` | text default `'unpublished'` | 否 | `'unpublished' | 'partial' | 'full'` —— 需求 8 的三态**权威来源** |
| `sortOrder` | integer | 否 | 主持人手动排序(需求 3);新建取当前 max+1 |
| `createdAt` | timestamptz(string) default now | 否 | |
| `updatedAt` | timestamptz(string) default now | 否 | |

### `story_event_visibility` —— 部分公开时的「谁可见」

| 列 | 类型 | 空 | 说明 |
| --- | --- | --- | --- |
| `id` | serial PK | 否 | |
| `eventId` | integer FK→story_events (cascade) | 否 | |
| `userId` | integer FK→users (cascade) | 否 | 被授权的玩家(**非空**;全体公开不枚举成员) |
| `viewed` | boolean default false | 否 | 未读徽标用 |
| `createdAt` | timestamptz(string) default now | 否 | 追加知晓人员的先后 |

唯一约束 `(eventId, userId)`。索引 `(userId)` 便于按玩家取可见事件。

**为何全体公开不枚举成员**:`status='full'` 直接表示「全房可见」,鉴权按房间成员判定 —— 这样**后加入**的玩家也能看到已完全公开的事件,且避免插入 N 行。部分公开才逐人建行。

### 鉴权(单一判定函数)

```
canViewEvent(event, userId, isHost):
  isHost 或 userId === event.creatorId      → true(主持人/作者恒可见)
  status === 'unpublished'                  → false(仅主持人)
  status === 'full'                         → true(任意房间成员)
  status === 'partial'                      → userId ∈ story_event_visibility  → true;否则 false
```

服务端所有取正文的 action 都过这个判定;客户端卡片锁定态由「本 id 是否在本人可访问集合」体现,二者一致。

## 3. 公开 / 锁定卡片机制(核心)

### 3.1 一张卡片,状态动态求值

- 首次公开(unpublished→partial 或 →full)时,派发**一条**公共频道消息:`type:'system'`、`systemKind:'event-card'`(新增)、`audience:'everyone'`、`content` 为降级文案(如 `📜 事件:{title}`)、`diceDetail = JSON({ eventId, title, mode:'full'|'partial' })`。**payload 不含描述正文与知晓名单**。
- 卡片**锁定/解锁**由客户端判断:`eventId` 是否在**本查看者的可访问事件 id 集合**内(集合来自 `getMyEventsAction`,由 `RoomClient` 持有并随 SSE 刷新)。
  - 在集合内 → **解锁卡**:显示标题 +(推荐)时间标签,点击打开事件面板定位到该事件看完整内容。
  - 不在集合内 → **锁定卡**:显示🔒 + 标题(是否露出标题见 §9-Q1),不可点击。
- 正文永不进广播,杜绝未授权客户端读到内容;这与线索「内容在背包、频道只放指针」的哲学一致。

### 3.2 状态流转不再重复发卡

- **追加知晓人员**(partial):插入 `story_event_visibility` 行 → `broadcastToRoom(events_updated)` → 客户端重取可访问集合 → 这些玩家的那张卡片**就地解锁**;同时给**新增者**发 `recipient` 回执 pill(「你获得了新事件:{title}」,指向事件面板),因为他们没有触发过公共大卡片。
- **转为完全公开**(partial→full):`status='full'` → 广播刷新 → 所有原本锁定的卡片就地解锁;可附一条轻量系统行「事件《X》已完全公开」(见 §9-Q2)。
- **撤回**(→unpublished,二次确认):`status='unpublished'`,清空可见性行 → 广播刷新 → 卡片对所有人回到锁定并标注「已撤回」;玩家事件面板同步失去该事件。(撤回是否彻底收回访问见 §9-Q3)
- **编辑正文/图片**:因正文实时从面板受控拉取,已授权玩家下次打开即见最新;可选地给已读者置 `updated` 标记 + 回执(照道具 `updated` 徽标),见 §9-Q4。

### 3.3 排序(需求 3)

`sortOrder` integer 列。主持人操作:上移/下移(与相邻交换)、置顶/置底、输入序号定位(重排一段)。仅主持人可排序;玩家面板与主持人面板都按 `sortOrder` 升序展示。排序 action 广播 `events_updated`。

## 4. Server Actions(`src/app/actions/event.ts`,沿用返回结果对象/`throw` 的项目约定)

| Action | 权限 | 作用 |
| --- | --- | --- |
| `createEventAction(roomId, data)` | host | 建母本;`sortOrder`=max+1;`status='unpublished'` |
| `updateEventAction(roomId, eventId, data)` | host | 改标题/时间/正文/图片;广播刷新;(可选)对已读者置 updated |
| `deleteEventAction(roomId, eventId)` | host | 删事件(可见性级联);清理其磁盘图片文件 |
| `reorderEventAction(roomId, eventId, op)` | host | `op` = up/down/top/bottom/`{index:n}`;重排 `sortOrder` |
| `publishEventAction(roomId, eventId, target)` | host | `target` = `'all'` 或 `number[]`;设 status(full/partial),partial 建可见性行;首发派发公共 `event-card`;给选中者发回执 |
| `addEventViewersAction(roomId, eventId, userIds)` | host | 仅 partial;追加可见性行 + 回执;广播刷新 |
| `promoteEventToFullAction(roomId, eventId)` | host | partial→full;广播刷新 |
| `retractEventAction(roomId, eventId)` | host | →unpublished;清可见性;广播刷新(前端二次确认) |
| `getRoomEventsAction(roomId)` | host | 全部事件(含未公开)+ 每个的 status/知晓人数,按 sortOrder |
| `getMyEventsAction(roomId)` | member | 本人可见事件(full + 自己是知晓者的 partial),含正文,按 sortOrder |
| `getMyEventIdsAction(roomId)` | member | 仅可见 id 集合(卡片锁定态用,轻量) |
| `markEventsViewedAction(roomId)` | member | 置本人未读为已读(未读徽标) |
| `getUnreadEventCountAction(roomId)` | member | 顶栏未读数 |

- 图片上传复用 `POST /api/rooms/[id]/images`;action 侧仅存/校验 URL 数组(≤3)。
- 机器人不作为知晓人选、不进玩家面板(照记事本 `shareNoteAction` 排除 bot)。

## 5. 前端组件(`src/components/room/event/`)

- `EventManagePanel.tsx` —— 主持人「事件管理」:列表(标题/时间/状态徽标 未公开·部分公开 N人·完全公开/缩略图)+ 创建、编辑、删除、排序控件、公开入口。
- `EventEditor.tsx` —— 创建/编辑:标题、时间选择器(照 `TimelineDividerDialog`)、markdown 正文 + `@` 引用选择器(照 `NotebookEditor`,实体来自主持人背包)、0~3 图上传(照 `ImageCropper`)。
- `PublishEventDialog.tsx` —— 选择 全体/有限 + 玩家多选(排除 bot)。
- `EventPanel.tsx` —— 玩家事件面板:本人可见事件列表 + 详情(markdown+引用渲染、时间标签、图片,`ImagePreview` 灯箱)。随时回看。
- `EventCard.tsx` —— 公共频道卡片渲染(解锁/锁定/已撤回三态),由 `ChatMessage.tsx` 的 `systemKind==='event-card'` 分派。
- 复用:`MarkdownRenderer`(带 `mentions`)、`ImageCropper`/`ImagePreview`、`useClickOutside`、`OverlayShell`、`Icons.*`、`timeline-payload` 助手。

## 6. 顶栏与菜单改动

1. **主持人组**:把「道具管理」按钮(`RoomTopBar.tsx:416`,`Icons.ClipboardList`,vermilion `iconPrimary*`)改为 `relative` 容器 + 图标按钮 + 内联主题菜单(照 AI/Bot 菜单),tooltip 改「道具/事件」,菜单两项:**道具管理**(现有 `setShowItemManager`)、**事件管理**(新 `setShowEventManage`)。`useClickOutside` 关闭。
2. **玩家组(Group 1)**:在 角色/背包/记事本/成员 一带新增「事件」图标按钮(建议 `Icons.ScrollText` 或 `Icons.CalendarClock`),开关 `showEvents`,带未读徽标(照背包 `unreadItems`)。
3. **状态接线**:`RoomClient` 新增 `showEventManage`(主持人)、`showEvents`(玩家)两组 `showX/setShowX`,分别下发给 `RoomTopBar` 与 `RoomOverlays`;`RoomOverlays` 里 `{showEventManage && isHost && <EventManagePanel/>}`、`{showEvents && <EventPanel/>}`。

## 7. SSE

- 变更(建/改/删/排序/公开/追加/转全/撤回)后 `broadcastToRoom(roomId, { type:'events_updated', eventId })`。
- `useRoomEvents.ts` 加分支:`events_updated` → bump `eventsRefreshKey`(触发面板与可访问集合重取,进而卡片就地更新锁定态)。回执 pill 走既有消息通道无需新分支。

## 8. i18n

`messages/{zh,en}.json` 新增 `event.*` 命名空间(面板标题、状态、按钮、时间选择器复用 `room` 现有 timeline 文案)。注意勿在文案里放裸 `<...>`(见 memory `i18n-icu-angle-brackets`)。

## 9. 产品决策(Joycai 已拍板,2026-07-24)

- **Q1 锁定卡片露出标题** ✅ —— 未选中玩家看到的锁定卡片**露出标题 + 锁定正文**(知道「发生了某事件《X》」制造张力)。
- **Q2 转全公开补提示** ✅ —— partial→full 时在公共频道补一条**轻量系统行**「事件《X》已完全公开」,提醒在场者卡片已解锁。
- **Q3 撤回=彻底收回** ✅ —— 撤回后事件回到「未公开」,原知晓玩家在事件面板**也不再能看到**它;公共卡片标注「已撤回」并锁定。
- **Q4 编辑有更新提示** ✅ —— 公开后编辑正文/图片,照道具 `updated` 机制:已读知晓者看到「已更新」徽标并收到一条回执。
- **Q5 图片首图作封面**:0~3 张,首图作列表缩略/卡片封面,顺序可调(待实现细化,非阻塞)。

---

## 附:关键文件索引(实现期参照)

- 道具模板:`src/db/schema.ts:227-271`、`src/app/actions/inventory.ts`、`src/components/room/inventory/`
- 记事本引用:`src/lib/notebook.ts`、`src/components/shared/MarkdownRenderer.tsx`、`src/components/room/notebook/{NotebookEditor,NotebookViewer,notebook-helpers}.tsx`
- 可见性/卡片:`src/lib/messaging/audience.ts`、`src/lib/messaging/router.ts`、`src/app/api/rooms/[id]/events/route.ts`、`src/components/room/chat/ChatMessage.tsx`、`src/app/actions/clue.ts`(有限公开先例)
- 时间:`src/lib/messaging/timeline-payload.ts`、`src/components/room/chat/TimelineDividerDialog.tsx`
- 顶栏/菜单/SSE:`src/components/room/RoomTopBar.tsx`、`RoomClient.tsx`、`RoomOverlays.tsx`、`src/lib/events.ts`、`src/lib/useClickOutside.ts`、`src/components/room/hooks/useRoomEvents.ts`
- 图片上传:`src/app/api/rooms/[id]/images/route.ts`、`src/components/shared/ImageCropper.tsx`
