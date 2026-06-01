# Animationsspelare

Faicad 3D Viewer innehåller en inbyggd animationsspelare för glTF-filer som innehåller animationsdata. Den stöder skelettbaserade animationer, morph targets och fullständig uppspelningskontroll.

## Demo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Din webbläsare stöder inte inbäddad video.
</video>

## Helskärmsuppspelning

Klicka på **Maximera**-knappen (⛶) i det övre högra hörnet av dialogrutan för att gå till helskärmsläge. Animationen fyller hela fönstret och tar bort allt annat gränssnitt — idealiskt för fokuserad granskning och presentationer. Tryck på **Esc** eller klicka på **Minimera** för att återgå till dialogrutan.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Din webbläsare stöder inte inbäddad video.
</video>

## Fler Animationer

Demomodellen `RobotExpressive.glb` innehåller 14 animationsklipp, alla visade i helskärmsläge. Dessa videor **genereras automatiskt** från den körande applikationen — ingen manuell inspelning krävs.

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

## Alla Tillgängliga Klipp

| Klipp | Längd | | Klipp | Längd |
|-------|-------|---|-------|-------|
| Dance | 3,3 s | | Death | 1,0 s |
| Idle | 3,3 s | | Jump | 0,7 s |
| No | 1,7 s | | Punch | 0,8 s |
| Running | 1,0 s | | Sitting | 0,4 s |
| Standing | 0,4 s | | ThumbsUp | 1,6 s |
| Walking | 1,0 s | | WalkJump | 0,8 s |
| Wave | 1,8 s | | Yes | 1,7 s |

## Format som Stöds

| Format | Tillägg | Animationstyp |
|--------|---------|--------------|
| GLB | `.glb` | Skelett + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Skelett + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Skelettanimation |
| DAE (Collada) | `.dae` | Skelett + Scenanimation |
| BVH | `.bvh` | Rörelsefångst för skelett |
| MD2 | `.md2` | Vertexanimation (morph frames) |

## Uppspelningskontroller

| Kontroll | Beskrivning |
|----------|-------------|
| **Spela / Pausa** | Starta eller pausa den aktuella animationen |
| **Hastighet** | Justera uppspelningshastighet (0,25× – 4×) |
| **Sök** | Hoppa till valfri punkt i tidslinjen |
| **Loop** | Växla mellan upprepning och enkel uppspelning |
| **Ping-Pong** | Spela framåt och sedan bakåt i en loop |

## Hur man Använder

1. **Ladda** en animerad modell (GLB, GLTF, FBX, etc.) via dra och släpp, fildialog eller inklistring från urklipp
2. **Klicka** på Spela-knappen (▶) i verktygsfältet för att öppna Animationsspelaren
3. **Välj** ett animationsklipp från rullgardinsmenyn
4. **Kontrollera** uppspelningen med spela/pausa, hastighet, sök, loop och ping-pong-kontroller
5. **Maximera** dialogrutan till helskärm för en dedikerad animationsvy
