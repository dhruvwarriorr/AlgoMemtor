// Judges report compiler builds ("C++23 (GCC 14-64, msys2)", "PyPy 3-64",
// "Java 21 64bit"). Learners think in languages, so every language breakdown
// groups builds under one family name.
const languageFamilies: readonly (readonly [RegExp, string])[] = [
  [/c\+\+|\bcpp\b|g\+\+|clang\+\+|\bgnu c\+\+|\bms c\+\+/i, 'C++'],
  [/c#|\bcsharp\b|\bmono\b|\.net\b/i, 'C#'],
  [/\bpypy|\bpython|\bpy[23]?\b|\bcpython\b/i, 'Python'],
  [/\bkotlin\b/i, 'Kotlin'],
  [/\bjavascript\b|\bnode(?:\.?js)?\b|\bjs\b|\bv8\b/i, 'JavaScript'],
  [/\btypescript\b|\bts\b/i, 'TypeScript'],
  [/\bjava\b|\bjava\s*\d|\bjava\d/i, 'Java'],
  [/\brust\b/i, 'Rust'],
  [/\bgo(?:lang)?\b/i, 'Go'],
  [/\bruby\b/i, 'Ruby'],
  [/\bswift\b/i, 'Swift'],
  [/\bscala\b/i, 'Scala'],
  [/\bhaskell\b/i, 'Haskell'],
  [/\bpascal\b|\bdelphi\b|\bfpc\b/i, 'Pascal'],
  [/\bphp\b/i, 'PHP'],
  [/\bperl\b/i, 'Perl'],
  [/\bdart\b/i, 'Dart'],
  [/\bocaml\b/i, 'OCaml'],
  [/^(?:gnu\s+)?c(?:\s*\d{2})?\b|\bgnu c\d*\b|\bclang c\b|\bansi c\b/i, 'C'],
]

export function programmingLanguageFamily(language: string): string {
  const value = language.trim()
  if (value === '') return 'Other'
  for (const [pattern, family] of languageFamilies) {
    if (pattern.test(value)) return family
  }
  return value.length > 40 ? `${value.slice(0, 39)}…` : value
}

// Sums per-build counts into per-language counts.
export function languageFamilyCounts(
  counts: Readonly<Record<string, number>>,
): Record<string, number> {
  const families: Record<string, number> = {}
  for (const [language, count] of Object.entries(counts)) {
    if (!Number.isFinite(count) || count <= 0) continue
    const family = programmingLanguageFamily(language)
    families[family] = (families[family] ?? 0) + count
  }
  return families
}
