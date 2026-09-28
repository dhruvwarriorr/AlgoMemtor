// The Test Case Visualizer runs Python with Pyodide inside a Web Worker. Its
// runtime files are served from this app's own origin under a versioned path
// (public/pyodide/<version>/), never from a third-party CDN. Runs before
// `next dev` and `next build`; the copies are not committed.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const pyodideDir = path.dirname(require.resolve('pyodide/package.json'))
const { version } = JSON.parse(
  readFileSync(path.join(pyodideDir, 'package.json'), 'utf8'),
)
const root = path.join(import.meta.dirname, '..', 'public', 'pyodide')
const target = path.join(root, version)
const files = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

if (!files.every((file) => existsSync(path.join(target, file)))) {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const file of files) {
    cpSync(path.join(pyodideDir, file), path.join(target, file))
  }
  console.log(`Copied Pyodide ${version} runtime to public/pyodide/${version}/`)
}
