# Reproductor de Animaciones

El Faicad 3D Viewer incluye un reproductor de animaciones integrado para archivos glTF que contengan datos de animación. Compatible con animaciones esqueléticas, objetivos de morphing y control completo de reproducción.

## Demostración — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Su navegador no admite video integrado.
</video>

## Reproducción a Pantalla Completa

Haga clic en el botón **Maximizar** (⛶) en la esquina superior derecha del diálogo para entrar en modo de pantalla completa. La animación llena toda la ventana, eliminando toda la interfaz — ideal para revisión enfocada y presentaciones. Presione **Esc** o haga clic en **Minimizar** para volver al diálogo.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Su navegador no admite video integrado.
</video>

## Más Animaciones

El modelo de demostración `RobotExpressive.glb` contiene 14 clips de animación, todos mostrados en modo de pantalla completa. Estos videos se **generan automáticamente** desde la aplicación en ejecución — sin necesidad de grabación manual.

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

## Todos los Clips Disponibles

| Clip | Duración | | Clip | Duración |
|------|----------|---|------|----------|
| Dance | 3.3 s | | Death | 1.0 s |
| Idle | 3.3 s | | Jump | 0.7 s |
| No | 1.7 s | | Punch | 0.8 s |
| Running | 1.0 s | | Sitting | 0.4 s |
| Standing | 0.4 s | | ThumbsUp | 1.6 s |
| Walking | 1.0 s | | WalkJump | 0.8 s |
| Wave | 1.8 s | | Yes | 1.7 s |

## Formatos Compatibles

| Formato | Extensiones | Tipo de Animación |
|---------|-------------|-------------------|
| GLB | `.glb` | Esqueleto + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Esqueleto + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Animación esquelética |
| DAE (Collada) | `.dae` | Esqueleto + Animación de escena |
| BVH | `.bvh` | Captura de movimiento esquelético |
| MD2 | `.md2` | Animación de vértices (morph frames) |

## Controles de Reproducción

| Control | Descripción |
|---------|-------------|
| **Reproducir / Pausa** | Iniciar o pausar la animación actual |
| **Velocidad** | Ajustar velocidad de reproducción (0.25× – 4×) |
| **Buscar** | Saltar a cualquier punto de la línea de tiempo |
| **Bucle** | Alternar entre repetición y reproducción única |
| **Ping-Pong** | Reproducir hacia adelante y luego hacia atrás en bucle |

## Cómo Usar

1. **Cargue** un modelo animado (GLB, GLTF, FBX, etc.) mediante arrastrar y soltar, diálogo de archivo o pegado desde portapapeles
2. **Haga clic** en el botón Reproducir (▶) en la barra de herramientas para abrir el diálogo del Reproductor de Animaciones
3. **Seleccione** un clip de animación del menú desplegable
4. **Controle** la reproducción con los controles de reproducir/pausar, velocidad, buscar, bucle y ping-pong
5. **Maximice** el diálogo a pantalla completa para una ventana de visualización de animación dedicada
