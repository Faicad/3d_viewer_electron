# Lecteur d'Animations

Le Faicad 3D Viewer comprend un lecteur d'animations intégré pour les fichiers glTF contenant des données d'animation. Il prend en charge les animations squelettiques, les morph targets et un contrôle de lecture complet.

## Démo — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Votre navigateur ne prend pas en charge la vidéo intégrée.
</video>

## Lecture Plein Écran

Cliquez sur le bouton **Agrandir** (⛶) dans le coin supérieur droit de la boîte de dialogue pour passer en mode plein écran. L'animation remplit toute la fenêtre, supprimant toute l'interface — idéal pour une visualisation concentrée et des présentations. Appuyez sur **Échap** ou cliquez sur **Réduire** pour revenir à la boîte de dialogue.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Votre navigateur ne prend pas en charge la vidéo intégrée.
</video>

## Plus d'Animations

Le modèle de démonstration `RobotExpressive.glb` contient 14 clips d'animation, tous présentés en mode plein écran. Ces vidéos sont **générées automatiquement** à partir de l'application en cours d'exécution — aucun enregistrement manuel nécessaire.

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

## Tous les Clips Disponibles

| Clip | Durée | | Clip | Durée |
|------|-------|---|------|-------|
| Dance | 3,3 s | | Death | 1,0 s |
| Idle | 3,3 s | | Jump | 0,7 s |
| No | 1,7 s | | Punch | 0,8 s |
| Running | 1,0 s | | Sitting | 0,4 s |
| Standing | 0,4 s | | ThumbsUp | 1,6 s |
| Walking | 1,0 s | | WalkJump | 0,8 s |
| Wave | 1,8 s | | Yes | 1,7 s |

## Formats Pris en Charge

| Format | Extensions | Type d'Animation |
|--------|------------|------------------|
| GLB | `.glb` | Squelette + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Squelette + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Animation squelettique |
| DAE (Collada) | `.dae` | Squelette + Animation de scène |
| BVH | `.bvh` | Capture de mouvement squelettique |
| MD2 | `.md2` | Animation de sommets (morph frames) |

## Contrôles de Lecture

| Contrôle | Description |
|----------|-------------|
| **Lecture / Pause** | Démarrer ou mettre en pause l'animation en cours |
| **Vitesse** | Ajuster la vitesse de lecture (0,25× – 4×) |
| **Recherche** | Sauter à n'importe quel point de la timeline |
| **Boucle** | Basculer entre répétition et lecture unique |
| **Ping-Pong** | Lire en avant puis en arrière en boucle |

## Comment Utiliser

1. **Chargez** un modèle animé (GLB, GLTF, FBX, etc.) par glisser-déposer, boîte de dialogue ou collage depuis le presse-papiers
2. **Cliquez** sur le bouton Lecture (▶) dans la barre d'outils pour ouvrir le Lecteur d'Animations
3. **Sélectionnez** un clip d'animation dans le menu déroulant
4. **Contrôlez** la lecture avec les commandes lecture/pause, vitesse, recherche, boucle et ping-pong
5. **Agrandissez** la boîte de dialogue en plein écran pour une vue d'animation dédiée
