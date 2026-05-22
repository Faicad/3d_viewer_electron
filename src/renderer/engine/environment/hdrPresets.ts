/**
 * Poly Haven HDR environment presets.
 *
 * Each preset references a Poly Haven HDR asset available at 2K / 4K
 * resolutions via the public CDN.  The `"studio"` sentinel maps to the
 * procedural CleanRoomEnvironment (Tier 1) and is listed first so it
 * acts as the zero-network default.
 */

export interface HdrPreset {
  id: string
  label: string
  /** Poly Haven slug used to build CDN URLs */
  slug: string
}

const CDN_BASE = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr'

export function getPresetUrl(preset: HdrPreset, use4k: boolean): string {
  const res = use4k ? '4k' : '2k'
  return `${CDN_BASE}/${res}/${preset.slug}_${res}.hdr`
}

/**
 * Presets are ordered so that studio / neutral environments come first
 * and more dramatic outdoor / coloured environments come later.
 */
export const HDR_PRESETS: HdrPreset[] = [
  { id: 'studio',           label: 'Studio (Procedural)', slug: '' },   // Tier-1 sentinel
  { id: 'studio_small_08',  label: 'Studio Small 08',    slug: 'studio_small_08' },
  { id: 'studio_small_03',  label: 'Studio Small 03',    slug: 'studio_small_03' },
  { id: 'white_studio_05',  label: 'White Studio 05',    slug: 'white_studio_05' },
  { id: 'neutral_02',       label: 'Neutral 02',         slug: 'neutral_02' },
  { id: 'industrial_02',    label: 'Industrial 02',      slug: 'industrial_02' },
  { id: 'symmetrical_01',   label: 'Symmetrical 01',     slug: 'symmetrical_01' },
  { id: 'overcast_01',      label: 'Overcast 01',        slug: 'overcast_01' },
  { id: 'sunset_02',        label: 'Sunset 02',          slug: 'sunset_02' },
  { id: 'night_01',         label: 'Night 01',           slug: 'night_01' },
  { id: 'outdoor_01',       label: 'Outdoor 01',         slug: 'outdoor_01' },
]
