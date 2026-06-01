# Lettore di Animazioni

Il Faicad 3D Viewer include un lettore di animazioni integrato per file glTF contenenti dati di animazione. Supporta animazioni scheletriche, morph target e controllo completo della riproduzione.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Il tuo browser non supporta video incorporati.
</video>

## Riproduzione a Schermo Intero

Fare clic sul pulsante **Ingrandisci** (⛶) nell'angolo superiore destro della finestra di dialogo per entrare in modalità schermo intero. L'animazione riempie l'intera finestra, rimuovendo tutta l'interfaccia utente — ideale per revisioni mirate e presentazioni. Premere **Esc** o fare clic su **Riduci** per tornare alla finestra di dialogo.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Il tuo browser non supporta video incorporati.
</video>

## Altre Animazioni

Il modello dimostrativo `RobotExpressive.glb` contiene 14 clip di animazione, tutti mostrati in modalità schermo intero. Questi video vengono **generati automaticamente** dall'applicazione in esecuzione — nessuna registrazione manuale necessaria.

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

## Tutti i Clip Disponibili

| Clip | Durata | | Clip | Durata |
|------|--------|---|------|--------|
| Dance | 3,3 s | | Death | 1,0 s |
| Idle | 3,3 s | | Jump | 0,7 s |
| No | 1,7 s | | Punch | 0,8 s |
| Running | 1,0 s | | Sitting | 0,4 s |
| Standing | 0,4 s | | ThumbsUp | 1,6 s |
| Walking | 1,0 s | | WalkJump | 0,8 s |
| Wave | 1,8 s | | Yes | 1,7 s |

## Formati Supportati

| Formato | Estensioni | Tipo di Animazione |
|---------|------------|--------------------|
| GLB | `.glb` | Scheletro + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Scheletro + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Animazione scheletrica |
| DAE (Collada) | `.dae` | Scheletro + Animazione di scena |
| BVH | `.bvh` | Cattura movimento scheletrico |
| MD2 | `.md2` | Animazione vertici (morph frames) |

## Controlli di Riproduzione

| Controllo | Descrizione |
|-----------|-------------|
| **Riproduci / Pausa** | Avviare o mettere in pausa l'animazione corrente |
| **Velocità** | Regolare la velocità di riproduzione (0,25× – 4×) |
| **Cerca** | Saltare a qualsiasi punto della timeline |
| **Ripeti** | Alternare tra ripetizione e riproduzione singola |
| **Ping-Pong** | Riprodurre avanti e poi indietro in loop |

## Come Usare

1. **Caricare** un modello animato (GLB, GLTF, FBX, ecc.) tramite drag & drop, finestra di dialogo o incolla dagli appunti
2. **Fare clic** sul pulsante Riproduci (▶) nella barra degli strumenti per aprire il Lettore di Animazioni
3. **Selezionare** un clip di animazione dal menu a discesa
4. **Controllare** la riproduzione con i comandi riproduci/pausa, velocità, cerca, ripeti e ping-pong
5. **Ingrandire** la finestra di dialogo a schermo intero per una visualizzazione dedicata dell'animazione
