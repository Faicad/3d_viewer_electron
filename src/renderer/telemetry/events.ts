export interface TelemetryEvent {
  event: string
  distinct_id: string
  properties: Record<string, unknown>
  timestamp: string | number
}

export const EventName = {
  APP_START: 'app_start',
  FILE_LOAD_START: 'file_load_start',
  FILE_LOAD_END: 'file_load_end',
  FILE_LOAD_ERROR: 'file_load_error',
  FILE_REMOVE: 'file_remove',
  FILE_EXPORT: 'file_export',
  FILE_EXPORT_ERROR: 'file_export_error',
  MATERIAL_EDIT: 'material_edit',
  ENV_CHANGE: 'env_change',
  ANIMATION_PLAY: 'animation_play',
  SCREENSHOT: 'screenshot',
  VIEW_MODE_CHANGE: 'view_mode_change',
  ERROR_CAUGHT: 'error_caught',
  ERROR_UNHANDLED: 'error_unhandled',
} as const
