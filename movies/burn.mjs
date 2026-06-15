import { pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { burnVideo } from './lib.mjs'

const scriptPath = process.argv[2]
if (!scriptPath) {
  console.error('Usage: node movies/burn.mjs <script.mjs>')
  process.exit(1)
}

const absPath = join(process.cwd(), scriptPath)
const scriptUrl = pathToFileURL(absPath).href
const genDir = join(dirname(absPath), 'gen')

burnVideo(scriptUrl, genDir)