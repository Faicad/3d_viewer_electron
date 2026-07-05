import * as THREE from 'three'
import type { ZebraColorScheme, ZebraMappingMode } from '@/stores/zebra-store'

export interface ZebraParams {
  stripeCount: number
  stripeOpacity: number
  stripeDirection: number
  colorScheme: ZebraColorScheme
  mappingMode: ZebraMappingMode
}

export function createZebraTexture(
  count: number,
  scheme: ZebraColorScheme,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 4096
  const ctx = canvas.getContext('2d')!

  const isOddCount = count % 2 === 1
  const totalStripeUnits = isOddCount ? count - 1 : count
  const stripeHeight = canvas.height / totalStripeUnits

  let currentY = 0

  for (let i = 0; i < count; i++) {
    let color1: string, color2: string

    switch (scheme) {
      case 'blackwhite':
        color1 = '#000000'
        color2 = '#ffffff'
        break
      case 'colorful': {
        let hue: number
        if (isOddCount && i === count - 1) {
          hue = 0
        } else {
          const divisions = isOddCount ? count - 1 : count
          hue = (i / divisions) * 360
        }
        color1 = `hsl(${hue}, 100%, 50%)`
        color2 = `hsl(${(hue + 180) % 360}, 100%, 50%)`
        break
      }
      case 'grayscale':
        color1 = '#D2D2D2'
        color2 = '#464646'
        break
    }

    const height =
      isOddCount && (i === 0 || i === count - 1)
        ? stripeHeight * 0.5
        : stripeHeight

    ctx.fillStyle = i % 2 === 0 ? color1 : color2
    ctx.fillRect(0, currentY, canvas.width, height)
    currentY += height
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

export function createZebraMaterial(
  texture: THREE.CanvasTexture,
  direction: number,
  opacity: number,
  baseColor: THREE.Color,
  mappingMode: ZebraMappingMode,
): THREE.ShaderMaterial {
  const angle = (direction * Math.PI) / 180
  const dirVec = new THREE.Vector3(
    Math.cos(angle),
    Math.sin(angle),
    0,
  ).normalize()

  return new THREE.ShaderMaterial({
    uniforms: {
      zebraTexture: { value: texture },
      direction: { value: dirVec },
      opacity: { value: opacity },
      baseColor: { value: baseColor.clone() },
      mappingMode: { value: mappingMode === 'reflection' ? 0 : 1 },
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      varying vec4 vScreenPosition;

      void main() {
        vViewNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        vScreenPosition = gl_Position;
      }
    `,
    fragmentShader: `
      uniform sampler2D zebraTexture;
      uniform vec3 direction;
      uniform float opacity;
      uniform vec3 baseColor;
      uniform int mappingMode;

      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      varying vec4 vScreenPosition;

      void main() {
        vec3 normal = normalize(vViewNormal);

        float v;

        if (mappingMode == 0) {
          vec3 viewDir = normalize(-vViewPosition);
          vec3 mappingVector = reflect(-viewDir, normal);
          v = dot(mappingVector, direction) * 3.0 * 0.5 + 0.5;
        } else {
          float dist = length(vViewPosition);
          vec2 viewDir2D = vViewPosition.xy / dist;

          float cosA = direction.x / length(direction.xy);
          float sinA = direction.y / length(direction.xy);
          float rotatedPos = viewDir2D.x * cosA + viewDir2D.y * sinA;

          float positionValue = rotatedPos * 2.0;
          float normalValue = dot(normal, direction) * 0.5;

          v = (positionValue + normalValue) * 3.0 * 0.5 + 0.5;
        }

        vec4 zebraColor = texture2D(zebraTexture, vec2(0.5, v));
        vec3 finalColor = mix(baseColor, zebraColor.rgb, opacity);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

const INTERNAL_TAG = '_zebraInternal'

function shouldSkipSceneObject(obj: THREE.Object3D): boolean {
  if (!obj.visible) return true
  if (obj.userData[INTERNAL_TAG]) return true
  if (!(obj instanceof THREE.Mesh)) return true
  if (obj.name === 'shadowFloor') return true
  if (obj.parent?.name === 'shadowFloor') return true
  if (obj.material instanceof THREE.ShadowMaterial) return true
  if (obj.name === 'heatbed-plane' || obj.name === 'heatbed-grid') return true
  if (obj.renderOrder === 1 && !obj.visible) return true
  if (obj.renderOrder >= 2 && obj.renderOrder <= 5) return true
  if (obj.renderOrder === 6) return true
  if (obj.renderOrder === 999) return true
  return false
}

export function collectSceneMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const result: THREE.Mesh[] = []
  scene.traverse((obj) => {
    if (shouldSkipSceneObject(obj)) return
    result.push(obj as THREE.Mesh)
  })
  return result
}

export function applyZebraToMeshes(
  meshes: THREE.Mesh[],
  originalMap: Map<string, THREE.Material>,
  texture: THREE.CanvasTexture,
  params: ZebraParams,
): Map<string, THREE.ShaderMaterial> {
  const zebraMaterials = new Map<string, THREE.ShaderMaterial>()

  for (const mesh of meshes) {
    const currentMaterial = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material

    if (!originalMap.has(mesh.uuid)) {
      originalMap.set(mesh.uuid, currentMaterial)
    }

    let baseColor = new THREE.Color(0.7, 0.7, 0.7)
    if (currentMaterial && 'color' in currentMaterial) {
      baseColor = (currentMaterial as THREE.MeshStandardMaterial).color.clone()
    }

    const zebraMat = createZebraMaterial(
      texture,
      params.stripeDirection,
      params.stripeOpacity,
      baseColor,
      params.mappingMode,
    )
    zebraMaterials.set(mesh.uuid, zebraMat)
    mesh.material = zebraMat
  }

  return zebraMaterials
}

export function updateZebraTexture(
  zebraMaterials: Map<string, THREE.ShaderMaterial>,
  texture: THREE.CanvasTexture,
): void {
  zebraMaterials.forEach((material) => {
    material.uniforms.zebraTexture.value = texture
    material.uniforms.zebraTexture.value.needsUpdate = true
    material.uniformsNeedUpdate = true
    material.needsUpdate = true
  })
}

export function updateZebraDirection(
  zebraMaterials: Map<string, THREE.ShaderMaterial>,
  direction: number,
): void {
  const angle = (direction * Math.PI) / 180
  const dirVec = new THREE.Vector3(
    Math.cos(angle),
    Math.sin(angle),
    0,
  ).normalize()
  zebraMaterials.forEach((material) => {
    material.uniforms.direction.value = dirVec
  })
}

export function updateZebraOpacity(
  zebraMaterials: Map<string, THREE.ShaderMaterial>,
  opacity: number,
): void {
  zebraMaterials.forEach((material) => {
    material.uniforms.opacity.value = opacity
  })
}

export function updateZebraMappingMode(
  zebraMaterials: Map<string, THREE.ShaderMaterial>,
  mode: ZebraMappingMode,
): void {
  const value = mode === 'reflection' ? 0 : 1
  zebraMaterials.forEach((material) => {
    material.uniforms.mappingMode.value = value
    material.uniformsNeedUpdate = true
    material.needsUpdate = true
  })
}

export function restoreMeshes(
  meshes: THREE.Mesh[],
  originalMap: Map<string, THREE.Material>,
): void {
  for (const mesh of meshes) {
    const original = originalMap.get(mesh.uuid)
    if (original) {
      mesh.material = original
    }
  }
}

export function disposeZebra(
  originalMap: Map<string, THREE.Material>,
  zebraMaterials: Map<string, THREE.ShaderMaterial>,
  texture?: THREE.CanvasTexture | null,
): void {
  zebraMaterials.forEach((material) => {
    material.dispose()
  })
  if (texture) {
    texture.dispose()
  }
  originalMap.clear()
  zebraMaterials.clear()
}
