import { loadOcct, type OcctModule, type OcctMesh, type OcctNode } from '@/lib/step-converter/occtLoader'
import { buildGlbFromResult, type StepToGlbOptions } from '@/lib/step-converter/stepToGlb'
import { parseFcstd } from './fcstdParser'
import type { FreeCadDocument, FreeCadObject } from './fcstdTypes'

interface OcctImportResult {
  success: boolean
  root: OcctNode
  meshes: OcctMesh[]
}

const COLORS = [
  [0.7, 0.7, 0.7],
  [0.4, 0.6, 0.9],
  [0.9, 0.5, 0.3],
  [0.5, 0.8, 0.4],
  [0.8, 0.4, 0.7],
  [0.4, 0.7, 0.8],
  [0.9, 0.7, 0.3],
  [0.6, 0.5, 0.8],
]

function getColorForObject(
  obj: FreeCadObject,
  index: number,
): [number, number, number] {
  if (obj.color) {
    return [obj.color[0] / 255, obj.color[1] / 255, obj.color[2] / 255]
  }
  return COLORS[index % COLORS.length] as [number, number, number]
}

function mergeResults(
  objects: FreeCadObject[],
  results: OcctImportResult[],
): OcctImportResult {
  const mergedMeshes: OcctMesh[] = []
  const rootNode: OcctNode = { name: 'FCStd', meshes: [], children: [] }

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i]
    const result = results[i]
    if (!result.success || result.meshes.length === 0) continue

    const meshIndices: number[] = []
    const color = getColorForObject(obj, i)

    for (const mesh of result.meshes) {
      const meshWithColor: OcctMesh = {
        ...mesh,
        color: mesh.color ?? color,
      }
      meshIndices.push(mergedMeshes.length)
      mergedMeshes.push(meshWithColor)
    }

    rootNode.children.push({
      name: obj.label ?? obj.name,
      meshes: meshIndices,
      children: [],
    })
  }

  return { success: true, root: rootNode, meshes: mergedMeshes }
}

export async function fcstdToGlb(
  fcstdBuffer: ArrayBuffer,
  options: StepToGlbOptions = {},
): Promise<{ buffer: ArrayBuffer; doc: FreeCadDocument }> {
  const doc = parseFcstd(fcstdBuffer)

  const convertible = doc.objects.filter(
    obj => obj.brepContent !== null && obj.isVisible && obj.inLinkCount === 0,
  )
  if (convertible.length === 0) {
    throw new Error('No convertible objects found in FCStd file')
  }

  const occt: Pick<OcctModule, 'ReadStepFile' | 'ReadIgesFile' | 'ReadBrepFile'> =
    await loadOcct({ wasmPath: options.wasmPath })

  const results: OcctImportResult[] = []
  for (const obj of convertible) {
    const result = occt.ReadBrepFile(obj.brepContent!, null) as unknown as OcctImportResult
    results.push(result)
  }

  const merged = mergeResults(convertible, results)

  const buffer = buildGlbFromResult(merged, options)
  return { buffer, doc }
}
