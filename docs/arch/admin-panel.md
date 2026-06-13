# Admin Panel

Route prefix: `/admin`. Requires `role === 'admin'` (enforced by `auth.config.ts` + `proxy.ts`).

## Pages

| Route | Component | Purpose |
| ----- | --------- | ------- |
| `/admin` | `AdminDashboard.tsx` | Overview: live stats, quick links |
| `/admin/ai` | `AdminAiToggle`, `AdminBotPresets`, `AdminProviderManager` | Toggle AI feature; manage bot preset templates; manage shared AI providers |
| `/admin/config` | `AdminTitleConfig`, `AdminThemeSetter`, `AdminSensitiveWords` | Site title; default theme; sensitive word blacklist |
| `/admin/usage` | `TokenUsageDashboard.tsx` | AI token usage analytics — filter by user, provider, date |
| `/admin/users` | `AdminUserManager.tsx` | View/manage users: roles, bans, AI point balances |

Admin-specific server actions live in `src/app/admin/actions.ts` and `src/app/actions/stats.ts`.

## User Management

- List all users with role and ban status.
- Promote/demote roles, ban/unban users.
- Adjust `aiPoints` balance.
- View any user's login history (delegates to `src/app/actions/login-history.ts`).

## Content Filtering

Sensitive word blacklist combines:
1. Hardcoded list in `src/lib/sensitive-words-constants.ts`
2. DB-stored words via `systemConfig` key

Loaded, merged, and cached by `src/lib/sensitive-words.ts`. Applied to chat messages before they are saved.

Admin UI: `AdminSensitiveWords.tsx` (add/remove DB-stored words).

## Stats & Monitoring

- Live online user count tracked in memory by `src/lib/stats.ts`.
- Page visits and peak concurrent users persisted daily to `dailyStats` table.
- `src/app/actions/stats.ts` returns live count + today's data + historical series (day/week/month/quarter/year).
- Server load/health diagnostics available via `src/app/actions/server-load.ts`.

## Login History

- Recorded on every login with IP, user agent, and device type (`src/lib/login-history.ts`).
- Auto-cleans old records per user to bound table growth.
- Users see their own history in `UserSettingsPanel.tsx`; admins can view any user's history.
