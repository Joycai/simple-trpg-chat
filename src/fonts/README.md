# src/fonts — vendored web fonts

These woff2 files are committed on purpose. `src/app/fonts.ts` loads them with
`next/font/local`, so **the build never talks to the network**.

## Why

They used to be pulled from Google Fonts at build time via `next/font/google`.
That makes `next build` fail on any machine or CI runner that cannot reach
`fonts.googleapis.com`, with `next/font: error: Failed to fetch <Family>`.
The font files are ~700 KB in total, which is cheaper than a build-time
dependency on a third-party CDN.

## Provenance

Every file is the **latin subset** extracted from the corresponding
[Fontsource](https://fontsource.org/) npm package (v5.3.0), which repackages
the same files Google Fonts serves. All families are licensed under the
SIL Open Font License 1.1 — see `OFL.txt`.

| File | Fontsource package | Axis / weight |
| --- | --- | --- |
| `inter-wght.woff2` | `@fontsource-variable/inter` | variable 100–900 |
| `space-grotesk-wght.woff2` | `@fontsource-variable/space-grotesk` | variable 300–700 |
| `jetbrains-mono-wght.woff2` | `@fontsource-variable/jetbrains-mono` | variable 100–800 |
| `cinzel-wght.woff2` | `@fontsource-variable/cinzel` | variable 400–900 |
| `cormorant-garamond-wght.woff2` | `@fontsource-variable/cormorant-garamond` | variable 300–700 |
| `lora-wght[-italic].woff2` | `@fontsource-variable/lora` | variable 400–700 |
| `crimson-text-{400,600,700}[-italic].woff2` | `@fontsource/crimson-text` | static |
| `courier-prime-{400,700}.woff2` | `@fontsource/courier-prime` | static |
| `marcellus-400.woff2` | `@fontsource/marcellus` | static |
| `special-elite-400.woff2` | `@fontsource/special-elite` | static |
| `noto-serif-sc-{400,500,700}.woff2` | `@fontsource/noto-serif-sc` | static, latin only |
| `shippori-mincho-{400,600,800}.woff2` | `@fontsource/shippori-mincho` | static, latin only |

## Regenerating

```bash
./scripts/vendor-fonts.sh
```

Needs network access to the npm registry (not to Google). It installs the
Fontsource packages into a temp dir, copies the latin woff2 files here, and
throws the temp dir away. Re-run it only when a family is added, dropped, or
you want newer upstream font revisions — then eyeball the diff, since font
files change rarely and a surprise 50 MB delta means something went wrong.

## Known gap: CJK glyphs

`noto-serif-sc` and `shippori-mincho` are bundled **latin-only**, which
reproduces the old `subsets: ["latin"]` setting exactly. So the "Ancient
Shrine" theme renders Chinese and Japanese text in the system fallback font,
not in the mincho serif. Fixing that means shipping the CJK subsets:
`@fontsource-variable/noto-serif-sc` splits them into ~100 unicode-range
chunks totalling ~6.4 MB, which the browser fetches lazily but which all land
in `.next/static`. That is a deliberate design call, not an oversight — decide
it separately from this build fix.
