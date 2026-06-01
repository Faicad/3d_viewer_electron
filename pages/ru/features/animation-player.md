# Проигрыватель Анимаций

Faicad 3D Viewer включает встроенный проигрыватель анимаций для файлов glTF, содержащих анимационные данные. Поддерживает скелетную анимацию, morph-targets и полное управление воспроизведением.

## Демонстрация — Walking

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking.webm" type="video/webm">
  <source src="/screenshots/animations/Walking.mp4" type="video/mp4">
  Ваш браузер не поддерживает встроенное видео.
</video>

## Полноэкранное Воспроизведение

Нажмите кнопку **Развернуть** (⛶) в правом верхнем углу диалогового окна, чтобы перейти в полноэкранный режим. Анимация заполняет всё окно, удаляя весь интерфейс — идеально для сфокусированного просмотра и презентаций. Нажмите **Esc** или кнопку **Свернуть**, чтобы вернуться к диалогу.

<video autoplay loop muted playsinline controls width="100%">
  <source src="/screenshots/animations/Walking-fullscreen.webm" type="video/webm">
  <source src="/screenshots/animations/Walking-fullscreen.mp4" type="video/mp4">
  Ваш браузер не поддерживает встроенное видео.
</video>

## Больше Анимаций

Демо-модель `RobotExpressive.glb` содержит 14 анимационных клипов, все показаны в полноэкранном режиме. Эти видео **автоматически генерируются** из работающего приложения — без ручной записи.

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

## Все Доступные Клипы

| Клип | Длительность | | Клип | Длительность |
|------|-------------|---|------|-------------|
| Dance | 3,3 с | | Death | 1,0 с |
| Idle | 3,3 с | | Jump | 0,7 с |
| No | 1,7 с | | Punch | 0,8 с |
| Running | 1,0 с | | Sitting | 0,4 с |
| Standing | 0,4 с | | ThumbsUp | 1,6 с |
| Walking | 1,0 с | | WalkJump | 0,8 с |
| Wave | 1,8 с | | Yes | 1,7 с |

## Поддерживаемые Форматы

| Формат | Расширения | Тип Анимации |
|--------|-----------|-------------|
| GLB | `.glb` | Скелетная + Morph Target (glTF 2.0) |
| GLTF | `.gltf` | Скелетная + Morph Target (glTF 2.0) |
| FBX | `.fbx` | Скелетная анимация |
| DAE (Collada) | `.dae` | Скелетная + Сценическая анимация |
| BVH | `.bvh` | Захват движения скелета |
| MD2 | `.md2` | Вершинная анимация (morph frames) |

## Элементы Управления

| Элемент | Описание |
|---------|---------|
| **Воспр. / Пауза** | Запуск или пауза текущей анимации |
| **Скорость** | Регулировка скорости воспроизведения (0,25× – 4×) |
| **Поиск** | Переход к любой точке временной шкалы |
| **Повтор** | Переключение между повтором и однократным воспроизведением |
| **Пинг-понг** | Воспроизведение вперёд, затем назад по циклу |

## Как Использовать

1. **Загрузите** анимированную модель (GLB, GLTF, FBX и т.д.) через drag & drop, диалог выбора файла или вставку из буфера обмена
2. **Нажмите** кнопку Воспроизведения (▶) на панели инструментов, чтобы открыть Проигрыватель Анимаций
3. **Выберите** анимационный клип из выпадающего меню
4. **Управляйте** воспроизведением с помощью кнопок воспр./пауза, скорости, поиска, повтора и пинг-понга
5. **Разверните** диалог на весь экран для выделенного окна просмотра анимации
