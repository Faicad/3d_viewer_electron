# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.1.0 (2026-05-22)


### Features

* add 20 language support with system locale detection ([f7c32d0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f7c32d0813f5ca96aeb9c480d31b44fe06abc06a))
* add 29-format support with centralized loader dispatch ([551bdbd](https://github.com/YOUR_ORG/3d_viewer_electron/commits/551bdbddac22e7de020d069af5b7ea8bdae3608a))
* add cache manager UI and clearStepCache function ([4d0d669](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4d0d669d77c6da247c8ce8506d3f021408078886))
* add file category filters to native open file dialog ([696eff1](https://github.com/YOUR_ORG/3d_viewer_electron/commits/696eff168efa52d439c56b7fd7e09a0bd1cae402))
* add format loader integration tests, STEP conversion test, and .pnpmrc ([435e3bc](https://github.com/YOUR_ORG/3d_viewer_electron/commits/435e3bc09e7fa834d4a80d5796e705e4eb0c1f10))
* add full PBR material support for 3D model rendering ([54dd164](https://github.com/YOUR_ORG/3d_viewer_electron/commits/54dd16404df9eff6e4531abcf031f506a6f1663e)), closes [#9BA6](https://github.com/yuan-xy/3d_viewer_electron/issues/9BA6)
* add fullscreen toggle button to toolbar and ESC to exit fullscreen ([2e7cd3e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2e7cd3e3a007e7ed9a4bcd097a1cfe493a860902))
* add macOS CI support and make E2E binary path platform-aware ([db70b43](https://github.com/YOUR_ORG/3d_viewer_electron/commits/db70b43cc410f7971e9dd4af23971e813c49aeac))
* add model-interaction E2E tests and update CI scripts ([4c46510](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4c46510f6f19adff229393e89580345874f88210))
* add open-file button to toolbar with native file dialog ([3377022](https://github.com/YOUR_ORG/3d_viewer_electron/commits/337702276388894fee7127b0dd3212a63fe405a1))
* add perspective/orthographic view toggle buttons ([7b4244b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/7b4244b720feb94dfc99eb9f1ab685e46e6d01a8))
* add settings dialog with theme/language switch ([79243f6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/79243f61d051b3c0536c01d8b99dbb487370c80d))
* add sort order toggle and update sort icons in file list ([1a5e7f2](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1a5e7f266e2d55672e8bd51438d6297f7eb37ea9))
* add STEP→GLB cache via IndexedDB and loading overlay ([4af2ded](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4af2ded11b642c72cf411b3202ba539c47e17626))
* add STEP→GLB WASM converter with automatic topology extraction ([84ab5e7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/84ab5e7697869ee559300f5a6d4a59b3c12cb476))
* add thumbnail preview mode in file list panel ([a29068d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a29068d20e0fb43fc21d682264ce70e4cd6165a1))
* add unit test infrastructure and pure-logic tests ([b5b4ced](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b5b4ced2b0041b79af2f866cc93965dbbb3dbcf8))
* add Y-up/Z-up toolbar toggle with smooth camera animation ([563d3c6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/563d3c67da14c2e6f88fc7088696921f838c49ec))
* cascade parent visibility toggle to all child nodes ([3ac74c8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/3ac74c8c3342d9f0d52989eb990dd01faf3e2b16))
* deselect on empty-space click in object selection mode ([545c2c6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/545c2c62fd1f318618f0aba082da58b501b00bfc))
* display file name in scene tree for single-part models ([4aec210](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4aec210c4c455438a236bf9c6df29ff654fc4a7b))
* enable glTF format with automatic external file resolution ([506a75a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/506a75a05064eb94554f4508669d339915fe0258))
* hide edge-dependent UI when GLB has no edge/topology data, fix E2E tests ([ff41df9](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ff41df986427ec41494dfbd142160ab4375c5270))
* make left/right side panels resizable via mouse drag ([327cd9e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/327cd9ecc8fd2ec0421270c8af47083c301a75d6))
* move STEP ReadStepFile to Web Worker pool + auto pre-cache ([a441dfd](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a441dfd65fff33b360291a6ac90f95b099834a22))
* multi-level scene tree with visibility toggle and bidirectional selection ([d0c764c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d0c764c55db3976ec3b06309a3cd9eb3c8145ff0))
* N-worker pool with promise dedup for STEP conversion ([533d5ae](https://github.com/YOUR_ORG/3d_viewer_electron/commits/533d5aef68605916a825423e57579304f2091926))
* replace status bar with toggleable model info panel ([151576b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/151576beb234ae10b988dde3863935628afc5878))
* support multi-select via Shift+click for all highlight types ([efba05b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/efba05b5dc12bbf654e924b6f1787c83f675434f))
* suppress console.log/warn/debug/info in production build ([fc550db](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fc550db9aafadfe212625974508cb40c69ac4eff))
* surface all render errors to window.__errors for test assertions ([31de867](https://github.com/YOUR_ORG/3d_viewer_electron/commits/31de867a0b7f5598991dd9a99fdbdadfcc5f99af))
* unit system detection, dynamic labels, material cost fix ([edc5c33](https://github.com/YOUR_ORG/3d_viewer_electron/commits/edc5c330c3656ef37ca9d722c94e6e6edf9a05b7))


### Bug Fixes

* add --no-sandbox and preserve DISPLAY env for Linux CI E2E tests ([051670d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/051670d031ff4a42f3d5ca51e00896b3976d59a7))
* add auto-retrying assertions to scene-tree E2E test for Windows CI stability ([5ab2ca9](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5ab2ca953e6edf8e6016a49a4e54ec446fb89863))
* add binary file IPC to eliminate base64 overhead on main thread ([b0e8d49](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b0e8d4997c260fecc1c8e8c21769b76a5ef772e5))
* add diagnostic logging and DOM waitForFunction for scene-tree E2E test ([72e50de](https://github.com/YOUR_ORG/3d_viewer_electron/commits/72e50de19282f49d7dc34f56d6c70dcd33b7ed2f))
* add diagnostic polling for failing scene-tree on Windows CI ([aa62ba4](https://github.com/YOUR_ORG/3d_viewer_electron/commits/aa62ba45f931fa5d3343306d61636dbebd2494e0))
* add fake-indexeddb IDB unit tests, fix CacheManager consistency bug ([852b1a1](https://github.com/YOUR_ORG/3d_viewer_electron/commits/852b1a1dd39776196db17e23d862978bfc387609))
* add full aside HTML diagnostic for scene-tree Windows CI ([b6cf903](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b6cf90341cd7832463a4815d98ad36a59139832e))
* add missing activeToolMode to tool-store, restoring mouse interaction ([3e3028a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/3e3028ab8bdb9947c9044bf8226e99811c402d8d))
* add missing draco_wasm_wrapper.js for DRC file loading ([3b9e706](https://github.com/YOUR_ORG/3d_viewer_electron/commits/3b9e7068197d09fdedd19c8ce6d85759ce9ae6ba))
* add STEP→GLB conversion in FileListPanel click handler ([570eb14](https://github.com/YOUR_ORG/3d_viewer_electron/commits/570eb14fbf41f8afe86539e1fed06ef4b99d388e))
* add waitForLoadState to prevent intermittent E2E canvas timeout, and remove broken edge topology extraction ([a2bf02d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a2bf02df3ab1821699ffd4e92b964eb8cc0da35b))
* add wrl to MULTI_MESH_FORMATS so VRML preserves original materials ([f1f50a9](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f1f50a9b64414567af5145435ffebe8b018b6cbe))
* align STEP_topology format with Python reference implementation ([93e3328](https://github.com/YOUR_ORG/3d_viewer_electron/commits/93e33287cf1a9a4b6043625850894565ae638c94))
* allow child nodes to be independently visible when parent is hidden ([470a8f6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/470a8f6ca27793b361b029dcd5ceb18303d71163))
* apply mesh.matrixWorld transform to edge/vertex highlight geometry ([aca11ee](https://github.com/YOUR_ORG/3d_viewer_electron/commits/aca11ee1a0e8dd8d767499f81fd8a7f6932b7cad))
* bump vite to ^6.0.0, use npm@11 in CI for lockfile compat ([fe6cb30](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fe6cb302469775002332291e3f66807342285823))
* bypass file input in scene-tree E2E test and tolerate 1-node tree on Windows ([d3aefdd](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d3aefddab7ad546e5df5acff5fdbbbba0f9b00ec))
* call initLogger() in main.tsx to suppress logs in prod ([5bd492d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5bd492d5ebac0245d31100f759f1b3f7f7ac5d2f))
* camera deformation when toggling perspective/orthographic views ([5b1b1e7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5b1b1e7aa7bb1e14919cfef150865832ffe25d60))
* clear morph attributes on cloned geometry to prevent R3F render crash ([07e122a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/07e122afc2842746d3ce5c8cdbfa2bf6860dbd40))
* correct macOS E2E binary path for arm64 runner and productName ([5a6d6b6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5a6d6b6da971df6e24ebd479848bed025b68538f))
* drop macos from CI matrix, add fail-fast: false ([753c179](https://github.com/YOUR_ORG/3d_viewer_electron/commits/753c17936dc8079de4993c143c7322530b8f2b52))
* ensure IndexedDB cache persists across app restarts ([52ba2c1](https://github.com/YOUR_ORG/3d_viewer_electron/commits/52ba2c1350b00501b22f24a7c3a96ed073b127dc))
* ensure left panel is open before scene-tree tests on narrow CI windows ([fbd09a8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fbd09a849d7b5736be597ae24ebb2b96a9909f85))
* grant ficad-app protocol IndexedDB access for persistent STEP cache ([226f061](https://github.com/YOUR_ORG/3d_viewer_electron/commits/226f061b887e1f99ff8525abeb64c7940b68471a))
* hide selection highlights when target mesh is hidden ([0f80535](https://github.com/YOUR_ORG/3d_viewer_electron/commits/0f805351b44b800e6cdb7fe3e44b73d5fbf325a1))
* limit CI to ubuntu-latest, add xvfb-run for headless Electron ([62db32c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/62db32c7a1275289cb02f0110b01085cbde6c1e9))
* load renderer from Vite dev server in dev mode for HMR support ([c0eedf8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c0eedf870a2f2ecdeddfe26eee2172ec97f2bf10))
* make scene-tree E2E tests tolerant of 1-node tree on Windows ([c0e149d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c0e149d107ae19cc5e68a41ca67619fde01f0f9c))
* model info panel showing 0 area/volume due to Math.round truncation ([045db59](https://github.com/YOUR_ORG/3d_viewer_electron/commits/045db5922eb7a11c9b9f589adc8cb88ed9aaa98d))
* point to macOS executable inside .app bundle to bypass EACCES ([a914a78](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a914a780529c6bbec180b6187ffc025c4400e773))
* recompute selection highlights when mesh visibility changes ([7e55495](https://github.com/YOUR_ORG/3d_viewer_electron/commits/7e5549519566d0a9ae3366ad7cab69904c91391b))
* remove explicit pnpm version from workflow, use packageManager field ([50ccb35](https://github.com/YOUR_ORG/3d_viewer_electron/commits/50ccb35cf8282c0647381fc0f2612321ecd150d7))
* remove extraneous vitest esbuild entries causing npm ci EBADPLATFORM ([05380a0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/05380a0f5877573f28516db3ffe7d0ccfbfb6ef7))
* remove matrix.os from concurrency group (not available at workflow level) ([15218fb](https://github.com/YOUR_ORG/3d_viewer_electron/commits/15218fb3a398573af2c8c6acd1cd8d8d04b47380))
* replace broken oxc JSX config with @vitejs/plugin-react in vitest jsdom setup ([c823f5c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c823f5c0a3074ff7dfcd283c387be00b93772d5d))
* replace waitForTimeout with waitFor canvas attached in E2E canvas startup tests ([c3c5fa0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c3c5fa0894d7cb506923d1215d81dfd1499a2c0d))
* resolve all ESLint warnings and errors ([0633968](https://github.com/YOUR_ORG/3d_viewer_electron/commits/0633968ef060a012909b37f9de6c4af4284b3953))
* restore console.log in E2E tests by exposing E2E flag to renderer ([1e39cd2](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1e39cd274679a46f2b22b0c9d12cdc70d904070f))
* right-align topology selection toolbar at canvas bottom ([4437629](https://github.com/YOUR_ORG/3d_viewer_electron/commits/44376295622127102b86a86e1b785b5d9aace4e6))
* robust Windows detection in ci.sh for PowerShell + WSL bash ([8f1a1d4](https://github.com/YOUR_ORG/3d_viewer_electron/commits/8f1a1d40b3414da701d9ba5c0aa601e58b247bef))
* set executableName to 3D_Viewer so tests find the exe on Windows ([119a31e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/119a31ee40238871f97708a471b3c8a920a4bd31))
* show full folder path without ellipsis, add horizontal scroll ([e8ccc23](https://github.com/YOUR_ORG/3d_viewer_electron/commits/e8ccc230d83aff773c7c587f2195256da102aba9))
* strip skinning attributes to prevent shader compilation errors ([d3c087c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d3c087cfad14b41b1f0a9edef4160bc2297f4e3b))
* support Linux CI by building linux-unpacked and symlinking for tests ([4343ab7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4343ab7f1a491b370ce750ce747b4cd4a6c3fc35))
* swap axis/selection positions, change sort icon, enable preview default ([a61e6b3](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a61e6b3937f5406c36451b0f46e5b0fefe8995a5))
* sync package-lock.json and add cross-platform CI matrix ([b57d761](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b57d7617f46797cefe1f56a2844f0460b7725a15))
* thin scrollbar for folder path, preview toggle in file header, i18n for 20 locales ([6b34e6f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/6b34e6fdd37f5e1b296904fb9653cea8a7ea4933))
* use exact match in E2E file-list selectors to avoid .glb cache file collisions ([049a11a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/049a11ad6566924705ac2fb4ec7b617b48c52bfb))
* use GLB binary conversion instead of data URIs for glTF loading ([12c24d8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/12c24d8835eed2d7ea082b9e5b98f957f801e265))
* use npm install instead of npm ci for cross-version lockfile compat ([93e78e7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/93e78e753ebbaa1727f04f33b4c8f6c8e3f50a15))
* use transparent background for thumbnail images instead of dark navy ([d11153c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d11153c5239bdd4a164ee1a41ea7e801aa860bcf))


### Performance Improvements

* replace fixed waitForTimeout with conditional waits in E2E tests ([12de9f9](https://github.com/YOUR_ORG/3d_viewer_electron/commits/12de9f9899b52c1c59ad6a5ca05e80ca6f39dd23))


### Documentation

* add cross-platform lockfile strategy analysis ([f5a24cb](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f5a24cb805995b812baaa0b7f93bb5c7892f7563))


### Code Refactoring

* redesign UI with cool blue-gray color palette and locale-aware system fonts ([5da75a3](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5da75a36a9c294c71552d6d51d3c8df667db7c80))
