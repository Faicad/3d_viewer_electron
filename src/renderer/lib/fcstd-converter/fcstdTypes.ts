export interface FreeCadObject {
  name: string
  type: string
  label: string | null
  isVisible: boolean
  color: [number, number, number, number] | null
  inLinkCount: number
  brepFileName: string | null
  brepContent: Uint8Array | null
  properties: Record<string, PropertyValue> | null
}

export interface FreeCadDocument {
  files: Record<string, Uint8Array>
  objects: FreeCadObject[]
  properties: Record<string, PropertyValue> | null
}

export type PropertyValue =
  | { type: 'bool'; value: boolean }
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'uuid'; value: string }
