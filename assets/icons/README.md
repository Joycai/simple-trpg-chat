# Site Icons / 站点图标资产

霓虹雨夜配色 · 全主题静态共用 · 一份源文件派生

## 文件清单

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `logo.svg` | 矢量 | 源文件，无损缩放 |
| `favicon.ico` | 16+32+48 多分辨率 | 浏览器标签 (legacy) |
| `favicon.svg` | 矢量 | 现代浏览器（Chrome/Firefox/Edge）|
| `favicon-16.png` | 16×16 | 退化版（删描边、放大点） |
| `favicon-32.png` | 32×32 | favicon 高分辨率 |
| `favicon-48.png` | 48×48 | Windows 任务栏 |
| `favicon-64.png` | 64×64 | 通用 |
| `apple-touch-icon.png` | 180×180 | iOS 添加到主屏 |
| `icon-192.png` | 192×192 | PWA Android |
| `icon-512.png` | 512×512 | PWA Android 大图 / splash |
| `og-image.png` | 1200×630 | OG/Twitter Card |
| `og-image.svg` | 矢量 | OG 源文件 |

## 颜色

- 容器底：`#0D1E28`（深海军蓝，品牌静态色，与所有主题无关）
- 主色 cyan：`#22D3EE`（4 角骰点 + 描边）
- 强调 magenta：`#F472B6`（中心骰点）

## 接入方法

把 `assets/icons/` 整个目录复制到 `public/` 下，然后在 `<head>` 加：

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0D1E28">

<!-- OG -->
<meta property="og:image" content="https://your-domain/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

## PWA `manifest.json`

```json
{
  "name": "Simple TRPG Chat",
  "short_name": "TRPG",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#0D1E28",
  "background_color": "#060C10",
  "display": "standalone"
}
```
