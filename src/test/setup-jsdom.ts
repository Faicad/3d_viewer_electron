// jsdom environment setup for component tests
// Mocks browser APIs not provided by jsdom

// Mock URL.createObjectURL / revokeObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  // @ts-expect-error jsdom may not implement these
  URL.createObjectURL = () => 'blob:mock'
  // @ts-expect-error jsdom may not implement these
  URL.revokeObjectURL = () => {}
}

// Mock electronAPI
;(window as Record<string, unknown>).electronAPI = {
  readDirectory: async () => [],
  readFileAsBase64: async () => '',
  getFilePath: (file: File) => (file as unknown as { path?: string }).path ?? '',
  getAppVersion: async () => '1.0.0',
  openExternal: async () => {},
}

// Mock env
;(window as Record<string, unknown>).env = { DEV: true, PROD: false }
