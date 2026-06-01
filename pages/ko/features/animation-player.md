# 애니메이션 플레이어

Faicad 3D Viewer에는 애니메이션 데이터가 포함된 glTF 파일을 위한 내장 애니메이션 플레이어가 있습니다. 스켈레톤 애니메이션, 모프 타겟, 완전한 재생 제어를 지원합니다.

## 데모 — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  브라우저가 내장 비디오를 지원하지 않습니다.
</video>

## 전체화면 재생

대화상자 오른쪽 상단의 **최대화** 버튼(⛶)을 클릭하면 전체화면 모드로 전환됩니다. 애니메이션이 전체 창을 채우며 모든 UI가 제거됩니다 — 집중적인 검토와 프레젠테이션에 이상적입니다. **Esc** 키를 누르거나 **최소화** 버튼을 클릭하면 대화상자로 돌아갑니다.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  브라우저가 내장 비디오를 지원하지 않습니다.
</video>

## 더 많은 애니메이션

데모 모델 `RobotExpressive.glb`에는 14개의 애니메이션 클립이 포함되어 있으며, 모두 전체화면 모드로 표시됩니다. 이 비디오들은 실행 중인 애플리케이션에서 **자동 생성**되며, 수동 녹화가 필요하지 않습니다.

### Idle

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Idle-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Idle-fullscreen.mp4" type="video/mp4">
</video>

### Running

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Running-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Running-fullscreen.mp4" type="video/mp4">
</video>

### Dance

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Dance-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Dance-fullscreen.mp4" type="video/mp4">
</video>

## 모든 클립

| 클립 | 재생 시간 | | 클립 | 재생 시간 |
|------|----------|---|------|----------|
| Dance | 3.3초 | | Death | 1.0초 |
| Idle | 3.3초 | | Jump | 0.7초 |
| No | 1.7초 | | Punch | 0.8초 |
| Running | 1.0초 | | Sitting | 0.4초 |
| Standing | 0.4초 | | ThumbsUp | 1.6초 |
| Walking | 1.0초 | | WalkJump | 0.8초 |
| Wave | 1.8초 | | Yes | 1.7초 |

## 지원되는 포맷

| 포맷 | 확장자 | 애니메이션 유형 |
|------|--------|----------------|
| GLB | `.glb` | 스켈레톤 + 모프 타겟 (glTF 2.0) |
| GLTF | `.gltf` | 스켈레톤 + 모프 타겟 (glTF 2.0) |
| FBX | `.fbx` | 스켈레톤 애니메이션 |
| DAE (Collada) | `.dae` | 스켈레톤 + 씬 애니메이션 |
| BVH | `.bvh` | 모션 캡처 스켈레톤 |
| MD2 | `.md2` | 버텍스 애니메이션 (모프 프레임) |

## 재생 제어

| 제어 | 설명 |
|------|------|
| **재생 / 일시정지** | 현재 애니메이션 시작 또는 일시정지 |
| **속도** | 재생 속도 조절 (0.25배 – 4배) |
| **탐색** | 애니메이션 타임라인의 아무 지점으로 이동 |
| **반복** | 반복 재생과 단일 재생 간 전환 |
| **핑퐁** | 앞으로 재생 후 뒤로 반복 재생 |

## 사용 방법

1. **로드** — 드래그 앤 드롭, 파일 대화상자 또는 클립보드 붙여넣기를 통해 애니메이션 모델(GLB, GLTF, FBX 등) 로드
2. **클릭** — 도구 모음의 재생 버튼(▶)을 클릭하여 애니메이션 플레이어 열기
3. **선택** — 드롭다운 메뉴에서 애니메이션 클립 선택
4. **제어** — 재생/일시정지, 속도, 탐색, 반복, 핑퐁 컨트롤로 재생 제어
5. **최대화** — 대화상자를 전체화면으로 최대화하여 전용 애니메이션 뷰포트에서 확인
