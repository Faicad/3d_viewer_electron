# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Faicad 3D Viewer is an Electron desktop application for viewing 3D model files (STL/GLB/3MF/STEP/STP). It uses a custom protocol `faicad-viewer://` to serve the renderer process.

## Common Commands

```bash
npm run dev          # Start development server
npm run build        # Build all processes (main + preload + renderer)
npm run build:unpacked  # Build + package as unpacked dir (dist/win-unpacked/)
npm run build:win     # Build + package as NSIS installer (dist/)
npm run lint          # Run ESLint
npm run ci            # Full CI: tsc + vitest (all) + playwright (all)
npx vitest run        # Run unit tests
npx playwright test   # Run integration tests
```

**Single test file**: `npx vitest run src/renderer/lib/step-converter/stepToGlb.test.ts`

## Development Workflow

### Daily development (feature / bug fix)

1. Write code, then run **related Playwright tests** + **all vitest unit tests**.
2. Only proceed once those pass — never run the full Playwright suite during development (too time-consuming).

### Pre-commit (final gate)

```bash
npm run ci   # tsc + vitest (all) + playwright (all)
```

**Must pass `npm run ci` before `git commit`. No exceptions.** CI is the final gate; don't run it frequently during development.

Tests must not use `window.waitForTimeout` or similar brute-force delays.

## Architecture

### Three-Process Model (electron-vite)

- **`electron/main/index.ts`** — Main process: window management, custom protocol registration (`faicad-viewer://`), filesystem IPC handlers
- **`electron/preload/index.ts`** — Preload script: exposes `electronAPI` (fs operations, external links) and `env` (DEV/PROD flag) via contextBridge
- **`src/renderer/`** — React renderer process

### Custom Protocol

The app registers `faicad-viewer://` to serve renderer assets without CORS issues. In dev mode it serves from `src/renderer/public/`; in production from the asar bundle. All renderer URLs use this protocol (e.g. `faicad-viewer://local/out/renderer/index.html`).

### 3D Engine Stack

- **Three.js + React Three Fiber + Drei** — Core 3D rendering
- **STEP file support** — `occtLoader.ts` + `GlbBuilder.ts` in `src/renderer/lib/step-converter/` handle STEP→GLB conversion via Web Workers

### IPC / Context Bridge API

Renderer accesses main process via `window.electronAPI`:
- `readDirectory(dirPath)` — list 3D files in a directory
- `readFileAsBase64(filePath)` — read file as base64
- `openExternal(url)` — open URL in system browser
- `getFilePath(file)` — get native path for a File object

### State Management

Zustand stores in `src/renderer/stores/`. No Redux or other state library.

### File Format Configuration

`src/renderer/config/file-formats.ts` exports `ALL_EXTENSIONS` — used by both main process (IPC `fs:readDirectory`) and renderer for validation.

## Versioning

This project uses [Conventional Commits](https://www.conventionalcommits.org/) with `standard-version`:

```bash
pnpm run release          # auto bump version + generate CHANGELOG.md
pnpm run release:minor    # force minor bump (1.0 → 1.1)
pnpm run release:major    # force major bump (1.0 → 2.0)
```

Commit message format determines version bump:
- `fix: ...` → patch (1.0.0 → 1.0.1)
- `feat: ...` → minor (1.0.0 → 1.1.0)
- `feat: ...\n\nBREAKING CHANGE: ...` → major (1.0.0 → 2.0.0)

## Tech Stack

- React 19 + TypeScript
- electron 35 + electron-vite 3
- Three.js + React Three Fiber + Drei
- Radix UI + TailwindCSS
- Zustand (state)
- Vitest (unit tests) + Playwright (integration tests)
- electron-builder (packaging)


This is an open-source project — never expose local development environment paths, keys, or other private information in docs or code.

## wireframe vs mesh (project UI definitions)

These are definitions specific to this project's UI layer. The terms may carry different meanings in Three.js and other 3D libraries.

- **wireframe** — topology lines from the CAD model. Only available for STEP/STP formats (which carry topological data).
- **mesh** — triangle mesh edge rendering. Available for all file formats.
- Both display as lines in the viewport, but they come from different data sources.
