export interface HdrPreset {
  id: string
  label: string
  /** Poly Haven slug used to build CDN URLs (fallback only) */
  slug: string
  /** Local path served from public/env/ — preferred over CDN */
  localPath?: string
}

const CDN_BASE = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr'

export function getPresetUrl(preset: HdrPreset): string {
  if (preset.localPath) return preset.localPath
  // CDN fallback for presets without local files
  return `${CDN_BASE}/2k/${preset.slug}_2k.hdr`
}

export const HDR_PRESETS: HdrPreset[] = [
  { id: 'studio',             label: 'Procedural Studio',    slug: '' },
  { id: 'studio_small_08',    label: 'Soft Light',           slug: 'studio_small_08', localPath: './env/studio_small_08_2k.hdr' },
  { id: 'empty_warehouse_01', label: 'Neutral Industrial',   slug: 'empty_warehouse_01', localPath: './env/empty_warehouse_01_2k.hdr' },
]
