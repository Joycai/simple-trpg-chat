# LLD: Customizable Site Favicon

## Requirement

Allow admins to upload a custom favicon via Admin Dashboard → Config page, replacing the static `src/app/favicon.ico` without a code deploy.

---

## Design Decisions

### Storage: base64 data URL in `systemConfig`

Store the favicon as a base64 data URL under `systemConfig.key = "site_favicon"`.

**Why base64 over URL or file upload:**
- No file upload infrastructure needed (codebase currently stores only external URLs — no multipart/FormData handling exists)
- Favicons are tiny: a 32×32 PNG is ~1–3 KB; even a 256×256 PNG is well under 100 KB
- Self-contained in the DB — no external URL dependency or static file management
- Consistent with how `site_title` and `site_theme` are stored

**Size guard:** Reject uploads > 512 KB client-side (base64 string > ~700,000 chars). This is intentionally generous — a real favicon should be < 32 KB.

**Reset:** Admin can revert to the default by clearing the stored value. When empty, the layout omits the `icons` field and the browser auto-discovers `favicon.ico`.

---

## Data Flow

```
[Admin] uploads file
  → FileReader.readAsDataURL() (client)
  → previewUrl state updated, save enabled
  → handleSave() → updateSiteFavicon(dataUrl) [Server Action]
    → auth check (admin only)
    → size + format validation
    → upsert systemConfig { key: "site_favicon", value: dataUrl }
    → revalidateTag("system_config")
    → revalidatePath("/", "layout")
  → getCachedSiteFavicon() re-fetches on next request
  → generateMetadata() in layout.tsx picks up new value
  → browser receives updated <link rel="icon"> in <head>
```

---

## Files to Modify

### 1. `src/lib/config.ts` — Add `getCachedSiteFavicon()`

Mirror the existing `getCachedSiteTitle()` pattern exactly:

```typescript
export const getCachedSiteFavicon = unstable_cache(
  async () => {
    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "site_favicon"));
    return row?.value ?? "";
  },
  ["site_favicon_cache"],
  { tags: ["system_config"] }   // same tag — revalidates with title
);
```

### 2. `src/app/actions/theme.ts` — Add `updateSiteFavicon()`

```typescript
export async function updateSiteFavicon(dataUrl: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Allow empty string (reset to default)
  if (dataUrl !== "" && !dataUrl.startsWith("data:image/")) {
    return { success: false, error: "Invalid format" };
  }
  if (dataUrl.length > 700_000) {
    return { success: false, error: "File too large" };
  }

  await db
    .insert(systemConfig)
    .values({ key: "site_favicon", value: dataUrl })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: dataUrl, updatedAt: new Date() },
    });

  revalidateTag("system_config");
  revalidatePath("/", "layout");
  return { success: true };
}
```

### 3. `src/app/layout.tsx` — Add favicon to `generateMetadata()`

```typescript
export async function generateMetadata(): Promise<Metadata> {
  const [siteTitle, siteFavicon] = await Promise.all([
    getCachedSiteTitle(),
    getCachedSiteFavicon(),
  ]);
  return {
    title: siteTitle,
    description: "A lightweight web-based TRPG tool for multi-player chat and dice rolling",
    ...(siteFavicon ? { icons: { icon: siteFavicon } } : {}),
  };
}
```

When `siteFavicon` is empty, `icons` is omitted and the browser falls back to the static `favicon.ico` in `src/app/`.

### 4. `src/app/admin/config/page.tsx` — Add `generateMetadata()` + `<AdminFaviconConfig>`

**Add page-level metadata** (currently missing — browser tab shows generic site title):

```typescript
export async function generateMetadata(): Promise<Metadata> {
  const siteTitle = await getCachedSiteTitle();
  return {
    title: `${t("systemConfig")} | ${siteTitle}`,
  };
}
```

> Note: since `getTranslations` is async and `generateMetadata` is a separate export, fetch the translation inside it:
> ```typescript
> export async function generateMetadata() {
>   const [t, siteTitle] = await Promise.all([
>     getTranslations("admin"),
>     getCachedSiteTitle(),
>   ]);
>   return { title: `${t("systemConfig")} | ${siteTitle}` };
> }
> ```

**Add to existing data fetch:**

```typescript
const [faviconConfig] = await db
  .select()
  .from(systemConfig)
  .where(eq(systemConfig.key, "site_favicon"));
const siteFavicon = faviconConfig?.value ?? "";
```

**Add to JSX** (after `<AdminTitleConfig>`):

```tsx
<AdminFaviconConfig initialFavicon={siteFavicon} />
```

---

## Files to Create

### 5. `src/components/AdminFaviconConfig.tsx`

**Props:** `{ initialFavicon: string }` — current base64 data URL or empty string.

**i18n:** `useTranslations("admin")` — keys added to the existing `"admin"` namespace (consistent with `AdminTitleConfig`).

**Theme:** All classes must use semantic Tailwind tokens — mirror `AdminTitleConfig` exactly:
- Card: `bg-surface border border-border rounded-xl shadow-lg`
- Icon container: `bg-primary/10 text-primary rounded-lg`
- Input/file area: `bg-bg border border-border rounded-lg text-text`
- Save button: `bg-primary hover:bg-primary-hover text-white`
- Text: `text-text`, `text-text-muted`, `text-text-dim`
- Status: `text-success` / `text-danger`

**State:**
- `previewUrl: string` — initialized from `initialFavicon`; updated on file select
- `pendingDataUrl: string | null` — the new base64 to save; null = no unsaved change
- `isLoading: boolean`
- `msg: string`, `msgType: "success" | "error"`

**UI structure** (mirrors `AdminTitleConfig` card layout):

```
┌─────────────────────────────────────────────────────┐
│  [🖼 icon]  Site Favicon                            │
│             Upload a custom favicon (PNG/ICO/SVG)   │
├─────────────────────────────────────────────────────┤
│  Preview: [32×32 img or placeholder box]            │
│                                                     │
│  [ Choose File ] filename.png (2.1 KB)              │
│                                                     │
│  [ Save ]  [ Reset to Default ]  ✓ Favicon updated  │
└─────────────────────────────────────────────────────┘
```

**Key logic:**

```typescript
// File selection → base64 conversion
const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 512 * 1024) {
    setMsg(t("faviconFileTooLarge")); setMsgType("error"); return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    setPreviewUrl(dataUrl);
    setPendingDataUrl(dataUrl);
  };
  reader.readAsDataURL(file);
};

// Save
const handleSave = async () => {
  if (!pendingDataUrl) return;
  setIsLoading(true); setMsg("");
  const result = await updateSiteFavicon(pendingDataUrl);
  setMsg(result.success ? t("saveSuccess") : t("saveFailed"));
  setMsgType(result.success ? "success" : "error");
  if (result.success) setPendingDataUrl(null);
  setIsLoading(false);
};

// Reset to default
const handleReset = async () => {
  setIsLoading(true);
  const result = await updateSiteFavicon("");
  if (result.success) { setPreviewUrl(""); setPendingDataUrl(null); setMsg(t("saveSuccess")); setMsgType("success"); }
  else { setMsg(t("saveFailed")); setMsgType("error"); }
  setIsLoading(false);
};
```

### 6. i18n keys — add to `"admin"` namespace

**`messages/zh.json`** — add inside `"admin": { ... }`:
```json
"editSiteFavicon": "网站图标",
"editSiteFaviconDesc": "上传自定义网站图标（支持 PNG / ICO / SVG）",
"faviconChooseFile": "选择图标文件",
"faviconReset": "恢复默认",
"faviconFileTooLarge": "文件过大，请选择 512KB 以内的图片",
"faviconPreview": "当前图标预览"
```

**`messages/en.json`** — add inside `"admin": { ... }`:
```json
"editSiteFavicon": "Site Favicon",
"editSiteFaviconDesc": "Upload a custom favicon (PNG / ICO / SVG)",
"faviconChooseFile": "Choose Icon File",
"faviconReset": "Reset to Default",
"faviconFileTooLarge": "File too large — please choose an image under 512 KB",
"faviconPreview": "Current favicon preview"
```

> Reuses existing `"saveSuccess"`, `"saveFailed"`, `"saving"`, `"saveConfig"` keys already in the `"admin"` namespace.

---

## Validation Rules

| Check | Where | Rule |
|-------|-------|------|
| File size | Client (`AdminFaviconConfig`) | `file.size <= 512 * 1024` |
| MIME type | Client (file input `accept`) | `image/png, image/x-icon, image/svg+xml` |
| Data URL prefix | Server (`updateSiteFavicon`) | Must be `""` or start with `"data:image/"` |
| Base64 length | Server (`updateSiteFavicon`) | `dataUrl.length <= 700_000` |
| Auth | Server (`updateSiteFavicon`) | `role === "admin"` |

---

## Out of Scope

- Separate `apple-touch-icon` / `og:image` customization
- Multi-size favicon sets
- File storage to disk or object storage (base64 in DB is sufficient for favicon sizes)
- Animated favicon (GIF)
