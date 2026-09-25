import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'path'

// The Test Case Visualizer runs Python with Pyodide inside a Web Worker. Its
// runtime files are served from this app's own origin under a versioned path,
// never from a third-party CDN.
const require = createRequire(import.meta.url)
const pyodideDir = path.dirname(require.resolve('pyodide/package.json'))
const pyodideVersion = (
  JSON.parse(
    fs.readFileSync(path.join(pyodideDir, 'package.json'), 'utf8'),
  ) as { version: string }
).version
const pyodideBase = `/pyodide/${pyodideVersion}/`
const pyodideFiles: Record<string, string> = {
  'pyodide.asm.mjs': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
}

function pyodideAssets(): Plugin {
  return {
    name: 'algomemtor-pyodide-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0] ?? ''
        if (!url.startsWith(pyodideBase)) {
          next()
          return
        }
        const file = url.slice(pyodideBase.length)
        const type = pyodideFiles[file]
        if (type === undefined) {
          response.statusCode = 404
          response.end()
          return
        }
        response.setHeader('Content-Type', type)
        fs.createReadStream(path.join(pyodideDir, file)).pipe(response)
      })
    },
    generateBundle() {
      for (const file of Object.keys(pyodideFiles)) {
        this.emitFile({
          type: 'asset',
          fileName: `pyodide/${pyodideVersion}/${file}`,
          source: fs.readFileSync(path.join(pyodideDir, file)),
        })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss(), pyodideAssets()],
    define: {
      __PYODIDE_BASE__: JSON.stringify(pyodideBase),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    optimizeDeps: {
      exclude: ['pyodide'],
    },
    worker: {
      format: 'es',
    },
    server: {
      proxy: {
        '/api': {
          target: environment.VITE_CORE_API_URL ?? 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
