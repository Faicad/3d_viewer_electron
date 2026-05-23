export interface HdrPreset {
  id: string
  label: string
  /** Poly Haven slug used to build CDN URLs */
  slug: string
  /** Optional local path (served from public/) — takes priority over CDN */
  localPath?: string
}

const CDN_BASE = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr'

export function getPresetUrl(preset: HdrPreset, use4k: boolean): string {
  if (import.meta.env.DEV && preset.localPath) return preset.localPath
  const res = use4k ? '4k' : '2k'
  return `${CDN_BASE}/${res}/${preset.slug}_${res}.hdr`
}

export const HDR_PRESETS: HdrPreset[] = [
  { id: 'studio',             label: 'Procedural Studio',    slug: '' },
  { id: 'studio_small_08',    label: 'Soft Light',           slug: 'studio_small_08', localPath: '/env/studio_small_08_2k.hdr' },
  { id: 'empty_warehouse_01', label: 'Neutral Industrial',   slug: 'empty_warehouse_01', localPath: '/env/empty_warehouse_01_2k.hdr' },
]
