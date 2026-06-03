export interface FileMeta {
  '3mf'?: {
    entries: Array<{ name: string; value: string }>
  }

  'glb'?: {
    generator?: string
    version?: string
    minVersion?: string
    copyright?: string
  }

  'step'?: {
    name?: string
    time_stamp?: string
    author?: string
    organization?: string
    preprocessor_version?: string
    originating_system?: string
    authorization?: string
    file_description?: string
    implementation_level?: string
    file_schema?: string
  }
}
