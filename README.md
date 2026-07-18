# Something Commander

A modern orthodox two-panel file manager inspired by Total Commander and DOS Navigator. Built with Electron, React, and TypeScript.

Download the latest release for your platform from the [Releases](https://github.com/nowherenone/something-commander/releases) page.

Available builds:

- **Linux**: AppImage, deb
- **macOS**: zip (x64 / arm64)
- **Windows**: NSIS installer

## Develop

```bash
npm install
npx playwright install chromium   # once, for visual tests
npm run dev                       # Electron + hot reload
```

## Testing

**Always run the full suite before claiming a file-ops or dialog fix works, and before every release.**

| Command | Purpose |
|---------|---------|
| `npm test` | Unit tests (vitest) — fast |
| `npm run test:visual` | Playwright visual / dialog UI tests |
| `npm run test:all` | Unit **+** visual — **required gate** |
| `npm run test:e2e:update` | Refresh screenshots after intentional UI changes |
| `npm run pre-release` | typecheck + `test:all` + production build |

```bash
npm run test:all
```

- **Unit**: includes real zip→disk stream progress and cancel tests under `src/__tests__/`.
- **Visual**: Playwright opens the harness at `/#/test-harness` (no Electron). Covers operation dialog states and a live zip-progress stepper.

Details, release checklist, and CI behavior: **[RELEASE.md](./RELEASE.md)**.

## Build & release

```bash
npm run pre-release    # must be green
# bump package.json version, commit
git tag vX.Y.Z
git push origin vX.Y.Z   # triggers GitHub Actions build + release
```

See **[RELEASE.md](./RELEASE.md)** for the full checklist (version bump, manual smoke, packaging, auto-update).
