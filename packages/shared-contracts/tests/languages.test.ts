import { describe, expect, it } from 'vitest'

import {
  languageFamilyCounts,
  programmingLanguageFamily,
} from '../src/index.js'

describe('programmingLanguageFamily', () => {
  it.each([
    ['C++23 (GCC 14-64, msys2)', 'C++'],
    ['C++20 (GCC 13-64)', 'C++'],
    ['C++17 (GCC 7-32)', 'C++'],
    ['GNU G++17 7.3.0', 'C++'],
    ['Clang++20 Diagnostics', 'C++'],
    ['cpp', 'C++'],
    ['C++', 'C++'],
    ['PyPy 3-64', 'Python'],
    ['PyPy 2', 'Python'],
    ['Python 3', 'Python'],
    ['python3', 'Python'],
    ['PYTH 3.6', 'PYTH 3.6'],
    ['Java 21 64bit', 'Java'],
    ['Java 8', 'Java'],
    ['JAVA', 'Java'],
    ['Kotlin 1.9', 'Kotlin'],
    ['JavaScript V8 4.8.0', 'JavaScript'],
    ['Node.js 15.8.0 (64bit)', 'JavaScript'],
    ['GNU C11', 'C'],
    ['C', 'C'],
    ['C# 10, .NET SDK 6.0', 'C#'],
    ['Go 1.22.2', 'Go'],
    ['golang', 'Go'],
    ['Rust 1.75.0 (2021)', 'Rust'],
  ])('maps %s to %s', (language, family) => {
    expect(programmingLanguageFamily(language)).toBe(family)
  })

  it('sums compiler builds into one language', () => {
    expect(
      languageFamilyCounts({
        'C++23 (GCC 14-64, msys2)': 463,
        'C++': 378,
        'C++20 (GCC 13-64)': 225,
        'PyPy 3-64': 2,
        'Python 3': 1,
        'GNU C11': 2,
      }),
    ).toEqual({ 'C++': 1066, Python: 3, C: 2 })
  })
})
