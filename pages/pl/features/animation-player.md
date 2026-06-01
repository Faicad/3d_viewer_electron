# Odtwarzacz Animacji

Faicad 3D Viewer zawiera wbudowany odtwarzacz animacji dla plików glTF zawierających dane animacji. Obsługuje animacje szkieletowe, cele morfingu oraz pełną kontrolę odtwarzania.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Twoja przeglądarka nie obsługuje osadzonego wideo.
</video>

## Odtwarzanie Pełnoekranowe

Kliknij przycisk **Maksymalizuj** (⛶) w prawym górnym rogu okna dialogowego, aby przejść do trybu pełnoekranowego. Animacja wypełnia całe okno, usuwając cały interfejs — idealne do skupionego przeglądu i prezentacji. Naciśnij **Esc** lub kliknij **Minimalizuj**, aby wrócić do okna dialogowego.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Twoja przeglądarka nie obsługuje osadzonego wideo.
</video>

## Więcej Animacji

Model demonstracyjny `RobotExpressive.glb` zawiera 14 klipów animacji, wszystkie pokazane w trybie pełnoekranowym. Te filmy są **automatycznie generowane** z działającej aplikacji — bez ręcznego nagrywania.

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

## Wszystkie Dostępne Klipy

| Klip | Czas trwania | | Klip | Czas trwania |
|------|-------------|---|------|-------------|
| Dance | 3,3 s | | Death | 1,0 s |
| Idle | 3,3 s | | Jump | 0,7 s |
| No | 1,7 s | | Punch | 0,8 s |
| Running | 1,0 s | | Sitting | 0,4 s |
| Standing | 0,4 s | | ThumbsUp | 1,6 s |
| Walking | 1,0 s | | WalkJump | 0,8 s |
| Wave | 1,8 s | | Yes | 1,7 s |

## Obsługiwane Formatty

| Format | Rozszerzenia | Typ Animacji |
|--------|-------------|-------------|
| GLB | `.glb` | Szkieletowa + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Szkieletowa + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Animacja szkieletowa |
| DAE (Collada) | `.dae` | Szkieletowa + Animacja sceny |
| BVH | `.bvh` | Przechwytywanie ruchu szkieletu |
| MD2 | `.md2` | Animacja wierzchołków (morph frames) |

## Sterowanie Odtwarzaniem

| Sterowanie | Opis |
|-----------|------|
| **Odtwarzaj / Pauza** | Uruchom lub zatrzymaj aktualną animację |
| **Prędkość** | Dostosuj prędkość odtwarzania (0,25× – 4×) |
| **Szukaj** | Przeskocz do dowolnego punktu na osi czasu |
| **Zapętl** | Przełącz między powtarzaniem a jednokrotnym odtwarzaniem |
| **Ping-Pong** | Odtwarzaj do przodu, a następnie do tyłu w pętli |

## Jak Używać

1. **Załaduj** animowany model (GLB, GLTF, FBX itp.) poprzez przeciąganie i upuszczanie, okno dialogowe pliku lub wklejanie ze schowka
2. **Kliknij** przycisk Odtwarzaj (▶) na pasku narzędzi, aby otworzyć Odtwarzacz Animacji
3. **Wybierz** klip animacji z menu rozwijanego
4. **Steruj** odtwarzaniem za pomocą przycisków odtwarzaj/pauza, prędkości, szukaj, zapętl i ping-pong
5. **Maksymalizuj** okno dialogowe do pełnego ekranu, aby uzyskać dedykowany widok animacji
