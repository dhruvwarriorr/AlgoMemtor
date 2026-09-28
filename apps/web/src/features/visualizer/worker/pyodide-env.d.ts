// The Python tracer is imported as source text (a Turbopack `raw` rule in
// next.config.ts).
declare module '*.py' {
  const source: string
  export default source
}
