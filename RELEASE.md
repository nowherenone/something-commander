# Release & testing guide

This document is the checklist for shipping Something Commander.  
**Do not tag a release until `npm run test:all` is green.**

---

## Why tests matter

File ops (especially zip → disk copy) have failed in ways that unit mocks alone miss:

| Layer | Catches |
|-------|---------|
| **Unit (vitest)** | Stream progress callbacks mid-copy, cancel unblocks the queue, enumerate sizes, archive write |
| **Visual (Playwright)** | Operation dialog progress bars, labels, cancel/error states, layout regressions |

Visual tests do **not** launch Electron. They render the React harness at `/#/test-harness` via Vite.

---

## One-time setup

```bash
npm install
npx playwright install chromium   # browsers for visual tests
```

On Linux CI / headless machines you may need:

```bash
npx playwright install chromium --with-deps
```

---

## Running tests (local development)

| Command | What it runs |
|---------|----------------|
| `npm test` | Unit tests only (vitest) — fast loop while coding |
| `npm run test:unit` | Same as `npm test` |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:visual` | Playwright visual + dialog UI tests |
| `npm run test:e2e` | Alias for `test:visual` |
| `npm run test:all` | **Unit + visual** — required before release |
| `npm run test:e2e:update` | Refresh Playwright screenshots after **intentional** UI changes |
| `npm run typecheck` | TypeScript (node + web) |
| `npm run build` | typecheck + electron-vite production build |

### Before every PR / feature claim

```bash
npm run test:all
```

### After changing operation dialog UI

1. Confirm behavior by eye: `npm run dev`, open a copy/zip extract, watch the dialog.
2. Update snapshots only if the new look is intended:

```bash
npm run test:e2e:update
git add e2e/**/*-snapshots
```

3. Re-run `npm run test:visual` without `--update-snapshots` and confirm green.

### Zip / stream-copy / move regressions (unit)

These do not need Playwright; they exercise real zip files and move routing:

```bash
npx vitest run \
  src/__tests__/zip-stream-copy-progress.test.ts \
  src/__tests__/stream-copy-cancel.test.ts \
  src/__tests__/move-operations.test.ts
```

`move-operations.test.ts` covers the full move matrix:

| Path | Expectation |
|------|-------------|
| local → local | `moveSingleFile` / rename (no stream) |
| local → archive | stream + delete source |
| archive → local | stream + delete source |
| archive → archive | stream + delete source |
| copy local → local | stream only (never rename) |

### Manual smoke (Electron) — recommended before tag

```bash
npm run build
npm start
# or: npm run dev
```

Checklist:

1. Open a zip with a **large** file; copy it to a local folder — progress bar must move.
2. Cancel mid-copy — dialog shows cancelled; next op is not stuck in queue.
3. Copy a normal folder between panels — still works.
4. Overwrite prompt still appears when dest exists.
5. **Move** a file/folder on the **same disk** — must be near-instant (rename), not a full copy progress bar.

---

## Release process

### Prerequisites

- Clean git working tree (or only intended release commits).
- `main` / release branch is what you want to ship.
- GitHub repo publish config matches `electron-builder.yml` (`owner` / `repo`).
- For GitHub Releases from CI: `contents: write` is already set in the workflow; use the default `GITHUB_TOKEN` or a PAT with `repo` if needed.

### 1. Version bump

Edit `package.json` `version` (semver). Example: `0.1.20` → `0.1.21`.

```bash
# optional: keep lockfile in sync if you use npm version
npm version patch --no-git-tag-version   # or minor / major
```

Commit the version bump:

```bash
git add package.json package-lock.json
git commit -m "chore(release): v0.1.21"
```

### 2. Gate: tests + build

```bash
npm run typecheck
npm run test:all
npm run build
```

All three must pass. Do **not** tag if any fail.

Optional pre-release script (same gate):

```bash
npm run pre-release
```

### 3. Tag and push

```bash
git tag v0.1.21
git push origin HEAD
git push origin v0.1.21
```

Pushing a `v*` tag triggers **Build & Release** (`.github/workflows/build.yml`):

1. Install deps  
2. Unit tests  
3. Visual tests (Ubuntu job)  
4. `npm run build`  
5. `electron-builder` for win / mac / linux  
6. Upload artifacts  
7. Create GitHub Release and attach installers  

### 4. Local packaging (optional, without CI)

```bash
npm run build

# one platform at a time
npm run build:linux
# npm run build:win
# npm run build:mac    # mac zip targets; see electron-builder.yml

# or unpacked dir only
npm run build:unpack
```

Artifacts land in `dist/`.

### 5. Verify the GitHub Release

- [ ] Tag `vX.Y.Z` exists  
- [ ] Release notes look right  
- [ ] Linux AppImage / deb, Windows setup, mac zip(s) attached as expected  
- [ ] Auto-update metadata (`latest-*.yml`) present if you rely on electron-updater  

---

## CI notes

Workflow: `.github/workflows/build.yml`

| Trigger | Behavior |
|---------|----------|
| `push` tags `v*` | Full build matrix + GitHub Release |
| `workflow_dispatch` | Build artifacts without requiring a tag (release job only if ref is a `v*` tag) |

Tests in CI:

- **All matrix jobs**: `npm test` (unit)
- **Ubuntu jobs**: Playwright chromium install + `npm run test:visual`

Visual snapshots are platform-suffixed (`*-linux.png`). New snapshots are currently captured on Linux; run `test:e2e:update` on Linux (or WSL/CI) when adding screenshot assertions.

---

## Agent / contributor rule

When changing **file operations, archives, or operation dialog UI**:

1. Add or extend unit tests where logic lives (e.g. zip stream progress/cancel).  
2. Run `npm run test:all` before claiming the fix works.  
3. If dialog chrome changes, update visual snapshots deliberately and commit them.  
4. Do not release on unit tests alone.

---

## Quick reference

```bash
# day-to-day
npm run dev
npm test
npm run test:visual

# ship
npm run pre-release          # typecheck + test:all + build
# bump version in package.json, commit
git tag vX.Y.Z && git push origin vX.Y.Z
```
