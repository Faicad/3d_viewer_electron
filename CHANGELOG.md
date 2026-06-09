# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.4.0](https://github.com/YOUR_ORG/3d_viewer_electron/compare/v1.3.0...v1.4.0) (2026-06-09)


### Features

* add .model file format support for standalone 3MF model files ([0b53ce4](https://github.com/YOUR_ORG/3d_viewer_electron/commits/0b53ce4dae9866d6ff72b18f25503a8b76efe6d6))
* add '从场景树中移除' context menu item to all scene tree nodes ([4d14002](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4d14002d8d973b358b9a1c493a33dd14e128ac83))
* add 'open containing folder' to scene tree context menu, remove danger red from 'remove' items ([01722c2](https://github.com/YOUR_ORG/3d_viewer_electron/commits/01722c2e62e6d8eff8c404118025e2dcd88fedb2))
* add Bambu Lab 3MF metadata integration ([f65acb8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f65acb8326b8b522ee00d7345ca547355ee3176e))
* add default colors to toolbar icons ([11a923e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/11a923e158e4535bf9dbb78c904083533f3b5e8d))
* add file loading progress bar and CI improvements ([d2c486c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d2c486c2afee21ce9d47187557f4855cbcb186df))
* add folder-switch confirmation for drag-and-drop loading ([b3a2fb5](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b3a2fb5a9dd4bf5a3c36071ce0357cb4b7263062))
* add orbit controls to animation window (rotate/zoom/pan) ([6ff4fdf](https://github.com/YOUR_ORG/3d_viewer_electron/commits/6ff4fdfe7e710bb037e9ef010343e372a64657af))
* add Print/Assembly/Import view switching for Bambu 3MF ([df4e7cd](https://github.com/YOUR_ORG/3d_viewer_electron/commits/df4e7cd1d32b18fc62e505fac3aff60bf1893013))
* add programmatic heatbed with OrcaSlicer-compatible camera ([d1ef0e9](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d1ef0e91812bcb036dd4c5841ae8779d25f172b1))
* add SECURITY.md, custom CodeQL workflow, and Dependabot config ([60e5f8c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/60e5f8c7ee483c844993b6d022fd6653e2bfcec9))
* add source unit detection for all file formats ([294c73b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/294c73b9546ab01cf8019c23a63c151dd9907e39))
* add startup-time benchmark suite ([b90fdad](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b90fdadbef578548aa6300648ba3406f847c4f79))
* auto-switch 2D/3D view when loading history files of opposite type ([5d42dc6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5d42dc61101b5f99c5b21f0c30b42a8468dd0b96))
* clickable folder path with icon to switch directories in file list panel ([7e89ec2](https://github.com/YOUR_ORG/3d_viewer_electron/commits/7e89ec2f6bb56f664afd87d74405f087e4b42fd0))
* convert ModelInfoPanel to floating draggable popup ([4abe7ae](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4abe7aea6512cc972152f4850bf816daf66ee728))
* default non-printing models to Y-up, fix thumbnail colors ([fb12d68](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fb12d68dfcb798f4cd011242f23de237a3329c88)), closes [#4A90D9](https://github.com/Faicad/3d_viewer_electron/issues/4A90D9)
* double-click thumbnail replaces scene instead of adding ([aa5ab94](https://github.com/YOUR_ORG/3d_viewer_electron/commits/aa5ab9466fc09037782eb050d55078fcb394c105))
* enable parallel Playwright test execution with --workers=4 ([095e737](https://github.com/YOUR_ORG/3d_viewer_electron/commits/095e737c9be5b6579bbaef9233b34b78285c09f3))
* enhance thumbnail loading indicator — pulsing ring + filename in card ([2d77b93](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2d77b933d8b0b7e67c3a5d0fd800fa5e2a64ceb4))
* full-screen thumbnail grid — maximize button + ESC/Enter to exit ([df86277](https://github.com/YOUR_ORG/3d_viewer_electron/commits/df862774b5738db80fea2b9f4de6a8de82ea339c))
* make webSecurity conditional — disabled in dev, enabled in production ([767d2a8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/767d2a8e44dc8f6029632d5b32e49de91bb3dd1a))
* multi-plate heatbed support for Bambu 3MF files ([932ef60](https://github.com/YOUR_ORG/3d_viewer_electron/commits/932ef600f50f9b12e7002591eb525558cc06106a))
* only 3MF format defaults to showing heatbed ([9fdcfe6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/9fdcfe6227acec68637ea79e322a5637a8de1ad1))
* parse Bambu 3MF plate dimensions from project_settings.config ([3f3f3f0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/3f3f3f00dba9114830b8813221700ddc93162059))
* per-file timeout in thumbnail queue (30s, 3 retries) ([9ea097d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/9ea097dba764ee94b15947e0acaa291cf870b27d))
* preserve multi-object hierarchy in .model format scene tree ([add8f09](https://github.com/YOUR_ORG/3d_viewer_electron/commits/add8f0992c7033d3b9145c87e723aeb16d77662c))
* redesign ModelInfoPanel into three sections (selected part, file info, format metadata) ([b2fe03c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b2fe03cae650cd631088d9c4f898ea9ce75a2733))
* register hdr/exr as OS file associations for environment maps ([87b6fc5](https://github.com/YOUR_ORG/3d_viewer_electron/commits/87b6fc534d09c314dc69d044cd865196a92fd121))
* reorganize toolbar, add colors to right icons, add close button to drop overlay ([1668699](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1668699c9acff4040cd529d2160b60d182f30c02))
* show sort buttons + progress in fullscreen thumbnail grid header ([55e4f88](https://github.com/YOUR_ORG/3d_viewer_electron/commits/55e4f88f9b9890419dbe7fb4467a5a5c8a0785b0))
* show thumbnail queue progress and current file in file list header ([e8a212b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/e8a212b346c6b0a058c830be3a05e157f3bf593b))
* skip STEP background pre-cache when preview is disabled ([95ada78](https://github.com/YOUR_ORG/3d_viewer_electron/commits/95ada78cda5d06d128046d9587587844f3451756))
* support Ctrl/Cmd+click for multi-select (like Shift+click) ([f925082](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f92508288a07974968cea5fcc42d6cef301ca4ff))


### Bug Fixes

* .model files render white instead of default light blue ([2228fd7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2228fd71c8c5d5b0994bd9ce16ab9f7fb62eb153)), closes [#4A90D9](https://github.com/Faicad/3d_viewer_electron/issues/4A90D9)
* 左右两侧面板的 border-r 和 border-l 类上 — 它们渲染了一条 1px 的灰色线条,难看 ([db05989](https://github.com/YOUR_ORG/3d_viewer_electron/commits/db059896a0d59683ac249af6488f999673e9361c))
* add collectPartKeys and findNodeInTree helpers for multi-part selection ([d803ba4](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d803ba4462abf8682e7b9753baa85fb65f57a019))
* add explicit permissions block to CI workflow ([ab6d173](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ab6d17303f0b655a4c6e3abb327b954caa67dc51))
* allow ModelGroup to re-process meshes on viewMode change ([c4e95fe](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c4e95fe850378677f11c869a514684a26a86790b))
* apply default material to STL/model files and meshes without material ([f32ecf3](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f32ecf3ba3c9903fa4ba92dc2c1d93769bbfd66f)), closes [#9BA6](https://github.com/Faicad/3d_viewer_electron/issues/9BA6)
* apply visibilityMap to merged-geometry render path so scene-tree hide/show works for STL/PLY/OBJ/etc. ([ddb0122](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ddb01222466dd214eeafd8d0c3073c08b04d8533))
* auto-publish GitHub Releases draft after CI build ([ab23ba8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ab23ba8aad2b6d24d0f0460c3882618e6fbdc10b))
* camera bottom-up view for Y-up GLB and X-axis not horizontal ([06f8df0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/06f8df0ca9b49f545b47d9379007e6909bd88bc7))
* centralize Electron launch args and fix all CI test failures ([fe658d3](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fe658d39b7cf9b6549083848ee712ea3308e002b))
* clean up animation dead code and fix store issues ([82f2163](https://github.com/YOUR_ORG/3d_viewer_electron/commits/82f2163f7f1d280708ada00f0ef9512ae0a677ba))
* close context menu on canvas click via capture-phase pointerdown ([03650bc](https://github.com/YOUR_ORG/3d_viewer_electron/commits/03650bc0ab07b5c2f2f7e6473e12c92cebcc84de))
* closeAnimDialog no longer resets animation store, fix Playwright tests ([5cce6e7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5cce6e79d77615695efc433847a3e2d40cd491de))
* consolidate default material constants and apply to thumbnails ([b9d6862](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b9d686220a0f58688d2e4cb125ab09220aab3ac5)), closes [#9BA6](https://github.com/Faicad/3d_viewer_electron/issues/9BA6) [#4A90D9](https://github.com/Faicad/3d_viewer_electron/issues/4A90D9)
* decode double-encoded nbsp in model description as space ([58bd321](https://github.com/YOUR_ORG/3d_viewer_electron/commits/58bd3216b21088f4a8931fff93b96569503ff64d))
* disabled toolbar icons show gray tooltip with no hover background ([55b6582](https://github.com/YOUR_ORG/3d_viewer_electron/commits/55b658216922f7b37bc350042a46b677e05d3687))
* eliminate thumbnail flashing with 3-layer dedup defence ([1cd5f65](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1cd5f65366d9defa32e620fc633750c014b24587))
* enable heatbed toggle without model, always auto-size bed on load ([ee12aa6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ee12aa6f24cc870bf55dca18c3be87107c1563bb))
* enable SwiftShader on Linux CI, fix flaky E2E test ([4c27d16](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4c27d16fad06c3ac1a9f72b7e70cd45c01bf84bb))
* GLTF thumbnails fail with external references, VersionError, silent errors ([fec1dcf](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fec1dcf638d3ae791fe1cfb64dbaef5dc3cc953a))
* guard against undefined mapping in GLTFLoader associations iteration ([d0d94fe](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d0d94fe3259f4b5a80990edfe8f9ede1c27cd682))
* increase thumbnail lighting brightness ([4556f2f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4556f2f673ea4d2601e8dd35fdcd988af81c5871))
* inject viewBox BEFORE first load, not just on error retry ([ad1170d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ad1170dcb72084a7cc890a0463d4dec7672a77bc))
* install pages dependencies before building docs in CI ([0d5c66a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/0d5c66af6dba3a25e747d1c1981609db236dffd3))
* isCadSkillGlb read JSON chunk length from GLB header instead of 2048-byte limit ([a55495b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a55495bb0d5e0b7543363c7e79ddd4d68981dd40))
* move maximize button to left of preview toggle ([bc53acc](https://github.com/YOUR_ORG/3d_viewer_electron/commits/bc53acc5d30da21cd2393507c6f3ec9a53664ad0))
* move pnpm config to pnpm-workspace.yaml to eliminate v10 warning ([7cb38e6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/7cb38e6dda15ec7b8409b93e72eb19cb61cea499))
* move studio-env skip to before file input; skip SwiftShader test on macOS CI ([38b5513](https://github.com/YOUR_ORG/3d_viewer_electron/commits/38b55139a780836bb8514096c2c0bb9ecbd79980))
* normalize STL geometry to mm via heuristic, scope partId with fileId ([086fa5c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/086fa5c69765868a21e6bec5827833c86d7fc329))
* per-file sourceUnit for STL heuristic, remove global sourceUnit ([0551317](https://github.com/YOUR_ORG/3d_viewer_electron/commits/0551317b7e266f8a0993830631cc04ba68fcfd6d))
* per-plate centering only for print view, not assembly/import ([394b30d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/394b30d2a953aa7c8e17273729defe0bda34c65f))
* prevent CI OOM by limiting vitest forks and heap size; fix Windows Playwright spawn ([d66fb6d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d66fb6d258c7f6e8b11af6122e09f17a813ddfdc))
* properly decode multi-level HTML entities in model description ([fa30631](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fa306311d9a536d73c8f6b38769d8815792e2b62))
* reduce PMREM render size on software GPU to avoid 28s startup stall ([55b9daa](https://github.com/YOUR_ORG/3d_viewer_electron/commits/55b9daab1ed0fd01c850b20a1f1f8c6463b6e666))
* reject empty .model files with toast error instead of adding to scene tree ([a07a243](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a07a2432e6025e024d9bc53197eff12f9bf30897))
* relax shadow darkness assertion for macOS Metal tone-mapping ([f5e73b0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f5e73b0c577fd89d7fe7f18a6c63b78caf47a00d))
* remove MM_TO_RAW from Heatbed, fix sourceUnit for GLB STEP_T ([99bab9c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/99bab9cab938fe77b206c3e1ab8fc97fd5357b21))
* remove Node.js crypto module fallback in renderer sha256 ([9633843](https://github.com/YOUR_ORG/3d_viewer_electron/commits/963384381fab65000a0c58d7a27fcb3b69ced2bc))
* remove redundant codeql workflow, default setup already enabled ([9bb013c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/9bb013cf1da41aa16f2fcea406e36e82a61b5226))
* remove warehouse hdr ([f782b5b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f782b5b3b0ab542583d2d2ffa4ecf9af75fb3f6a))
* rename fullscreen to maximized, move to animation store ([a270cdf](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a270cdf5e04cc958545c3a3ca9a4fb4dd2e20aa1))
* replace text X with lucide X icon for fullscreen close button ([1e51f97](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1e51f97dc0c980bb9ce7c140407d3625542da6fb))
* reset viewingOriginal when user modifies material after restore ([0aa408a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/0aa408a0865b72e985bca0601793ecacb2e4eef7))
* resolve Electron binary install and tailwindcss resolution errors ([ed1f30d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ed1f30d12dd097312d3247c6a5249424f9493aa9))
* resolve ModelInfoPanel empty state and Bambu 3MF thumbnail integration ([962de23](https://github.com/YOUR_ORG/3d_viewer_electron/commits/962de234b7cd45952bd330396f9b19ce1f820ff0))
* restore missing keyboard event listener registration in DesktopLayout ([961e448](https://github.com/YOUR_ORG/3d_viewer_electron/commits/961e448296c46a2bde49034927aadd892ddc9c5a))
* restore ModelGroup faceIds debug log and fix cache test via window.__stepMemCacheHas ([12d5c2f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/12d5c2f435df998e372b8142f37107ab3daa8683))
* run vitest in single fork to avoid RPC teardown race on macOS CI ([a0a905f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a0a905fde4d8a4fe833865e4b0d224b7a5333dfb))
* scope partId with fileId to prevent cross-file selection collision ([21fe7da](https://github.com/YOUR_ORG/3d_viewer_electron/commits/21fe7daf330c91e18a52bfbb34da10d3326b4fb1))
* show live Playwright progress with --reporter=list + JSON file ([865b0f1](https://github.com/YOUR_ORG/3d_viewer_electron/commits/865b0f11c27e2cb6b8623adcd6ad7dbe2e26236f))
* simplify getDefaultUpAxis — use fileName for STEP→GLB Z-up detection instead of buffer scan ([fd355e8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fd355e8ee91e8165f97b77f5abfb76724dde1099))
* software-gpu.spec.ts reads __isSoftwareGpu from page context instead of static env ([ffd48bc](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ffd48bc5b5fc260c2f0363d60c45e041067d461f))
* STL single-merged-mesh not selectable by mouse click ([e05f8fd](https://github.com/YOUR_ORG/3d_viewer_electron/commits/e05f8fd69c0b44f4e4906ea1b935989a4790a415))
* STL unit heuristic display — heatbed label and atomic bed state ([078758c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/078758cf7a4021269d672e1b5ef49e4182c72e92))
* suppress vitest EnvironmentTeardownError in CI by checking JSON report for actual failures ([c8587ee](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c8587eeb6a4619551911c5b858064aaa0720091c))
* SVG thumbnails render at 4:3 instead of square, with full SVG format compatibility ([a9f28e1](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a9f28e1206e4180c21107e538b77526f45f3b8e6))
* sync environment map, shadow floor, and lights with up-axis toggle ([11f869c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/11f869c962e2b0c5cceb23e103e0db43824cb1ea))
* unify STEP format check with isStepFile(), cover both .step and .stp ([13a61d2](https://github.com/YOUR_ORG/3d_viewer_electron/commits/13a61d23675bf329ddf4c26813cbac9e0c1c711a))
* use 3MF embedded thumbnail with crop/scale to 200×150 ([fb6189d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fb6189d93dbf6b65a086ba16bbc67db47db0addf))
* use i18n for empty model error toast with filename ([1909ef5](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1909ef51a0380b65784ab20955f539c0ff1f2a02))
* use Minimize2 icon (counterpart to Maximize2) for fullscreen close button ([5b21f55](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5b21f550dc31b99350233f25b8bde051c6247fcc))
* use vitest threads pool instead of forks to avoid RPC teardown race on macOS ([c4cdc7e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c4cdc7ef3607aea41faf079c76c6117e3e46b6e2))


### Performance Improvements

* lazy load non-core 3D format loaders via dynamic imports ([fae4607](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fae4607101f888d7464ffb07ca9ce45082b7c912))
* make fflate import static to eliminate Vite warning ([8a37a2b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/8a37a2babf6485e27da0be6fb08625f0d5b37fb6))
* per-format gap (50ms 2D / 200ms 3D) and timeout (3s SVG / 60s STEP / 15s other) ([9b55695](https://github.com/YOUR_ORG/3d_viewer_electron/commits/9b556958094b8b13203a1e60ae08bce225edf5a1))


### Documentation

* add Toolbar (工具栏) documentation section with screenshots ([b7b5ede](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b7b5ede240d302ce4e6bcb7f3b5852a93e6750e3))
* fix toolbar history description and add 18 language translations ([7098206](https://github.com/YOUR_ORG/3d_viewer_electron/commits/709820625ecaf94e19a31f63b0ac5f5bb69f8aef))
* improve docs navigation, add missing translations, and add e2e tests ([c368e07](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c368e076af07c16ed7276a54d2e07f1fe4060243))


### Code Refactoring

* extract DEFAULT_CAM_POS constant to eliminate duplicate default camera position ([7d5c4b0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/7d5c4b0c68cb3d2b4647da2f8777598c70b5a6b5))
* rename thumbnail click handlers for clarity ([bfe5816](https://github.com/YOUR_ORG/3d_viewer_electron/commits/bfe5816e237bc8029641d20667d1b617c72c2b5a))
* replace faceIds console log dependency with window.__sceneHasFaceIds API ([c64ba5f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c64ba5f6f46071de4d860585fac478c21485b3bf))
* separate vitepress docs into independent pages project ([d42d24f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d42d24fdd8c02d9f21e2a0e6330b7eeb26cc30ac))
* unify two 'open file dialog' implementations into useFileLoader hook ([23ba3bd](https://github.com/YOUR_ORG/3d_viewer_electron/commits/23ba3bd446d00fb879cc546e3805d97d1efbcf9d))

## [1.3.0](https://github.com/YOUR_ORG/3d_viewer_electron/compare/v1.2.0...v1.3.0) (2026-06-01)


### Features

* add 20-language i18n + per-format doc pages with screenshots ([b9b3502](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b9b3502c392068d4257908ac9f3cba119c62acde))
* add ci-playwright retry script to reduce flaky test false positives ([2c0f217](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2c0f217e55c31ba022b823788859c0c96cd017a6))
* add Copy File Path / Copy Node Path to scene tree context menu ([522897f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/522897fa298c155dba7df132dc9866d4d253885f))
* add Delete key shortcut to remove selected models from scene ([7825975](https://github.com/YOUR_ORG/3d_viewer_electron/commits/7825975cfa13bebdcdf56822e1adee7f10eea20a))
* add DXF file format support via SVG workspace pipeline ([0bc156d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/0bc156d83522814650a7b9985204e48394577f37))
* add GLB extension panel showing extensions, materials, textures, and animations ([d9106d7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d9106d7e11024c0d753de7de794bc37dfeac2477))
* add SVG 2D canvas viewer with layer tree, grid layout, and visibility toggle ([a322eea](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a322eea59b70d43deba6913e5eb42ac87455d2f8))
* add SVG/DXF 2D format support, grouped format index, prev/next navigation ([1d6f2d5](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1d6f2d5450c65d793ebba9561bbf507124cefa16))
* add VitePress help documentation with GitHub Pages deployment ([1d9ca91](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1d9ca916739e97582118ecda6b3151b63a89884a))
* click material in GLB panel to edit all parts with that material ([ecfa06d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ecfa06d7c1e96402b29f15453a4fe96951c1ac9b))
* convert environment panel to floating window with i18n ([9aec8ab](https://github.com/YOUR_ORG/3d_viewer_electron/commits/9aec8ab76418d29712a9eccb591401b48464fdf9))
* detect software GPU at renderer init, add E2E sw-GPU test infrastructure ([874d01b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/874d01b702c2c9bdb05c0ea3f1cf14099ab1253b))
* object-mode selection highlight, bounding box corners, and drag-to-move ([aeed968](https://github.com/YOUR_ORG/3d_viewer_electron/commits/aeed968c7ee9a9c3563e6299cfb0dbf313e733fe))
* support loading custom HDR/EXR environment maps from local files ([bde29fa](https://github.com/YOUR_ORG/3d_viewer_electron/commits/bde29faeb8e08ff37bd245d295c3acf160f070a2))
* support multiple custom HDR/EXR environment maps ([c02ac22](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c02ac22ca673e04fc7cbb6ab751ab2efbabf72cc))
* translate all 20 locales with proper localized content ([1f873a0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1f873a0e1c2126b7a023164900feb7286a3d15c4))


### Bug Fixes

* add icon.icns for macOS build (generated from icon.png) ([04289bd](https://github.com/YOUR_ORG/3d_viewer_electron/commits/04289bd2ee131c1a127a3b2bfe13396d192ba920))
* add icon.png for macOS build (extracted from icon.ico) ([536feac](https://github.com/YOUR_ORG/3d_viewer_electron/commits/536feacf680ea2d3851780b92252cb68c4c4aa83))
* add SelectionBoundingBoxUtils ([80b9d3a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/80b9d3a5edf6620733bab6a881787fba9af1615c))
* disable NetworkServiceSandbox ([bd6e246](https://github.com/YOUR_ORG/3d_viewer_electron/commits/bd6e246c205141f360d34423e257a16549a13af9))
* remove duplicate pnpm version spec in deploy workflow ([29ce46b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/29ce46ba7f2e9d26b64812e05e7edfa8c921511d))
* remove unused destructured imports in dxf-load-zoom test ([f4fb36a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/f4fb36a3911eecbf5ee85400b362feca76381d23))
* reorder loadFilePath before handleNativeOpenFile to fix react-hooks/immutability lint error ([0033956](https://github.com/YOUR_ORG/3d_viewer_electron/commits/003395653bb190d3c07f459213a278a17e08a20c))
* selection mode defaults, multi-file drag, highlight leak, and topology overlay positioning ([3fcabcf](https://github.com/YOUR_ORG/3d_viewer_electron/commits/3fcabcf54ee22811d5a0430c36383ca2f92ccea4))
* set mac.icon to null to skip missing icon.icns on macOS build ([2ede7d8](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2ede7d8b0292ade32ed1d12441ade6ca3515398c))
* set VitePress base path for GitHub Pages sub-path deployment ([ba4d876](https://github.com/YOUR_ORG/3d_viewer_electron/commits/ba4d876b052ea949ec4683858dcaba4abf345ee7))
* SVG thumbnails, zoom, mode switching, and UI polish ([5e2cc3b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/5e2cc3be7678986a8fb4dc90a15edf351669c50e))
* sync __animActive to engine store and fix E2E wait logic for camera auto-fit ([309f31d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/309f31d813aa45dbfd56dd62838137168c3b4087))
* sync model store when SVG/DXF file removed from workspace ([d85b94c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d85b94c9445103c37c11e97ced4466b4949af829))
* update tmp to 0.2.7 to fix CVE-2026-44705 path traversal (Dependabot [#35](https://github.com/Faicad/3d_viewer_electron/issues/35)) ([80d7d02](https://github.com/YOUR_ORG/3d_viewer_electron/commits/80d7d02817ea60fe60f7b8a81069cd6fafa15df6))
* upscale icon.png to 512x512 for macOS build requirement ([2b6e537](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2b6e5372b33b1a278513efddef01e23220c38683))


### Code Refactoring

* change root locale from zh-CN to en ([868b94d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/868b94d61d747e1f0577bdc009486a039919db36))


### Documentation

* add animation player translations for all 20 locales ([93a748f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/93a748f798704621e97f24f81e7c944f4e3b5af6))
* animations for pages ([8a40518](https://github.com/YOUR_ORG/3d_viewer_electron/commits/8a405186744cc18f8a5b9e8fa5cbeabccf545109))

## [1.2.0](https://github.com/YOUR_ORG/3d_viewer_electron/compare/v1.1.1...v1.2.0) (2026-05-28)


### Features

* add GLTF animation player with popup dialog ([cc4878f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/cc4878f2b88303b4cf10326af084a80b1a759506))
* add history model panel with toolbar toggle, snapshot dedup, and thumbnail preview ([b863806](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b8638064f679e52447263cada8df717eb94617b7))
* add material editor and environment editor (Phase 8) ([2271288](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2271288e9e8d9822ed5094523c89c52f2ab30970))
* add material manager toolbar button with auto-switch and i18n ([e0247ad](https://github.com/YOUR_ORG/3d_viewer_electron/commits/e0247ad54d121358c21f711701b84a69761c658c))
* add multi-file open support with grid layout and independent scene trees ([1abcbe6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/1abcbe62449bd423233ffb8c8dd16eaf2d8976e6))
* auto-hide shadow floor in wireframe and mesh display modes ([9082740](https://github.com/YOUR_ORG/3d_viewer_electron/commits/90827406e61b0414d37b3c97005396cf3abf4dd1))
* dynamically adapt studio environment floor to model size ([46ec82e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/46ec82e204c2ed1d14c02acef865263dc2703df0))
* fullscreen auto-hide for toolbar and bottom controls ([714e4d4](https://github.com/YOUR_ORG/3d_viewer_electron/commits/714e4d465fcc5e9078e24fa6a1d69a400570d9fb))
* material editor card-based grouping and layout fixes ([4742aa1](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4742aa1e55fb763dea77fa4289deb34848064a2c))
* material editor texture display, alpha mode segmented control, and Draco/KTX2 loader support ([2c51e80](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2c51e80805166bb8bca1d96cecab638d883b45c9))
* PBR rendering pipeline — IBL environment, material system, shadow floor, texture cache ([2a4967f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2a4967f4cff5b1587f704d2566a4bc6b29658a35))
* register file associations for OS-level file type support ([37793bf](https://github.com/YOUR_ORG/3d_viewer_electron/commits/37793bf2f71dcf3cb98c2701adaa13222aa12384))
* simplify env map presets to 3 options with dev/prod loading strategy ([8fdb908](https://github.com/YOUR_ORG/3d_viewer_electron/commits/8fdb9080f8a56b16b5489c7b247dd410f2377b41))
* update environment panel labels, reorder toolbar, add settings tooltip ([e17bea5](https://github.com/YOUR_ORG/3d_viewer_electron/commits/e17bea5f3939f29ef60f45e9a4603a1876eb45e3))
* UV mapping visualization with texture preview dialog and checkerboard ([2d97b9c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/2d97b9c5c980f593ad43dd878a69ecb1bdb7d8a1))
* wire post-processing pipeline into the render loop ([dda3ff5](https://github.com/YOUR_ORG/3d_viewer_electron/commits/dda3ff5dde8ad171551f797c905b6471ea4dd83f))


### Bug Fixes

* add missing Palette import and error guard for E2E tests ([133d21f](https://github.com/YOUR_ORG/3d_viewer_electron/commits/133d21f144f9ad735c2352d29a78f8e06638031c))
* align environment map orientation with Z-up coordinate system ([133f6f3](https://github.com/YOUR_ORG/3d_viewer_electron/commits/133f6f352337e3a7bea5762b4b69f8c7dcdb78c7))
* apply scene-tree visibility to non-mesh objects and harden thumbnail cloning ([cc3cc13](https://github.com/YOUR_ORG/3d_viewer_electron/commits/cc3cc13f4b33a3c7a8b4016dfa989148c0bcb7c4))
* CacheManager toolbar icon not opening dialog due to Tooltip nesting in DialogTrigger asChild ([c95adc0](https://github.com/YOUR_ORG/3d_viewer_electron/commits/c95adc0967852cf433201cd8c69272eb951e7d08))
* correct environment Z-axis inversion and shadow visibility ([14a30a7](https://github.com/YOUR_ORG/3d_viewer_electron/commits/14a30a79771b7052644810d9b533bf801856cc8a))
* environment background mapping, CleanRoom brightness, and camera type checks ([7befe7e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/7befe7ed917d037386e1520f45680dea41d54cfc))
* environment map background displays correctly and shadows are visible ([71b9419](https://github.com/YOUR_ORG/3d_viewer_electron/commits/71b9419f25bc1820193c6ac880d71c49af0b4be0))
* environment map rotation, preset switching, and background mapping ([6cf1d5a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/6cf1d5a8cf5d890a43fc24173ac17bf9e049c60e))
* guard Zustand v5 subscribe callbacks to prevent overwhelming renderer ([32a530c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/32a530c99132f375ae9bba80daf83410b97d39a5))
* increase shadow floor epsilon and minimum shadow frustum ([d3c4a59](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d3c4a597ccb88294b298c0759f6b1cda4aedd659))
* material editor showing default color instead of original part material ([b1eb6ac](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b1eb6ac23068e00dccc822d046a24b337d09ad37))
* material editor title order to partName/filename, thickness range 0-1.5 ([bc90893](https://github.com/YOUR_ORG/3d_viewer_electron/commits/bc908932b83a3dc8496406a5f1e50fe579d24805))
* persist history store correctly and fix thumbnail cache key mismatch ([b52a03c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b52a03cba1a49cd623733e4375c0e1a94edce85d))
* prevent z-fighting artifacts in selection highlight by disabling depthTest ([a13d36c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a13d36c60d2ce1f66030e78bd4a5c560ccb38a2d))
* reduce shadow aliasing with higher-res shadow map and tighter frustum ([cc45b0e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/cc45b0e1f7a5ce619306b7ecaad46b7908cc8b39))
* replace fake shadow mask with real 3D shadow controls ([4f108a6](https://github.com/YOUR_ORG/3d_viewer_electron/commits/4f108a656cba8c07073a584d0c9b4175e0daee1a))
* resolve z-fighting with logarithmic depth buffer and polygon offset ([e8758ce](https://github.com/YOUR_ORG/3d_viewer_electron/commits/e8758ce44d64e8073b531ad5c95e3b1942c2be52))
* revert to default frameloop and use priority=1 useFrame for composer ([d1d036a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/d1d036a42cadc943769238c481c2a29e6a1b1145))
* rewrite procedural studio environment to match reference implementation ([a07e35a](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a07e35ab5b57803a2c3e7d0bb3e6896f326b7e06))
* shadow visibility and Zustand v5 subscription API ([a366c74](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a366c74336964bebaa04b3229323afae275bb559))
* studio floor turning black from PMREM near-plane clipping ([9962cf2](https://github.com/YOUR_ORG/3d_viewer_electron/commits/9962cf28761e87c1173559956cbcc502a86ef770))
* sync scene tree visibility to 3D models, reset on re-open, multi-model camera fit ([b4d1602](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b4d160210289bb58ad9c7762d3fce28cea27878f))
* tighten shadow camera near/far and fix scene tree visibility for non-active files ([a979ae9](https://github.com/YOUR_ORG/3d_viewer_electron/commits/a979ae96c48752cd4f606ba681fccbb6dbc23b3f))
* tooltip ([cfe3a93](https://github.com/YOUR_ORG/3d_viewer_electron/commits/cfe3a936cb659a5f3a0445b30b0a84c4c68c06e2))
* ui ([b290348](https://github.com/YOUR_ORG/3d_viewer_electron/commits/b2903488cb1f8deee19011afc2c53d7905792756))
* use platform-aware getElectronPath in diag test and add jsdom step to CI ([387268e](https://github.com/YOUR_ORG/3d_viewer_electron/commits/387268e6fdb9f30eb6eaa3b81ddb9f913dee321e))


### Performance Improvements

* defer thumbnail generation and directory listing to after 3D model renders ([e704c4d](https://github.com/YOUR_ORG/3d_viewer_electron/commits/e704c4d482049e6bd2df6fee1a8bb8b19777b6ab))


### Code Refactoring

* remove unused 4K HDR environment map toggle ([fe7275c](https://github.com/YOUR_ORG/3d_viewer_electron/commits/fe7275c8b9ee257f7604c69e8aa227fd09628d68))
* use Zustand v5 (state, prevState) signature in subscribe callbacks ([72f0f5b](https://github.com/YOUR_ORG/3d_viewer_electron/commits/72f0f5b483af9b34ba60502ac4c33d3433ff07a8))

### [1.1.1](https://github.com/YOUR_ORG/3d_viewer_electron/compare/v1.1.0...v1.1.1) (2026-05-22)


### Documentation

* add versioning and commit conventions documentation ([edaa1ce](https://github.com/YOUR_ORG/3d_viewer_electron/commits/edaa1cebe8991527371ad37ba81f26007c5a205d))

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
