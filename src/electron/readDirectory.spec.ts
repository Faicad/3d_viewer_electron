import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'

const SUPPORTED_EXTENSIONS = new Set([
  '.stl', '.glb', '.gltf', '.3mf', '.model',
  '.step', '.stp', '.obj', '.ply', '.fbx',
  '.dae', '.3ds', '.usdz', '.drc', '.bvh',
  '.vtk', '.vtp', '.xyz', '.pdb', '.nrrd',
  '.gcode', '.wrl', '.vox', '.kmz', '.amf',
  '.lwo', '.md2', '.pcd', '.svg', '.dxf',
])

type FileEntry = { name: string; path: string; mtimeMs: number }

/** Replicates the IPC handler logic from electron/main/index.ts */
function readDirectory(dirPath: string): { success: boolean; files?: FileEntry[]; error?: string } {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    const files: FileEntry[] = []
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          const fullPath = join(dirPath, entry.name)
          const stat = statSync(fullPath)
          files.push({ name: entry.name, path: fullPath, mtimeMs: stat.mtimeMs })
        }
      }
    }
    return { success: true, files }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** Replicates setFolderFiles comparison logic from model-store.ts */
function areFolderFilesEqual(
  currentFolderPath: string | null,
  folderFiles: FileEntry[],
  newFolderPath: string | null,
  newFiles: FileEntry[],
): boolean {
  if (currentFolderPath !== newFolderPath) return false
  if (folderFiles.length !== newFiles.length) return false
  return folderFiles.every(
    (f, i) => f.path === newFiles[i].path && f.mtimeMs === newFiles[i].mtimeMs,
  )
}

describe('readDirectory with special character paths', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'readdir-test-'))
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('handles paths with Chinese characters, spaces, and parentheses', () => {
    const subDir = join(
      tmpRoot,
      '机械相关开源项目',
      'MK1 3D打印耗材制线机 (废料回收)',
      'Electronic (EL)',
    )
    mkdirSync(subDir, { recursive: true })

    writeFileSync(join(subDir, 'part.stl'), '')
    writeFileSync(join(subDir, 'model.step'), '')
    writeFileSync(join(subDir, 'readme.txt'), 'not a model')
    writeFileSync(join(subDir, '另一个零件.stl'), '')
    writeFileSync(join(subDir, 'component (test).stl'), '')

    const result = readDirectory(subDir)

    expect(result.success).toBe(true)
    expect(result.files).toBeDefined()
    expect(result.files!.length).toBe(4)

    const fileNames = result.files!.map(f => f.name).sort()
    expect(fileNames).toEqual([
      'component (test).stl',
      'model.step',
      'part.stl',
      '另一个零件.stl',
    ])

    for (const file of result.files!) {
      expect(file.path).toContain('Electronic (EL)')
      expect(file.path).toContain('MK1 3D打印耗材制线机 (废料回收)')
      expect(file.path).toContain('机械相关开源项目')
      expect(fs.existsSync(file.path)).toBe(true)
    }
  })

  it('preserves path separators correctly (join with special dir names)', () => {
    const subDir = join(tmpRoot, 'Folder (测试) with spaces')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'model.stl'), '')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)
    expect(result.files!.length).toBe(1)

    const file = result.files![0]
    expect(file.path).toBe(join(subDir, 'model.stl'))
    expect(fs.existsSync(file.path)).toBe(true)
  })

  it('preserves EXACT path characters through join round-trip', () => {
    // Simulate what happens when a path from dialog.showOpenDialog
    // (backslash-separated) is passed to the readDirectory IPC handler
    // which uses path.join(dirPath, entry.name).
    const dirName = 'Electronic (EL)  测试  '
    const subDir = join(tmpRoot, dirName)
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'part.stl'), '')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)
    expect(result.files!.length).toBe(1)
    // join on Windows preserves backslashes
    expect(result.files![0].path).toBe(`${subDir}\\part.stl`)
  })

  it('store comparison handles special character paths correctly', () => {
    const subDir = join(tmpRoot, '测试 (test) dir')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'a.stl'), '')
    writeFileSync(join(subDir, 'b.stl'), '')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)

    // First call should be "not equal" (no previous state)
    expect(areFolderFilesEqual(null, [], subDir, result.files!)).toBe(false)

    // Same path and files should be "equal"
    const sameResult = readDirectory(subDir)
    expect(areFolderFilesEqual(subDir, result.files!, subDir, sameResult.files!)).toBe(true)

    // Different path should be "not equal"
    expect(areFolderFilesEqual('/other/path', result.files!, subDir, sameResult.files!)).toBe(false)
  })

  it('path with only spaces and special characters works', () => {
    const subDir = join(tmpRoot, '   folder with leading space')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'test.stl'), '')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)
    expect(result.files!.length).toBe(1)
    expect(result.files![0].name).toBe('test.stl')
  })

  it('deep nested path with mixed special characters', () => {
    const deepDir = join(
      tmpRoot,
      'level-1 (测试)',
      'level 2 [test]',
      'level{3}_测试',
      '(final) dir with 中文',
    )
    mkdirSync(deepDir, { recursive: true })
    writeFileSync(join(deepDir, 'model.stl'), '')

    const result = readDirectory(deepDir)
    expect(result.success).toBe(true)
    expect(result.files!.length).toBe(1)
    expect(result.files![0].name).toBe('model.stl')

    // Verify the path round-trips correctly: readDirectory result paths
    // can be used directly with fs operations
    expect(fs.existsSync(result.files![0].path)).toBe(true)
  })

  it('Japanese and Korean characters in path', () => {
    const subDir = join(tmpRoot, '日本語テスト', '한국어테스트')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'model.stl'), '')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)
    expect(result.files!.length).toBe(1)
    expect(fs.existsSync(result.files![0].path)).toBe(true)
  })

  it('emoji in directory name', () => {
    const subDir = join(tmpRoot, 'models 📁 test')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'part.stl'), '')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)
    expect(result.files!.length).toBe(1)
    expect(fs.existsSync(result.files![0].path)).toBe(true)
  })

  it('returns error for nonexistent directory', () => {
    const result = readDirectory(join(tmpRoot, 'nonexistent-folder'))
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('directory with only non-model files returns empty list', () => {
    const subDir = join(tmpRoot, 'text-only')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'readme.txt'), 'hello')
    writeFileSync(join(subDir, 'data.csv'), 'a,b,c')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)
    expect(result.files).toBeDefined()
    expect(result.files!.length).toBe(0)
  })

  it('handles files with multiple dots in name', () => {
    const subDir = join(tmpRoot, 'multi-dot')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'test.model.stl'), '')
    writeFileSync(join(subDir, 'backup.2024.step'), '')
    writeFileSync(join(subDir, 'file.stl.bak'), 'not a model')

    const result = readDirectory(subDir)
    expect(result.success).toBe(true)
    expect(result.files!.length).toBe(2)
    const names = result.files!.map(f => f.name).sort()
    expect(names).toEqual(['backup.2024.step', 'test.model.stl'])
  })
})
