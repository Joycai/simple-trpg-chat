# 设计方案:邀请码注册模块

> 状态:已实现(2026-07-09)。开放问题由 Joycai 拍板(见 §7)。
> 实现与本方案的偏差:systemConfig 键名采用与现有键一致的下划线风格
> (`invite_registration_enabled` / `invite_default_quota`);admin 配置区块复用
> `updateSystemConfigBatch`,未新增独立的 `updateInviteConfigAction`。

## 0. 需求回顾

1. host(主持人)可在设置面板生成邀请码,每人 4 次额度;用完可找 admin 重置,admin 可见每人剩余次数。
2. 邀请码 48 小时未使用自动失效,额度返还。
3. 新增注册页,凭邀请码注册,新账号角色为 `player`,一码一人。
4. admin 可在后台把 player 改为 host。
5. 核查 host 能否以普通 player 身份加入其他 host 的房间。
6. 新 UI 遵循现有设计与主题系统。

## 1. 现状调研结论

### 1.1 角色体系

角色枚举定义于 `src/db/schema.ts`:`USER_ROLES = ['admin', 'host', 'player']`。需求中的 "hoster" 即现有的 **`host`**,本方案沿用该值,不新增角色。

### 1.2 需求 4 已经存在,无需开发

`src/app/admin/actions.ts` 的 `updateUser(id, displayName, role)` 已允许 admin 将任意用户在 `player / host / admin` 间切换(内置 admin 有防降级锁),且会调用 `invalidateSessionCache` 让角色变更立即生效。admin 后台用户管理 UI(`AdminUserManager.tsx`)已有入口。**结论:需求 4 零改动。**

### 1.3 需求 5 核查结论:已支持,无需改动

- `joinRoomAction`(`src/app/actions/room.ts:74`)**没有任何角色限制**,只校验房间密钥。host 用同一密钥即可加入他人房间。
- 房间内的"主持人权限"不看全局 role,而看 `room.hostId === userId`:
  - 页面:`src/app/rooms/[id]/page.tsx:39` — `const isHost = room.hostId === userId`
  - 权限助手:`src/lib/auth-helpers.ts` 的 `checkRoomAccess` 同样以 `room.hostId` 判定
  - SSE 隐私过滤:`/api/rooms/[id]/events/route.ts` 通过 `checkRoomAccess` 取 `isHost`,再喂给 `canSee` — host 进入他人房间时**看不到**暗骨、私聊等 KP 专属消息,与普通 player 完全一致 ✅
- 全局 `role === 'host'` 只影响三处:创建房间、bot 预设列表、AI 工具入口 — 均不干扰"以玩家身份游玩"。
- 唯一例外:**admin** 在 `checkRoomAccess` 中无条件返回 `isHost: true`(现有设计如此),admin 无法以纯玩家身份游玩。属既有行为,不在本次范围。

**结论:host 加入其他 host 的房间时就是普通 player,无需改动。方案中不再涉及此项。**

## 2. 数据库设计

### 2.1 新表 `invite_codes`(第 18 张表)

```ts
export const INVITE_CODE_STATUS = ['active', 'used', 'expired', 'revoked'] as const;
export type InviteCodeStatus = (typeof INVITE_CODE_STATUS)[number];

export const inviteCodes = pgTable('invite_codes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: text('code').notNull().unique(),           // 生成后不可变
  creatorId: integer('creator_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').$type<InviteCodeStatus>().notNull().default('active'),
  usedByUserId: integer('used_by_user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp(...).notNull().defaultNow(),
  expiresAt: timestamp(...).notNull(),             // createdAt + 48h,写入时算好
  usedAt: timestamp(...),
}, (t) => ({
  idxCreator: index('idx_invite_codes_creator').on(t.creatorId, t.status),
}));
```

状态机:`active → used`(注册成功)/ `active → expired`(超 48h,返还额度)/ `active → revoked`(创建者主动撤销,返还额度,可选功能)。`used/expired/revoked` 为终态。

码格式:`crypto.randomBytes(9)` → base32 → 分组为 `XXXX-XXXX-XXXX`(约 45 bit 熵,不可暴力枚举;去除易混淆字符 0/O/1/I)。

### 2.2 `users` 表新增列

```ts
inviteQuota: integer('invite_quota').notNull().default(4),
```

语义:**剩余可生成次数**。生成时 -1,失效/撤销时 +1,admin 重置回配置的默认额度。用独立计数列而非从 `invite_codes` 推导,是因为"admin 重置"语义(清零重来)用推导式无法表达。

### 2.3 systemConfig 新增两个键(复用现有 `system_config` 表)

| key | 默认值 | 说明 |
| --- | ------ | ---- |
| `invite.registrationEnabled` | `true` | 全局注册开关。关闭时 `/register` 页显示"注册未开放",`registerAction` 直接拒绝 |
| `invite.defaultQuota` | `4` | 默认邀请额度。admin 重置时写入该值;admin 建号/升级为 host 时也读该值初始化 |

列级 default 4 仅作兜底;运行时以配置值为准。

迁移:`pnpm db:push` 即可(新表 + 带默认值的新列,无破坏性;沿用 CLAUDE.md 中对 `ai_token_usages` truncate 提示答 No 的注意事项)。

### 2.4 过期处理:惰性失效,不引入定时任务

项目无 cron 基础设施,SSE 也不适合挂后台任务。采用**惰性 sweep**:在读取/消费邀请码的三个入口(设置面板加载、注册校验、admin 用户列表加载)前,先执行一条原子 UPDATE:

```sql
UPDATE invite_codes
SET status = 'expired'
WHERE status = 'active' AND expires_at < now()
RETURNING creator_id;
```

再按 RETURNING 结果给对应 creator 的 `invite_quota` +1(同一事务内)。因为只有 `active → expired` 这一次状态跃迁能进入 RETURNING,并发调用也**恰好返还一次**,天然幂等。封装为 `src/lib/invites.ts` 中的 `sweepExpiredInvites(tx)`。

## 3. Server Actions(新文件 `src/app/actions/invite.ts`)

沿用项目约定:`"use server"`、zod 校验、返回结果对象不抛异常。

| Action | 权限 | 行为 |
| ------ | ---- | ---- |
| `generateInviteCodeAction()` | `role === 'host'` | 事务:sweep → `UPDATE users SET invite_quota = invite_quota - 1 WHERE id = ? AND invite_quota > 0 RETURNING`(条件更新防并发透支,0 行则报"额度不足")→ 插入 code。返回 `{ code, expiresAt, remaining }` |
| `listMyInviteCodesAction()` | host | sweep → 返回本人全部码及状态、使用者 displayName、过期时间 |
| `revokeInviteCodeAction(id)` | host(本人的码) | `UPDATE ... SET status='revoked' WHERE id=? AND creator_id=? AND status='active' RETURNING`,成功则额度 +1(已确认纳入范围;也是 48h 内码泄露时的自救手段) |
| `registerAction(formData)` | **公开(未登录)** | 见 §4 |
| `resetInviteQuotaAction(userId)` | admin(放在 `admin/actions.ts`) | `SET invite_quota = <invite.defaultQuota>`。仅对 host 生效 |
| `updateInviteConfigAction(enabled, defaultQuota)` | admin(放在 `admin/actions.ts`) | 写 systemConfig 两键;defaultQuota 限 0–99 整数 |

注:admin 不参与邀请码生成(admin 已可在后台直接建号),`generateInviteCodeAction` 严格要求 `role === 'host'`。

## 4. 注册流程

### 4.1 路由与中间件

- 新页面 `/register`(`src/app/register/page.tsx` + `RegisterForm.tsx`),结构复刻 `/login`。
- `src/proxy.ts` matcher 排除项追加 `|register`;`auth.config.ts` 的 `authorized` 回调中,`/register` 比照 `/login` 处理(已登录访问则按角色重定向走)。

### 4.2 `registerAction` 事务(核心防重逻辑)

```
读 systemConfig:invite.registrationEnabled 为 false → 返回"注册未开放"
zod 校验(username 3–20 字符、password ≥ 8、code 格式)
db.transaction:
  1. sweepExpiredInvites(tx)
  2. UPDATE invite_codes SET status='used', used_at=now()
     WHERE code=? AND status='active' AND expires_at > now()
     RETURNING id
     → 0 行:返回"邀请码无效或已过期"(不区分具体原因,防探测)
  3. INSERT users (role='player', displayName 默认=username,
     passwordHash=bcrypt(10)) — username 撞唯一约束则整个事务回滚,
     邀请码自动回到 active ✅
  4. UPDATE invite_codes SET used_by_user_id = 新用户id
成功 → redirect('/login?registered=1'),登录页显示成功提示
```

一码一人由第 2 步的条件 UPDATE 保证:两个并发请求用同一码,只有一个能把 `active` 改成 `used`。

不做自动登录:Credentials provider 下注册后跳登录页最简单可靠,也复用登录页现成的 sessionToken 轮转/登录历史逻辑。

### 4.3 登录页联动

`LoginForm.tsx` 底部加一行入口:"有邀请码?→ 注册";并处理 `?registered=1` 成功横幅(样式对齐现有 `reason=elsewhere` 提示)。

### 4.4 防滥用

- 码本身 45 bit 熵,枚举不可行;失败响应统一文案。
- 可选加固:对 `registerAction` 按 IP 做内存滑动窗口限流(如 10 次/小时),与 `sessionCache` 同款 Map 方案即可,不引入新依赖。

## 5. UI 设计

### 5.1 设置面板新 Tab「邀请码」

`UserSettingsPanel.tsx` 的 Tab 数组追加 `["invites", Ticket, ts("tabInvites")]`(lucide `Ticket` 图标),**仅当 `userRole === 'host'` 时渲染**。新组件 `src/components/user/settings/InvitesTab.tsx`:

- 顶部额度卡:剩余次数大数字 + "生成邀请码"按钮(额度 0 时禁用,提示"请联系管理员重置")。
- 生成成功后置顶展示新码 + 复制按钮 + "48 小时内有效"。
- 下方历史列表:码(等宽字体)、状态 pill(待使用=primary / 已使用=success + 使用者 / 已失效=text-muted / 已撤销=danger)、剩余有效时间、active 码带撤销按钮。
- 全部使用语义 token(`bg-surface`、`border-border`、`text-text-muted`、`rounded-theme`、`bg-primary/10` 等),与 `AiPointsTab` 的卡片风格对齐 → 六个主题自动覆盖。

### 5.2 注册页

复刻 login 页的居中卡片布局与语义 token(login/register 页当前均在主题系统内用默认主题渲染)。字段:邀请码(自动大写、按 `XXXX-XXXX-XXXX` 分组)、用户名、昵称(可选)、密码、确认密码。错误展示沿用 login 的错误条样式。

### 5.3 Admin 后台增强

`AdminUserManager.tsx`(用户管理):

- host 行新增「邀请额度」列:显示 `invite_quota / 默认额度`(如 `2/4`)+ 「重置」按钮(确认后调 `resetInviteQuotaAction`,重置为当前配置的默认额度)。
- 可选:用户详情内列出该 host 名下所有码,便于排查。

`src/app/admin/config/`(系统配置页)新增「注册与邀请」区块:

- 注册开关(toggle):控制 `invite.registrationEnabled`。关闭后 `/register` 显示"注册未开放",登录页隐藏注册入口。
- 默认邀请额度(数字输入,0–99,默认 4):控制 `invite.defaultQuota`,影响后续的重置与新 host 初始化;**不回溯**修改已有用户的当前剩余额度。

### 5.4 i18n

`messages/{zh,en}.json` 新增 `register.*`、`invites.*`,以及 `userSettings.tabInvites`、`admin.inviteQuota*`。中文为默认语言,两份必须同步补齐。

## 6. 涉及文件清单

| 类型 | 文件 |
| ---- | ---- |
| 改 | `src/db/schema.ts`(invite_codes 表 + users.inviteQuota + relations) |
| 新 | `src/lib/invites.ts`(码生成、sweep、常量) |
| 新 | `src/app/actions/invite.ts`(4 个 action) |
| 改 | `src/app/admin/actions.ts`(resetInviteQuotaAction、updateInviteConfigAction) |
| 改 | `src/app/admin/config/` 及对应组件(注册开关 + 默认额度设置) |
| 新 | `src/app/register/page.tsx`、`src/app/register/RegisterForm.tsx` |
| 改 | `src/proxy.ts`、`src/auth.config.ts`(放行 /register) |
| 新 | `src/components/user/settings/InvitesTab.tsx` |
| 改 | `src/components/user/UserSettingsPanel.tsx`(条件 Tab) |
| 改 | `src/components/admin/users/AdminUserManager.tsx` + `src/app/admin/users/page.tsx`(额度列) |
| 改 | `src/app/login/LoginForm.tsx`(注册入口 + 成功提示) |
| 改 | `messages/zh.json`、`messages/en.json` |
| 测试 | `src/app/actions/__tests__/invite.test.ts`(vitest:额度扣减/返还幂等、并发一码一人、过期语义) |

## 7. 已确认的决策(2026-07-09,Joycai)

1. **admin 不生成邀请码** — admin 直接在后台建号,该功能仅面向 host。
2. **撤销返还额度:做**(§3 `revokeInviteCodeAction`)。
3. **admin 面板增加注册开关 + 默认额度设置**(默认 4),见 §2.3、§5.3。
4. 重置额度写入配置的默认额度值(即第 3 条的设置项)。
