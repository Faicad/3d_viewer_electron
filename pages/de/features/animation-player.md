# Animations-Player

Der Faicad 3D Viewer enthält einen integrierten Animations-Player für glTF-Dateien mit Animationsdaten. Er unterstützt Skelettanimationen, Morph-Targets und vollständige Wiedergabesteuerung.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Ihr Browser unterstützt keine eingebetteten Videos.
</video>

## Vollbild-Wiedergabe

Klicken Sie auf die Schaltfläche **Maximieren** (⛶) in der oberen rechten Ecke des Dialogs, um den Vollbildmodus zu aktivieren. Die Animation füllt das gesamte Fenster aus und entfernt die gesamte Benutzeroberfläche — ideal für fokussierte Überprüfungen und Präsentationen. Drücken Sie **Esc** oder klicken Sie auf **Minimieren**, um zum Dialog zurückzukehren.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Ihr Browser unterstützt keine eingebetteten Videos.
</video>

## Weitere Animationen

Das Demomodell `RobotExpressive.glb` enthält 14 Animations-Clips, alle im Vollbildmodus dargestellt. Diese Videos werden **automatisch** aus der laufenden Anwendung generiert — keine manuelle Aufnahme erforderlich.

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

## Alle Verfügbaren Clips

| Clip | Dauer | | Clip | Dauer |
|------|-------|---|------|-------|
| Dance | 3,3 s | | Death | 1,0 s |
| Idle | 3,3 s | | Jump | 0,7 s |
| No | 1,7 s | | Punch | 0,8 s |
| Running | 1,0 s | | Sitting | 0,4 s |
| Standing | 0,4 s | | ThumbsUp | 1,6 s |
| Walking | 1,0 s | | WalkJump | 0,8 s |
| Wave | 1,8 s | | Yes | 1,7 s |

## Unterstützte Formate

| Format | Erweiterungen | Animationstyp |
|--------|---------------|---------------|
| GLB | `.glb` | Skelett + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Skelett + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Skelettanimation |
| DAE (Collada) | `.dae` | Skelett + Szenenanimation |
| BVH | `.bvh` | Motion-Capture-Skelett |
| MD2 | `.md2` | Vertex-Animation (Morph-Frames) |

## Wiedergabesteuerung

| Steuerung | Beschreibung |
|-----------|-------------|
| **Abspielen / Pause** | Aktuelle Animation starten oder pausieren |
| **Geschwindigkeit** | Wiedergabegeschwindigkeit anpassen (0,25× – 4×) |
| **Suche** | Zu beliebiger Position im Zeitstrahl springen |
| **Wiederholen** | Zwischen Wiederholung und Einmalwiedergabe umschalten |
| **Ping-Pong** | Vorwärts und rückwärts in Schleife abspielen |

## Verwendung

1. **Laden** Sie ein animiertes Modell (GLB, GLTF, FBX usw.) per Drag & Drop, Dateidialog oder Zwischenablage
2. **Klicken** Sie auf die Wiedergabeschaltfläche (▶) in der Symbolleiste, um den Animations-Player zu öffnen
3. **Wählen** Sie einen Animationsclip aus dem Dropdown-Menü
4. **Steuern** Sie die Wiedergabe mit den Funktionen Abspielen/Pause, Geschwindigkeit, Suche, Wiederholen und Ping-Pong
5. **Maximieren** Sie den Dialog für eine dedizierte Animationsansicht im Vollbildmodus
