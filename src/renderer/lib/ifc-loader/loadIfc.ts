import * as THREE from 'three'
import type { UnitSystem } from '@/config/file-formats'

export interface IfcLoadResult {
  meshes: THREE.Mesh[]
  objects: THREE.Object3D[]
  sceneRoot?: THREE.Group
  sourceUnit?: UnitSystem
}

let ifcModule: Promise<typeof import('web-ifc')> | null = null

async function getIfcAPI(): Promise<InstanceType<typeof import('web-ifc').IfcAPI>> {
  if (!ifcModule) {
    ifcModule = import('web-ifc')
  }
  const webIfc = await ifcModule
  const ifc = new webIfc.IfcAPI()
  const isNode = typeof process !== 'undefined' && process.versions?.node
  await ifc.Init(isNode ? undefined : (path: string) => '/wasm/' + path)
  return ifc
}

function getLengthUnit(ifc: any, modelID: number): UnitSystem {
  try {
    const projectIDs = ifc.GetLineIDsWithType(modelID, 103090709)
    if (projectIDs.size() === 0) return 'millimeter'

    const project = ifc.GetLine(modelID, projectIDs.get(0))
    const unitAssignmentID = project.UnitsInContext?.value
    if (!unitAssignmentID) return 'millimeter'

    const unitAssignment = ifc.GetLine(modelID, unitAssignmentID)
    const units = unitAssignment.Units || []
    for (const unitRef of units) {
      const unit = ifc.GetLine(modelID, unitRef.value)
      if (unit.UnitType?.value === 'LENGTHUNIT') {
        const prefix = unit.Prefix?.value
        const name = unit.Name?.value
        if (prefix === 'MILLI' && name === 'METRE') return 'millimeter'
        if (name === 'METRE') return 'meter'
        if (prefix === 'CENTI' && name === 'METRE') return 'centimeter'
        if (name === 'FOOT') return 'foot'
        if (name === 'INCH') return 'inch'
        return 'millimeter'
      }
    }
  } catch { /* unit not found, use default */ }
  return 'millimeter'
}

export async function loadIfcAsMeshes(
  buffer: ArrayBuffer,
  options?: { coordinateToOrigin?: boolean },
): Promise<IfcLoadResult> {
  const ifc = await getIfcAPI()

  const modelID = ifc.OpenModel(new Uint8Array(buffer), {
    COORDINATE_TO_ORIGIN: options?.coordinateToOrigin ?? true,
  })

  const sourceUnit = getLengthUnit(ifc, modelID)

  const group = new THREE.Group()
  const meshes: THREE.Mesh[] = []
  const colorToMat = new Map<string, THREE.Material>()

  const ifcMeshes = ifc.LoadAllGeometry(modelID)
  for (let i = 0; i < ifcMeshes.size(); i++) {
    const flatMesh = ifcMeshes.get(i)
    const geometries = flatMesh.geometries

    for (let j = 0; j < geometries.size(); j++) {
      const placedGeo = geometries.get(j)
      const data = ifc.GetGeometry(modelID, placedGeo.geometryExpressID)
      const vertices = ifc.GetVertexArray(data.GetVertexData(), data.GetVertexDataSize())
      const indices = ifc.GetIndexArray(data.GetIndexData(), data.GetIndexDataSize())

      if (vertices.length === 0) continue

      const vertCount = vertices.length / 6
      const positions = new Float32Array(vertCount * 3)
      for (let k = 0; k < vertCount; k++) {
        positions[k * 3] = vertices[k * 6]
        positions[k * 3 + 1] = vertices[k * 6 + 1]
        positions[k * 3 + 2] = vertices[k * 6 + 2]
      }

      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geom.setIndex(new THREE.BufferAttribute(indices.slice(), 1))

      const matrix = new THREE.Matrix4().fromArray(placedGeo.flatTransformation)
      geom.applyMatrix4(matrix)
      geom.computeVertexNormals()

      const c = placedGeo.color
      const key = `${c.x.toFixed(4)}_${c.y.toFixed(4)}_${c.z.toFixed(4)}_${c.w.toFixed(4)}`
      if (!colorToMat.has(key)) {
        colorToMat.set(
          key,
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(c.x, c.y, c.z),
            transparent: c.w < 1,
            opacity: c.w,
            roughness: 0.6,
            metalness: 0.1,
          }),
        )
      }

      const mesh = new THREE.Mesh(geom, colorToMat.get(key)!)
      const name = `IFC-${flatMesh.expressID}`
      mesh.name = name
      mesh.userData.expressID = flatMesh.expressID
      meshes.push(mesh)
      group.add(mesh)
    }
  }

  ifc.CloseModel(modelID)

  return { meshes, objects: [], sceneRoot: group, sourceUnit }
}
