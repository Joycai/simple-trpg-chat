---
name: version-bump
description: >-
  Bump and synchronize the Simple TRPG Chat app version (package.json, the
  in-app version label, the docs/guides headers, and the release tag) using
  semantic x.y.z versioning. Use this skill IMMEDIATELY whenever a new feature
  or fix branch is created — `git checkout -b` / `git switch -c`, or the user
  says 开新分支 / 建个分支 / 新起一个 feature / start a branch for X — because the
  version bump belongs in the branch's first commit. Also use it whenever the
  user mentions 版本号 / 升版本 / bump version / 发版 / cut a release / tag a
  release, asks what version the app is on, or says the version shown in the UI
  is stale or out of sync. Applies even when the user does not say the word
  "version" but is clearly starting a shippable change or preparing a release.
---

# Version Bump — Simple TRPG Chat

Every version string in this repo descends from **one** number: `version` in
`package.json`. Keeping that true is the whole job — the failure mode this skill
prevents is a repo where the footer says `v0.2.0`, the release tarball says
`release-20260720-162150`, and the deployment guide says `0.1.0`.

## Where versions live

| Surface | How it gets the version | Do you edit it? |
| --- | --- | --- |
| `package.json` → `version` | **Source of truth** | Yes — the only real edit |
| `src/lib/version.ts` → `APP_VERSION` | `import { version } from "package.json"` | **No** — never hardcode here |
| Home footer, login, register, admin sidebar | render `APP_VERSION` | **No** — follows automatically |
| `docs/guides/*.md` → `**Version**: X.Y.Z \| **Last Updated**: …` | header line per guide | Yes — the script syncs them |
| GitHub Release tag `vX.Y.Z` | `release.yml` reads `package.json` at release time | No — but you push the tag |

If someone ever adds a *new* place that prints a version, it must import
`APP_VERSION`, not repeat the literal. A second literal is a second thing to
forget.

## Picking the bump level

Infer it from the branch name, then **say what you inferred and why** before
applying it — the user can override with one word, and that is cheaper than a
wrong bump landing in a commit.

| Branch prefix | Level | Rationale |
| --- | --- | --- |
| `feat/`, `feature/` | **minor** | user-visible capability the room didn't have |
| `fix/`, `chore/`, `refactor/`, `perf/`, `style/`, `test/`, `docs/` | **patch** | behavior preserved or repaired, nothing new to learn |
| anything described as breaking, or `!` in the branch/commit subject | **major** | see the pre-1.0 note below |

**This app is pre-1.0 (`0.x.y`).** Under semver, `0.x` means the public surface
is still unstable, so a major bump to `1.0.0` is a product statement — "the data
model and the rule-module API are now something I'll keep stable" — not a
mechanical consequence of a breaking change. Never bump major on inference
alone; propose `minor` instead and ask.

When the branch name is uninformative (`joycai/tmp`, `wip`), don't guess from
the name — look at what actually changed (`git diff --stat main...HEAD`) and
reason from that, or ask.

## Procedure

Run these in order. Steps 1–3 are guards; skipping them is how you end up with
a double bump or a commit on `main`.

**1. Locate yourself.**

```bash
git rev-parse --abbrev-ref HEAD
node -p "require('./package.json').version"
```

**2. Refuse to bump on `main`.** `main` is the release branch and takes no
direct pushes (see the `simple-trpg-chat` skill). If you're on `main` and the
user asked for a bump because they're starting work, offer to create the branch
first — the bump then rides along in that branch's first commit and shows up in
the PR diff where a reviewer can see it.

**3. Check whether this branch already bumped.** A branch gets exactly one
version. Compare against the point it forked from `main`:

```bash
git show "$(git merge-base HEAD main)":package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version"
```

If that differs from the working version, this branch already carries a bump.
Don't stack a second one — either leave it alone, or if the level was wrong,
correct it with `--set X.Y.Z` computed from the **merge-base** version, not from
the current one.

If the base version is *ahead* of yours, `main` moved on while you worked:
rebase onto `main` first, then re-derive the target from the new base.

**4. Apply the bump.**

```bash
node .claude/skills/version-bump/scripts/bump.mjs --level minor
```

`--set X.Y.Z` forces an exact version; `--dry-run` prints the plan without
writing. The script edits `package.json` with a surgical replacement (formatting
and key order untouched — the diff is one line) and rewrites each
`docs/guides/*.md` header, moving `Last Updated` to today.

**5. Verify nothing was missed.** Any hit outside `package.json`,
`pnpm-lock.yaml`, `docs/guides/`, and `.claude/worktrees/` is a hardcoded
literal that should be importing `APP_VERSION` instead:

```bash
grep -rn --exclude-dir={node_modules,.next,.git,cache,.claude} "<old-version>" .
```

**6. Commit it on its own.** A standalone commit keeps `git log` readable and
makes the version diff trivial to revert if a release slips:

```
chore(release): bump version to X.Y.Z
```

Then continue with the actual feature work. Don't bundle the bump into a feature
commit.

## Cutting a release

Releases run from `main` after the PR merges, and `release.yml` is
`workflow_dispatch`-only.

1. `git checkout main && git pull --ff-only` — confirm `package.json` holds the
   version you intend to ship.
2. Trigger the workflow: `gh workflow run release.yml --ref main`.

Don't create the tag by hand. The workflow resolves the version from
`package.json`, tags `vX.Y.Z` itself, and names the artifact
`simple-trpg-chat-vX.Y.Z.tar.gz`. If that tag already exists it aborts before
building — that's the intended guard, and the fix is to bump, not to force the
tag.

Tags before `v0.x` used the old `release-<timestamp>` scheme; they stay as they
are, and version-refname sorting places every `vX.Y.Z` after them.

Triggering a release is outward-facing and hard to undo. Confirm with the user
before dispatching it, even if they mentioned "a release" earlier in the
conversation.
