# Animatie Speler

De Faicad 3D Viewer bevat een ingebouwde animatiespeler voor glTF-bestanden met animatiegegevens. Het ondersteunt skeleton-animaties, morph targets en volledige afspeelbediening.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Uw browser ondersteunt geen ingebedde video.
</video>

## Volledig Scherm Afspelen

Klik op de knop **Maximaliseren** (⛶) in de rechterbovenhoek van het dialoogvenster om de volledig schermmodus te openen. De animatie vult het hele venster en verwijdert alle interface-elementen — ideaal voor gerichte beoordeling en presentaties. Druk op **Esc** of klik op **Minimaliseren** om terug te keren naar het dialoogvenster.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Uw browser ondersteunt geen ingebedde video.
</video>

## Meer Animaties

Het demomodel `RobotExpressive.glb` bevat 14 animatieclips, allemaal weergegeven in volledig scherm. Deze video's worden **automatisch gegenereerd** vanuit de actieve applicatie — geen handmatige opname nodig.

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

## Alle Beschikbare Clips

| Clip | Duur | | Clip | Duur |
|------|------|---|------|------|
| Dance | 3,3 s | | Death | 1,0 s |
| Idle | 3,3 s | | Jump | 0,7 s |
| No | 1,7 s | | Punch | 0,8 s |
| Running | 1,0 s | | Sitting | 0,4 s |
| Standing | 0,4 s | | ThumbsUp | 1,6 s |
| Walking | 1,0 s | | WalkJump | 0,8 s |
| Wave | 1,8 s | | Yes | 1,7 s |

## Ondersteunde Formatten

| Formaat | Extensies | Animatietype |
|---------|-----------|--------------|
| GLB | `.glb` | Skelet + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Skelet + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Skeletanimatie |
| DAE (Collada) | `.dae` | Skelet + Scène-animatie |
| BVH | `.bvh` | Motion-capture skelet |
| MD2 | `.md2` | Vertex-animatie (morph frames) |

## Afspeelbediening

| Bediening | Beschrijving |
|-----------|-------------|
| **Afspelen / Pauzeren** | Huidige animatie starten of pauzeren |
| **Snelheid** | Afspeelsnelheid aanpassen (0,25× – 4×) |
| **Zoeken** | Naar elk punt in de tijdlijn springen |
| **Herhalen** | Schakelen tussen herhalen en eenmalig afspelen |
| **Ping-Pong** | Vooruit en dan achteruit afspelen in een lus |

## Hoe te Gebruiken

1. **Laad** een geanimeerd model (GLB, GLTF, FBX, etc.) via slepen en neerzetten, bestandsdialoog of klembord plakken
2. **Klik** op de Afspeelknop (▶) in de werkbalk om de Animatie Speler te openen
3. **Selecteer** een animatieclip uit het keuzemenu
4. **Bedien** het afspelen met de afspeel/pauze-, snelheids-, zoek-, herhaal- en ping-pong-regelaars
5. **Maximaliseer** het dialoogvenster naar volledig scherm voor een speciale animatieweergave
