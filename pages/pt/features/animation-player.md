# Player de Animação

O Faicad 3D Viewer inclui um player de animação integrado para arquivos glTF que contenham dados de animação. Suporta animações esqueléticas, alvos de morph e controle completo de reprodução.

## Demonstração — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Seu navegador não suporta vídeo incorporado.
</video>

## Reprodução em Tela Cheia

Clique no botão **Maximizar** (⛶) no canto superior direito da caixa de diálogo para entrar no modo tela cheia. A animação preenche toda a janela, removendo toda a interface — ideal para revisão focada e apresentações. Pressione **Esc** ou clique em **Minimizar** para retornar à caixa de diálogo.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Seu navegador não suporta vídeo incorporado.
</video>

## Mais Animações

O modelo de demonstração `RobotExpressive.glb` contém 14 clipes de animação, todos exibidos em modo tela cheia. Estes vídeos são **gerados automaticamente** a partir da aplicação em execução — sem necessidade de gravação manual.

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

## Todos os Clipes Disponíveis

| Clipe | Duração | | Clipe | Duração |
|-------|---------|---|-------|---------|
| Dance | 3,3 s | | Death | 1,0 s |
| Idle | 3,3 s | | Jump | 0,7 s |
| No | 1,7 s | | Punch | 0,8 s |
| Running | 1,0 s | | Sitting | 0,4 s |
| Standing | 0,4 s | | ThumbsUp | 1,6 s |
| Walking | 1,0 s | | WalkJump | 0,8 s |
| Wave | 1,8 s | | Yes | 1,7 s |

## Formatos Suportados

| Formato | Extensões | Tipo de Animação |
|---------|-----------|------------------|
| GLB | `.glb` | Esqueleto + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Esqueleto + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Animação esquelética |
| DAE (Collada) | `.dae` | Esqueleto + Animação de cena |
| BVH | `.bvh` | Captura de movimento esquelético |
| MD2 | `.md2` | Animação de vértices (morph frames) |

## Controles de Reprodução

| Controle | Descrição |
|----------|-----------|
| **Reproduzir / Pausar** | Iniciar ou pausar a animação atual |
| **Velocidade** | Ajustar a velocidade de reprodução (0,25× – 4×) |
| **Buscar** | Pular para qualquer ponto na linha do tempo |
| **Repetir** | Alternar entre repetição e reprodução única |
| **Ping-Pong** | Reproduzir para frente e depois para trás em loop |

## Como Usar

1. **Carregue** um modelo animado (GLB, GLTF, FBX, etc.) via arrastar e soltar, diálogo de arquivo ou colagem da área de transferência
2. **Clique** no botão Reproduzir (▶) na barra de ferramentas para abrir o Player de Animação
3. **Selecione** um clipe de animação no menu suspenso
4. **Controle** a reprodução com os comandos reproduzir/pausar, velocidade, buscar, repetir e ping-pong
5. **Maximize** a caixa de diálogo para tela cheia para uma visualização de animação dedicada
