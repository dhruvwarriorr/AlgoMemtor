// Path of the self-hosted Pyodide runtime, defined in vite.config.ts.
declare const __PYODIDE_BASE__: string

declare module '*.py?raw' {
  const source: string
  export default source
}
