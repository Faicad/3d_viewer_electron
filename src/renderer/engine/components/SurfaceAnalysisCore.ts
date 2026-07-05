import * as THREE from 'three'
import type { CurvesAnalysisMode } from '@/stores/surface-analysis-store'

export interface SurfaceAnalysisParams {
  mode: CurvesAnalysisMode
  analysisDirection: [number, number, number]
  fixedDirection: boolean
  stripesNumber: number
  stripesRatio: number
  color1: [number, number, number]
  color2: [number, number, number]
  shading: number
  rainbowAngle1: number
  rainbowAngle2: number
  isoAngles: number[]
  isoTolerance: number
}

const MODE_MAP: Record<CurvesAnalysisMode, number> = {
  zebra: 0,
  rainbow: 1,
  isophote: 2,
}

function buildIsoArray(angles: number[]): number[] {
  const arr = new Array(20).fill(-1)
  for (let i = 0; i < Math.min(angles.length, 20); i++) {
    arr[i] = angles[i]
  }
  return arr
}

export function createSurfaceAnalysisMaterial(
  params: SurfaceAnalysisParams,
): THREE.ShaderMaterial {
  const dirVec = new THREE.Vector3(...params.analysisDirection).normalize()
  const isoArray = buildIsoArray(params.isoAngles)

  return new THREE.ShaderMaterial({
    uniforms: {
      analysisDirection: { value: dirVec },
      fixedDirection: { value: params.fixedDirection ? 1 : 0 },
      mode: { value: MODE_MAP[params.mode] },
      color1: { value: new THREE.Color(...params.color1) },
      color2: { value: new THREE.Color(...params.color2) },
      stripesNumber: { value: params.stripesNumber },
      stripesRatio: { value: params.stripesRatio },
      rainbowAngle1: { value: params.rainbowAngle1 },
      rainbowAngle2: { value: params.rainbowAngle2 },
      isoAngles: { value: isoArray },
      isoTolerance: { value: params.isoTolerance },
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

      uniform vec3 analysisDirection;
      uniform int fixedDirection;
      uniform int mode;
      uniform vec3 color1;
      uniform vec3 color2;
      uniform int stripesNumber;
      uniform float stripesRatio;
      uniform float rainbowAngle1;
      uniform float rainbowAngle2;
      uniform float isoAngles[20];
      uniform float isoTolerance;
      uniform float shading;

      void rainbowColor(in float t, in float t0, in float t1, in int num, inout vec3 color) {
        if (t <= t0) { color = color1; return; }
        if (t >= t1) { color = color2; return; }
        float range = abs(t1 - t0);
        vec3 colors[5];
        colors[0] = vec3(1,0,0);
        colors[1] = vec3(1,1,0);
        colors[2] = vec3(0,1,0);
        colors[3] = vec3(0,1,1);
        colors[4] = vec3(0,0,1);
        float rel = (t - t0) / range;
        float sv = 4.0 * float(num) * rel;
        int idx = int(floor(mod(sv, 4.0)));
        float ratio = mod(sv, 1.0);
        color = colors[idx + 1] * ratio + colors[idx] * (1.0 - ratio);
      }

      void main() {
        vec3 dir;
        if (fixedDirection == 1) {
          dir = normalize((viewMatrix * vec4(analysisDirection, 0.0)).xyz);
        } else {
          dir = normalize(analysisDirection);
        }

        vec3 norm = normalize(vNormal);
        float nDotDir = dot(norm, dir);
        float angle = acos(clamp(nDotDir, -1.0, 1.0)) * 180.0 / PI;

        vec3 color;

        if (mode == 0) {
          float multDot = 0.49999 * float(stripesNumber) * (nDotDir + 0.000001);
          float modulo = mod(multDot, 1.0);
          color = (modulo > stripesRatio) ? color1 : color2;
        } else if (mode == 1) {
          rainbowColor(angle, rainbowAngle1, rainbowAngle2, stripesNumber, color);
        } else {
          color = color1;
          for (int i = 0; i < 20; i++) {
            float a = isoAngles[i];
            if (a > 0.0) {
              float diff = abs(angle - a);
              if (diff < isoTolerance) {
                rainbowColor(angle, isoTolerance, 180.0 - isoTolerance, stripesNumber, color);
              }
            }
          }
        }

        vec3 viewDir = normalize(vViewPosition);
        float diff = max(dot(norm, dir), 0.0);
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

function shouldSkipSceneObject(obj: THREE.Object3D): boolean {
  if (!obj.visible) return true
  if (obj.userData['_zebraInternal']) return true
  if (obj.userData['_surfaceAnalysisInternal']) return true
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

export function applyToMeshes(
  meshes: THREE.Mesh[],
  originalMap: Map<string, THREE.Material>,
  params: SurfaceAnalysisParams,
): Map<string, THREE.ShaderMaterial> {
  const analysisMats = new Map<string, THREE.ShaderMaterial>()

  for (const mesh of meshes) {
    const currentMaterial = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material

    if (!originalMap.has(mesh.uuid)) {
      originalMap.set(mesh.uuid, currentMaterial)
    }

    const mat = createSurfaceAnalysisMaterial(params)
    analysisMats.set(mesh.uuid, mat)
    mesh.material = mat
  }

  return analysisMats
}

export function updateUniforms(
  analysisMats: Map<string, THREE.ShaderMaterial>,
  params: SurfaceAnalysisParams,
): void {
  const dirVec = new THREE.Vector3(...params.analysisDirection).normalize()
  const isoArray = buildIsoArray(params.isoAngles)

  analysisMats.forEach((material) => {
    material.uniforms.analysisDirection.value.copy(dirVec)
    material.uniforms.fixedDirection.value = params.fixedDirection ? 1 : 0
    material.uniforms.mode.value = MODE_MAP[params.mode]
    material.uniforms.color1.value.set(...params.color1)
    material.uniforms.color2.value.set(...params.color2)
    material.uniforms.stripesNumber.value = params.stripesNumber
    material.uniforms.stripesRatio.value = params.stripesRatio
    material.uniforms.rainbowAngle1.value = params.rainbowAngle1
    material.uniforms.rainbowAngle2.value = params.rainbowAngle2
    for (let i = 0; i < 20; i++) {
      material.uniforms.isoAngles.value[i] = isoArray[i]
    }
    material.uniforms.isoTolerance.value = params.isoTolerance
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

export function disposeAnalysis(
  originalMap: Map<string, THREE.Material>,
  analysisMats: Map<string, THREE.ShaderMaterial>,
): void {
  analysisMats.forEach((material) => {
    material.dispose()
  })
  originalMap.clear()
  analysisMats.clear()
}
