import * as THREE from 'three'
import type { DraftColorMap } from '@/stores/draft-analysis-store'

export interface DraftParams {
  pullDirection: [number, number, number]
  draftAnglePos: number
  draftAngleNeg: number
  draftTolPos: number
  draftTolNeg: number
  shading: number
  colors: DraftColorMap
}

const _DEG = Math.PI / 180

export function computeAngles(
  draftAnglePos: number,
  draftAngleNeg: number,
  draftTolPos: number,
  draftTolNeg: number,
): number[] {
  return [
    0,
    90 - draftAnglePos - draftTolPos,
    90 - draftAnglePos,
    90,
    90 + draftAngleNeg,
    90 + draftAngleNeg + draftTolNeg,
    180,
  ]
}

function computeColorsArray(colors: DraftColorMap): number[][] {
  return [
    colors.outOfDraftPos,
    colors.inDraftPos,
    colors.inTolerancePos,
    colors.outOfDraftPos,
    colors.inDraftNeg,
    colors.inToleranceNeg,
    colors.outOfDraftNeg,
    colors.outOfDraftNeg,
  ]
}

export function createDraftMaterial(params: DraftParams): THREE.ShaderMaterial {
  const angles = computeAngles(
    params.draftAnglePos,
    params.draftAngleNeg,
    params.draftTolPos,
    params.draftTolNeg,
  )
  const colorsArr = computeColorsArray(params.colors)
  const dirVec = new THREE.Vector3(...params.pullDirection).normalize()

  return new THREE.ShaderMaterial({
    uniforms: {
      pullDirection: { value: dirVec },
      angles: { value: angles.map((a) => (a * Math.PI) / 180) },
      colors: { value: colorsArr.map((c) => new THREE.Color(c[0], c[1], c[2])) },
      shading: { value: params.shading },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      #define PI 3.1415926538

      varying vec3 vNormal;
      varying vec3 vViewPosition;

      uniform vec3 pullDirection;
      uniform float angles[7];
      uniform vec3 colors[8];
      uniform float shading;

      void pickColor(in float t, in float tol, inout vec3 color) {
        for (int i = 0; i < 6; i++) {
          if ((t >= (angles[i] + tol)) && (t <= (angles[i+1] - tol))) {
            color = colors[i + 1];
            return;
          }
        }
        for (int i = 0; i < 6; i++) {
          float diff = t - angles[i];
          if (abs(diff) >= tol) continue;
          float rel = 0.5 * (1.0 + (diff / tol));
          color = rel * colors[i + 1] + (1.0 - rel) * colors[i];
          return;
        }
        color = colors[6];
      }

      void main() {
        vec3 color = colors[0];
        vec3 norm = normalize(vNormal);
        vec3 dir = normalize(pullDirection);
        float nDotDir = dot(norm, dir);
        float angle = acos(clamp(nDotDir, -1.0, 1.0));

        pickColor(angle, 1e-3, color);

        vec3 viewDir = normalize(vViewPosition);
        float diff = dot(norm, dir);
        vec3 diffuse = 0.5 * (1.0 + diff) * color;
        vec3 reflectDir = reflect(-dir, norm);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
        vec3 specular = 0.5 * spec * vec3(1.0);

        vec3 lit = diffuse + specular;
        gl_FragColor = vec4(mix(color, lit, shading), 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

export function collectSceneMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const result: THREE.Mesh[] = []
  scene.traverse((obj) => {
    if (shouldSkipSceneObject(obj)) return
    result.push(obj as THREE.Mesh)
  })
  return result
}

function shouldSkipSceneObject(obj: THREE.Object3D): boolean {
  if (!obj.visible) return true
  if (obj.userData['_zebraInternal']) return true
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

export function applyDraftToMeshes(
  meshes: THREE.Mesh[],
  originalMap: Map<string, THREE.Material>,
  params: DraftParams,
): Map<string, THREE.ShaderMaterial> {
  const draftMaterials = new Map<string, THREE.ShaderMaterial>()

  for (const mesh of meshes) {
    const currentMaterial = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material

    if (!originalMap.has(mesh.uuid)) {
      originalMap.set(mesh.uuid, currentMaterial)
    }

    const draftMat = createDraftMaterial(params)
    draftMaterials.set(mesh.uuid, draftMat)
    mesh.material = draftMat
  }

  return draftMaterials
}

export function updateDraftUniforms(
  draftMaterials: Map<string, THREE.ShaderMaterial>,
  params: DraftParams,
): void {
  const angles = computeAngles(
    params.draftAnglePos,
    params.draftAngleNeg,
    params.draftTolPos,
    params.draftTolNeg,
  )
  const anglesRad = angles.map((a) => (a * Math.PI) / 180)
  const colorsArr = computeColorsArray(params.colors)
  const dirVec = new THREE.Vector3(...params.pullDirection).normalize()

  draftMaterials.forEach((material) => {
    material.uniforms.pullDirection.value.copy(dirVec)
    for (let i = 0; i < 7; i++) {
      material.uniforms.angles.value[i] = anglesRad[i]
    }
    for (let i = 0; i < 8; i++) {
      const c = colorsArr[i]
      material.uniforms.colors.value[i].set(c[0], c[1], c[2])
    }
    material.uniforms.shading.value = params.shading
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

export function disposeDraft(
  originalMap: Map<string, THREE.Material>,
  draftMaterials: Map<string, THREE.ShaderMaterial>,
): void {
  draftMaterials.forEach((material) => {
    material.dispose()
  })
  originalMap.clear()
  draftMaterials.clear()
}
