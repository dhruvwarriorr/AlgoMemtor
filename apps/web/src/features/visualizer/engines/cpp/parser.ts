// Recursive-descent parser for contest-style C++. Declarations and
// expressions are told apart with a table of known type names (builtins,
// typedefs, structs and template parameters).

import type {
  Declarator,
  Expr,
  FunctionDef,
  Param,
  Program,
  Stmt,
  StructDef,
  StructField,
} from './ast'
import { CppCompileError, type Token } from './lexer'
import { T, type CType } from './types'

const qualifierWords = new Set([
  'const',
  'constexpr',
  'static',
  'inline',
  'volatile',
  'register',
  'mutable',
  'typename',
  'extern',
  'thread_local',
  'consteval',
  'constinit',
])

const fixedTypes: Record<string, CType> = {
  int: T.int,
  char: T.char,
  bool: T.bool,
  float: T.float,
  double: T.double,
  void: T.void,
  auto: T.auto,
  string: T.string,
  size_t: T.ull,
  ssize_t: T.ll,
  int8_t: { k: 'int', bits: 8, unsigned: false },
  int16_t: T.short,
  int32_t: T.int,
  int64_t: T.ll,
  uint8_t: { k: 'int', bits: 8, unsigned: true },
  uint16_t: { k: 'int', bits: 16, unsigned: true },
  uint32_t: T.uint,
  uint64_t: T.ull,
  __int128: { k: 'int', bits: 128, unsigned: false },
  __int128_t: { k: 'int', bits: 128, unsigned: false },
  __uint128_t: { k: 'int', bits: 128, unsigned: true },
  wchar_t: T.int,
  istream: T.stream,
  ostream: T.stream,
}

const integerWords = new Set(['unsigned', 'signed', 'long', 'short'])

const templateTypeWords = new Set([
  'vector',
  'deque',
  'list',
  'stack',
  'queue',
  'priority_queue',
  'pair',
  'tuple',
  'map',
  'multimap',
  'unordered_map',
  'unordered_multimap',
  'set',
  'multiset',
  'unordered_set',
  'unordered_multiset',
  'array',
  'function',
  'greater',
  'less',
  'greater_equal',
  'less_equal',
  'bitset',
])

const assignmentOps = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '<<=',
  '>>=',
  '&=',
  '|=',
  '^=',
])

const binaryPrecedence: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '|': 3,
  '^': 4,
  '&': 5,
  '==': 6,
  '!=': 6,
  '<': 7,
  '>': 7,
  '<=': 7,
  '>=': 7,
  '<<': 8,
  '>>': 8,
  '+': 9,
  '-': 9,
  '*': 10,
  '/': 10,
  '%': 10,
}

// Names treated as template functions when followed by `<`.
const templateFunctionWords = new Set([
  'get',
  'static_cast',
  'dynamic_cast',
  'const_cast',
  'reinterpret_cast',
  'make_pair',
  'make_tuple',
  'max',
  'min',
  'accumulate',
  'numeric_limits',
  'swap',
  'abs',
])

type TypeResult = { type: CType; isStatic: boolean }

export function parseProgram(input: Token[]): Program {
  return new Parser(stripStd(input)).program()
}

// `std::` qualifiers are dropped; everything lives in one namespace here.
function stripStd(tokens: Token[]): Token[] {
  const result: Token[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (
      token.kind === 'ident' &&
      (token.value === 'std' || token.value === '__gnu_cxx') &&
      tokens[i + 1]?.value === '::'
    ) {
      i += 1
      continue
    }
    // Leading global-scope `::name`.
    const previous = tokens[i - 1]
    if (
      token.value === '::' &&
      token.kind === 'punct' &&
      (previous === undefined ||
        (previous.kind !== 'ident' && previous.value !== '>'))
    ) {
      continue
    }
    result.push(token)
  }
  return result
}

class Parser {
  private tokens: Token[]
  private pos = 0
  private aliases = new Map<string, CType>()
  private structNames = new Set<string>()
  private templateParams: Set<string>[] = []
  private readonly functions = new Map<string, FunctionDef[]>()
  private readonly structs = new Map<string, StructDef>()
  private readonly globals: (Stmt & { k: 'decl' })[] = []
  private readonly branches: Program['branches'] = []
  private readonly indexHints = new Map<string, Set<string>>()
  // Inside a struct body: the struct's name, so its constructors parse.
  private currentStruct: string | null = null
  // Integer constants known while parsing, for array<int, N> and bitset<N>.
  private readonly constants = new Map<string, number>()

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  program(): Program {
    while (!this.atEnd()) this.topLevel()
    if (!this.functions.has('main')) {
      throw new CppCompileError(
        'No main() function. Add a main() that reads the input and prints the answer.',
        1,
        undefined,
        true,
      )
    }
    const indexHints: Record<string, string[]> = {}
    for (const [name, values] of this.indexHints) {
      indexHints[name] = [...values]
    }
    return {
      globals: this.globals,
      functions: this.functions,
      structs: this.structs,
      branches: [...this.branches].sort((a, b) => a.line - b.line),
      indexHints,
    }
  }

  // ---- token helpers ------------------------------------------------------

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? (this.tokens.at(-1) as Token)
  }

  private atEnd() {
    return this.peek().kind === 'eof'
  }

  private next(): Token {
    const token = this.peek()
    if (token.kind !== 'eof') this.pos += 1
    return token
  }

  private is(value: string, offset = 0) {
    const token = this.peek(offset)
    return (
      (token.kind === 'punct' || token.kind === 'ident') &&
      token.value === value
    )
  }

  private accept(value: string): boolean {
    if (this.is(value)) {
      this.pos += 1
      return true
    }
    return false
  }

  private expect(value: string, what?: string): Token {
    if (this.is(value)) return this.next()
    // `>>` closing two template lists.
    if (value === '>' && this.is('>>')) {
      const token = this.peek()
      this.tokens[this.pos] = { ...token, value: '>', col: token.col + 1 }
      return { ...token, value: '>' }
    }
    if (value === '>' && this.is('>=')) {
      const token = this.peek()
      this.tokens[this.pos] = { ...token, value: '=', col: token.col + 1 }
      return { ...token, value: '>' }
    }
    this.fail(
      `Expected ${what ?? `'${value}'`} but found ${this.describe(this.peek())}.`,
    )
  }

  private describe(token: Token) {
    if (token.kind === 'eof') return 'the end of the code'
    if (token.kind === 'string') return 'a string'
    return `'${token.value}'`
  }

  private fail(message: string, token = this.peek()): never {
    throw new CppCompileError(message, token.line, token.col)
  }

  private unsupported(message: string, token = this.peek()): never {
    throw new CppCompileError(message, token.line, token.col, true)
  }

  private identifier(what = 'a name'): string {
    const token = this.peek()
    if (token.kind !== 'ident') this.fail(`Expected ${what}.`)
    this.pos += 1
    return token.value
  }

  private lastLine() {
    return this.tokens[Math.max(0, this.pos - 1)]?.line ?? 1
  }

  private text(from: number, to: number): string {
    let result = ''
    for (let i = from; i < to; i += 1) {
      const token = this.tokens[i]
      const value =
        token.kind === 'string'
          ? JSON.stringify(token.value)
          : token.kind === 'char'
            ? `'${token.value.replace('\n', '\\n')}'`
            : token.value
      const previous = this.tokens[i - 1]
      const tight =
        i === from ||
        [',', ';', ')', ']', '.', '->', '++', '--', '::'].includes(value) ||
        ['(', '[', '.', '->', '::', '!', '~'].includes(previous?.value ?? '') ||
        (value === '(' && previous?.kind === 'ident') ||
        (value === '[' && previous?.kind === 'ident')
      result += (tight ? '' : ' ') + value
    }
    return result.length > 120 ? `${result.slice(0, 117)}…` : result
  }

  // ---- types ---------------------------------------------------------------

  private isTypeName(name: string) {
    return (
      name in fixedTypes ||
      integerWords.has(name) ||
      templateTypeWords.has(name) ||
      this.aliases.has(name) ||
      this.structNames.has(name) ||
      this.templateParams.some((scope) => scope.has(name)) ||
      name === 'decltype' ||
      name === 'struct' ||
      name === 'class'
    )
  }

  private looksLikeTypeStart(offset = 0) {
    const token = this.peek(offset)
    if (token.kind !== 'ident') return false
    return qualifierWords.has(token.value) || this.isTypeName(token.value)
  }

  // Parses a type if one starts here; otherwise restores the position.
  private tryType(): TypeResult | null {
    const start = this.pos
    let isStatic = false
    while (
      this.peek().kind === 'ident' &&
      qualifierWords.has(this.peek().value)
    ) {
      if (this.peek().value === 'static') isStatic = true
      this.pos += 1
    }
    const base = this.baseType()
    if (base === null) {
      this.pos = start
      return null
    }
    while (this.accept('const') || this.accept('volatile')) {
      // Trailing qualifiers.
    }
    let type = base
    while (this.is('*')) {
      this.next()
      if (this.is('*')) {
        this.unsupported(
          'Pointers to pointers are not supported by the visualizer yet.',
        )
      }
      type = { k: 'pointer', to: type }
      while (this.accept('const')) {
        // Constant pointers behave the same here.
      }
    }
    return { type, isStatic }
  }

  private type(): CType {
    const result = this.tryType()
    if (result === null) this.fail('Expected a type.')
    return result.type
  }

  private baseType(): CType | null {
    const token = this.peek()
    if (token.kind !== 'ident') return null
    const word = token.value
    if (word === 'struct' || word === 'class') {
      // Elaborated `struct Node x;`
      if (
        this.peek(1).kind === 'ident' &&
        this.structNames.has(this.peek(1).value)
      ) {
        this.pos += 2
        return { k: 'struct', name: this.peek(-1).value }
      }
      return null
    }
    if (integerWords.has(word)) return this.integerType()
    if (word === 'decltype') {
      this.pos += 1
      this.expect('(')
      let depth = 1
      while (depth > 0 && !this.atEnd()) {
        const t = this.next()
        if (t.value === '(') depth += 1
        if (t.value === ')') depth -= 1
      }
      return T.auto
    }
    if (word in fixedTypes) {
      this.pos += 1
      // `long double`, `int` alone, `char` etc.
      return fixedTypes[word]
    }
    if (this.templateParams.some((scope) => scope.has(word))) {
      this.pos += 1
      return T.auto
    }
    const alias = this.aliases.get(word)
    if (alias !== undefined) {
      this.pos += 1
      return this.iteratorSuffix(alias)
    }
    if (this.structNames.has(word)) {
      this.pos += 1
      return { k: 'struct', name: word }
    }
    if (templateTypeWords.has(word)) {
      const functor = [
        'greater',
        'less',
        'greater_equal',
        'less_equal',
      ].includes(word)
      // `int array[5]` names a variable, not std::array.
      if (!this.is('<', 1) && !functor && word !== 'function') return null
      this.pos += 1
      return this.iteratorSuffix(this.templateType(word, token))
    }
    return null
  }

  private integerType(): CType {
    let unsigned = false
    let longs = 0
    let short = false
    let sawInt = false
    let sawChar = false
    let sawDouble = false
    for (;;) {
      const word = this.peek().kind === 'ident' ? this.peek().value : ''
      if (word === 'unsigned') unsigned = true
      else if (word === 'signed') unsigned = false
      else if (word === 'long') longs += 1
      else if (word === 'short') short = true
      else if (word === 'int' && !sawInt) sawInt = true
      else if (word === 'char' && !sawChar) sawChar = true
      else if (word === 'double' && !sawDouble) sawDouble = true
      else if (word === 'const') {
        // `long const`
      } else break
      this.pos += 1
    }
    if (sawDouble) return T.longDouble
    if (sawChar) return unsigned ? T.uchar : T.char
    if (short) return { k: 'int', bits: 16, unsigned }
    if (longs >= 1) return unsigned ? T.ull : T.ll
    return unsigned ? T.uint : T.int
  }

  private iteratorSuffix(type: CType): CType {
    if (this.is('::') && this.peek(1).kind === 'ident') {
      const member = this.peek(1).value
      if (
        [
          'iterator',
          'const_iterator',
          'reverse_iterator',
          'const_reverse_iterator',
        ].includes(member)
      ) {
        this.pos += 2
        return T.iterator
      }
      if (member === 'size_type') {
        this.pos += 2
        return T.ull
      }
      if (member === 'value_type') {
        this.pos += 2
        return T.auto
      }
    }
    return type
  }

  private templateArgs(): (CType | Expr)[] {
    this.expect('<')
    const args: (CType | Expr)[] = []
    if (this.is('>') || this.is('>>')) {
      this.expect('>')
      return args
    }
    do {
      const type = this.looksLikeTypeStart() ? this.tryType() : null
      if (type !== null) {
        let result = type.type
        // function<int(int, int)>
        if (this.is('(')) {
          this.skipBalanced('(', ')')
          result = T.function
        }
        args.push(result)
      } else {
        args.push(this.expression(8))
      }
    } while (this.accept(','))
    this.expect('>')
    return args
  }

  private skipBalanced(open: string, close: string) {
    this.expect(open)
    let depth = 1
    while (depth > 0 && !this.atEnd()) {
      const token = this.next()
      if (token.value === open) depth += 1
      if (token.value === close) depth -= 1
    }
  }

  private templateType(word: string, at: Token): CType {
    const optionalArgs = [
      'greater',
      'less',
      'greater_equal',
      'less_equal',
    ].includes(word)
    if (!this.is('<')) {
      if (optionalArgs) {
        return { k: 'functor', name: word as 'less' }
      }
      if (word === 'function') return T.function
      this.fail(`Expected template arguments after ${word}.`, at)
    }
    const args = this.templateArgs()
    const typeArg = (index: number): CType => {
      const arg = args[index]
      if (arg === undefined || !('k' in arg) || isExpr(arg)) {
        this.fail(`Expected a type argument for ${word}.`, at)
      }
      return arg
    }
    const numberArg = (index: number): number => {
      const arg = args[index]
      const value =
        arg !== undefined && isExpr(arg) ? this.constValue(arg) : null
      if (value === null || value < 0) {
        this.fail(`Expected a constant size for ${word}.`, at)
      }
      return value
    }
    const comparator = (index: number): CType | null => {
      const arg = args[index]
      return arg === undefined || isExpr(arg) ? null : arg
    }
    switch (word) {
      case 'vector':
        return { k: 'vector', elem: typeArg(0) }
      case 'deque':
        return { k: 'deque', elem: typeArg(0) }
      case 'list':
        return { k: 'list', elem: typeArg(0) }
      case 'stack':
        return { k: 'stack', elem: typeArg(0) }
      case 'queue':
        return { k: 'queue', elem: typeArg(0) }
      case 'priority_queue':
        return { k: 'pq', elem: typeArg(0), cmp: comparator(2) }
      case 'pair':
        return { k: 'pair', first: typeArg(0), second: typeArg(1) }
      case 'tuple':
        return { k: 'tuple', items: args.map((_, index) => typeArg(index)) }
      case 'map':
      case 'multimap':
      case 'unordered_map':
      case 'unordered_multimap':
        return {
          k: 'map',
          key: typeArg(0),
          value: typeArg(1),
          ordered: !word.startsWith('unordered'),
          multi: word.includes('multi'),
          cmp: word.startsWith('unordered') ? null : comparator(2),
        }
      case 'set':
      case 'multiset':
      case 'unordered_set':
      case 'unordered_multiset':
        return {
          k: 'set',
          elem: typeArg(0),
          ordered: !word.startsWith('unordered'),
          multi: word.includes('multi'),
          cmp: word.startsWith('unordered') ? null : comparator(1),
        }
      case 'array':
        return { k: 'stdarray', elem: typeArg(0), size: numberArg(1) }
      case 'bitset':
        return { k: 'bitset', size: numberArg(0) }
      case 'function':
        return T.function
      default:
        return { k: 'functor', name: word as 'less' }
    }
  }

  // Folds integer constant expressions (1e5 + 5, N * 2, 1 << 20).
  private constValue(expr: Expr): number | null {
    switch (expr.k) {
      case 'int':
        return Number(expr.value)
      case 'float':
        return Math.trunc(expr.value)
      case 'char':
        return expr.value
      case 'ident':
        return this.constants.get(expr.name) ?? null
      case 'cast':
        return this.constValue(expr.expr)
      case 'unary': {
        const value = this.constValue(expr.operand)
        if (value === null) return null
        return expr.op === '-' ? -value : expr.op === '+' ? value : null
      }
      case 'binary': {
        const left = this.constValue(expr.left)
        const right = this.constValue(expr.right)
        if (left === null || right === null) return null
        switch (expr.op) {
          case '+':
            return left + right
          case '-':
            return left - right
          case '*':
            return left * right
          case '/':
            return right === 0 ? null : Math.trunc(left / right)
          case '%':
            return right === 0 ? null : left % right
          case '<<':
            return left * 2 ** right
          case '>>':
            return Math.floor(left / 2 ** right)
          default:
            return null
        }
      }
      default:
        return null
    }
  }

  // ---- top level -----------------------------------------------------------

  private topLevel() {
    if (this.accept(';')) return
    if (this.is('using')) {
      this.usingDirective()
      return
    }
    if (this.is('typedef')) {
      this.typedef()
      return
    }
    if (this.is('namespace')) {
      this.unsupported('Custom namespaces are not supported by the visualizer.')
    }
    if (this.is('template')) {
      this.templateDeclaration()
      return
    }
    if ((this.is('struct') || this.is('class')) && this.isStructDefinition()) {
      const def = this.structDefinition()
      this.structs.set(def.name, def)
      this.afterStructDefinition(def)
      return
    }
    this.declarationOrFunction()
  }

  private usingDirective() {
    const at = this.next()
    if (this.accept('namespace')) {
      this.identifier('a namespace')
      this.expect(';')
      return
    }
    const name = this.identifier()
    if (this.accept('=')) {
      this.aliases.set(name, this.type())
    }
    // `using std::cin;` style declarations need nothing.
    while (!this.is(';') && !this.atEnd()) this.next()
    if (this.atEnd()) this.fail('Missing ; after using.', at)
    this.expect(';')
  }

  private typedef() {
    this.next()
    const type = this.type()
    let final = type
    const name = this.identifier('a type name')
    // typedef int arr[10];
    const dims: number[] = []
    while (this.accept('[')) {
      const size = this.constValue(this.expression())
      if (size === null) this.fail('Array typedefs need a constant size.')
      dims.push(size)
      this.expect(']')
    }
    for (const size of dims.reverse()) {
      final = { k: 'carray', elem: final, size }
    }
    this.aliases.set(name, final)
    while (this.accept(',')) {
      this.aliases.set(this.identifier('a type name'), type)
    }
    this.expect(';')
  }

  private templateDeclaration() {
    this.next()
    this.expect('<')
    const params = new Set<string>()
    if (!this.is('>')) {
      do {
        if (this.accept('typename') || this.accept('class')) {
          params.add(this.identifier('a template parameter'))
        } else {
          // Non-type parameter: `int N`.
          this.type()
          params.add(this.identifier('a template parameter'))
        }
        if (this.accept('=')) this.type()
      } while (this.accept(','))
    }
    this.expect('>')
    this.templateParams.push(params)
    try {
      if (
        (this.is('struct') || this.is('class')) &&
        this.isStructDefinition()
      ) {
        this.unsupported(
          'Template structs are not supported by the visualizer.',
        )
      }
      this.declarationOrFunction()
    } finally {
      this.templateParams.pop()
    }
  }

  private isStructDefinition() {
    // struct Name { ... } or struct Name : Base { ... }
    return (
      this.peek(1).kind === 'ident' &&
      (this.is('{', 2) || this.is(':', 2) || this.is('final', 2))
    )
  }

  private afterStructDefinition(def: StructDef) {
    if (this.accept(';')) return
    // struct P { ... } a, b[5];
    const declarators = this.declarators({ k: 'struct', name: def.name })
    this.expect(';')
    this.globals.push({
      k: 'decl',
      line: def.line,
      declarators,
      isStatic: false,
    })
  }

  private structDefinition(): StructDef {
    const at = this.next()
    const name = this.identifier('a struct name')
    this.structNames.add(name)
    if (this.accept(':')) {
      this.unsupported('Inheritance is not supported by the visualizer.', at)
    }
    this.expect('{')
    const def: StructDef = {
      name,
      fields: [],
      methods: new Map(),
      ctors: [],
      line: at.line,
    }
    const outer = this.currentStruct
    this.currentStruct = name
    try {
      while (!this.accept('}')) {
        if (this.atEnd()) this.fail(`Missing } for struct ${name}.`, at)
        this.structMember(def)
      }
    } finally {
      this.currentStruct = outer
    }
    return def
  }

  private structMember(def: StructDef) {
    if (this.accept(';')) return
    if (
      (this.is('public') || this.is('private') || this.is('protected')) &&
      this.is(':', 1)
    ) {
      this.pos += 2
      return
    }
    if (this.is('friend') || this.is('explicit')) this.next()
    if (this.is('template')) {
      this.unsupported('Member templates are not supported by the visualizer.')
    }
    // Constructor: Name(...)
    if (this.is(def.name) && this.is('(', 1)) {
      const at = this.next()
      const fn = this.functionRest(def.name, T.void, at.line, def.name)
      fn.isCtor = true
      def.ctors.push(fn)
      return
    }
    if (this.is('~')) {
      this.next()
      this.identifier()
      this.functionRest('~', T.void, this.lastLine(), def.name)
      return
    }
    const start = this.peek()
    const typeResult = this.tryType()
    if (typeResult === null) this.fail('Expected a member declaration.', start)
    if (this.is('operator')) {
      this.next()
      const op = this.operatorName()
      const fn = this.functionRest(
        `operator${op}`,
        typeResult.type,
        start.line,
        def.name,
      )
      this.addMethod(def, fn)
      return
    }
    let isRef = false
    if (this.accept('&')) isRef = true
    const name = this.identifier('a member name')
    if (this.is('(')) {
      const fn = this.functionRest(name, typeResult.type, start.line, def.name)
      this.addMethod(def, fn)
      return
    }
    if (isRef) {
      this.unsupported('Reference members are not supported by the visualizer.')
    }
    this.pos -= 1
    for (const declarator of this.declarators(typeResult.type)) {
      const field: StructField = {
        name: declarator.name,
        type: declarator.type,
        line: declarator.line,
      }
      if (declarator.init !== undefined) field.init = declarator.init
      if (declarator.dims !== undefined) field.dims = declarator.dims
      def.fields.push(field)
    }
    this.expect(';')
  }

  private addMethod(def: StructDef, fn: FunctionDef) {
    const list = def.methods.get(fn.name) ?? []
    list.push(fn)
    def.methods.set(fn.name, list)
  }

  private operatorName(): string {
    if (this.accept('(')) {
      this.expect(')')
      return '()'
    }
    if (this.accept('[')) {
      this.expect(']')
      return '[]'
    }
    const token = this.next()
    return token.value
  }

  private declarationOrFunction() {
    const start = this.peek()
    const typeResult = this.tryType()
    if (typeResult === null) {
      this.fail(
        `Unexpected ${this.describe(start)} at the top level. Statements must be inside a function.`,
        start,
      )
    }
    // Free operator overloads: bool operator<(const P& a, const P& b)
    if (this.is('operator')) {
      this.next()
      const op = this.operatorName()
      const fn = this.functionRest(`operator${op}`, typeResult.type, start.line)
      this.addFunction(fn)
      return
    }
    const refFunction =
      this.is('&') && this.peek(1).kind === 'ident' && this.is('(', 2)
    if ((this.peek().kind === 'ident' && this.is('(', 1)) || refFunction) {
      if (refFunction) this.next()
      const nameToken = this.next()
      // Out-of-class method definitions are rare in contest code.
      if (this.is('::')) {
        this.unsupported('Define methods inside the struct body.', nameToken)
      }
      if (this.looksLikeFunction()) {
        const fn = this.functionRest(
          nameToken.value,
          typeResult.type,
          start.line,
        )
        this.addFunction(fn)
        return
      }
      this.pos -= 1
    }
    const declarators = this.declarators(typeResult.type)
    this.expect(';')
    this.globals.push({
      k: 'decl',
      line: start.line,
      declarators,
      isStatic: typeResult.isStatic,
    })
  }

  // After `name`, is `(` the start of a parameter list (not ctor args)?
  private looksLikeFunction(): boolean {
    if (!this.is('(')) return false
    if (this.is(')', 1)) return true
    const token = this.peek(1)
    if (token.kind !== 'ident') return false
    if (token.value === 'void' && this.is(')', 2)) return true
    return this.looksLikeTypeStart(1)
  }

  private addFunction(fn: FunctionDef) {
    const list = this.functions.get(fn.name) ?? []
    list.push(fn)
    this.functions.set(fn.name, list)
  }

  private functionRest(
    name: string,
    returnType: CType,
    line: number,
    owner?: string,
  ): FunctionDef {
    const params = this.parameters()
    while (
      this.accept('const') ||
      this.accept('noexcept') ||
      this.accept('override') ||
      this.accept('final')
    ) {
      // Qualifiers after the parameter list.
    }
    let finalReturn = returnType
    if (this.accept('->')) finalReturn = this.type()
    const inits: { name: string; args: Expr[]; line: number }[] = []
    if (this.accept(':')) {
      do {
        const at = this.peek()
        const member = this.identifier('a member to initialize')
        const args: Expr[] = []
        if (this.accept('{')) {
          if (!this.is('}')) {
            do args.push(this.assignment())
            while (this.accept(','))
          }
          this.expect('}')
        } else {
          this.expect('(')
          if (!this.is(')')) {
            do args.push(this.assignment())
            while (this.accept(','))
          }
          this.expect(')')
        }
        inits.push({ name: member, args, line: at.line })
      } while (this.accept(','))
    }
    if (this.accept(';')) {
      // Prototype only; the definition comes later.
      return {
        name: `${name}#prototype`,
        returnType: finalReturn,
        params,
        body: { k: 'block', line, endLine: line, body: [] },
        line,
      }
    }
    if (this.accept('=')) {
      // = default / = delete
      this.next()
      this.expect(';')
      return {
        name: `${name}#prototype`,
        returnType: finalReturn,
        params,
        body: { k: 'block', line, endLine: line, body: [] },
        line,
      }
    }
    const body = this.block()
    const fn: FunctionDef = {
      name,
      returnType: finalReturn,
      params,
      body,
      line,
    }
    if (owner !== undefined) fn.owner = owner
    if (inits.length > 0) fn.inits = inits
    return fn
  }

  private parameters(): Param[] {
    this.expect('(')
    const params: Param[] = []
    if (this.accept(')')) return params
    if (this.is('void') && this.is(')', 1)) {
      this.pos += 2
      return params
    }
    do {
      if (this.is('...')) {
        this.unsupported(
          'Variadic functions are not supported by the visualizer.',
        )
      }
      let type = this.type()
      let isRef = false
      if (this.accept('&')) isRef = true
      else if (this.accept('&&')) isRef = true
      let name = ''
      if (this.peek().kind === 'ident') name = this.next().value
      // int a[] / int a[][M]
      const dims: (number | null)[] = []
      while (this.accept('[')) {
        if (this.is(']')) dims.push(null)
        else {
          dims.push(this.constValue(this.expression()))
        }
        this.expect(']')
      }
      for (const size of dims.reverse()) {
        type = { k: 'carray', elem: type, size }
      }
      // C arrays are always passed by reference (they decay to pointers).
      if (type.k === 'carray') isRef = true
      const param: Param = { name, type, isRef }
      if (this.accept('=')) param.defaultValue = this.assignment()
      params.push(param)
    } while (this.accept(','))
    this.expect(')')
    return params
  }

  private declarators(base: CType): Declarator[] {
    const result: Declarator[] = []
    do {
      const at = this.peek()
      // `Node *left, *right;` puts the star on each name.
      let declaredType = result.length === 0 ? base : pointee(base)
      while (this.accept('*')) {
        declaredType = { k: 'pointer', to: declaredType }
      }
      let isRef = false
      if (this.accept('&') || this.accept('&&')) isRef = true
      const name = this.identifier('a variable name')
      const declarator: Declarator = {
        name,
        type: declaredType,
        isRef,
        line: at.line,
      }
      const dims: (Expr | null)[] = []
      while (this.accept('[')) {
        if (this.is(']')) dims.push(null)
        else dims.push(this.expression())
        this.expect(']')
      }
      if (dims.length > 0) declarator.dims = dims
      if (this.accept('=')) {
        if (this.is('{')) {
          declarator.init = { form: 'list', items: this.bracedItems() }
        } else {
          const expr = this.assignment()
          declarator.init = { form: 'assign', expr }
          const value = dims.length === 0 ? this.constValue(expr) : null
          if (value !== null && (base.k === 'int' || base.k === 'auto')) {
            this.constants.set(name, value)
          }
        }
      } else if (this.is('{')) {
        declarator.init = { form: 'list', items: this.bracedItems() }
      } else if (this.is('(')) {
        this.next()
        const args: Expr[] = []
        if (!this.is(')')) {
          do args.push(this.assignment())
          while (this.accept(','))
        }
        this.expect(')')
        declarator.init = { form: 'ctor', args }
      }
      result.push(declarator)
    } while (this.accept(','))
    return result
  }

  private bracedItems(): Expr[] {
    this.expect('{')
    const items: Expr[] = []
    while (!this.is('}')) {
      items.push(this.is('{') ? this.initList() : this.assignment())
      if (!this.accept(',')) break
    }
    this.expect('}')
    return items
  }

  private initList(): Expr {
    const line = this.peek().line
    return { k: 'initlist', line, items: this.bracedItems() }
  }

  // ---- statements ----------------------------------------------------------

  private block(): Stmt & { k: 'block' } {
    const open = this.expect('{')
    const body: Stmt[] = []
    while (!this.is('}')) {
      if (this.atEnd()) this.fail('Missing } to close a block.', open)
      body.push(this.statement())
    }
    this.expect('}')
    return { k: 'block', line: open.line, endLine: this.lastLine(), body }
  }

  private statement(): Stmt {
    const token = this.peek()
    const line = token.line
    if (token.kind === 'punct') {
      if (token.value === '{') return this.block()
      if (token.value === ';') {
        this.next()
        return { k: 'empty', line }
      }
    }
    if (token.kind === 'ident') {
      switch (token.value) {
        case 'if':
          return this.ifStatement(false)
        case 'while':
          return this.whileStatement()
        case 'do':
          return this.doStatement()
        case 'for':
          return this.forStatement()
        case 'switch':
          return this.switchStatement()
        case 'return': {
          this.next()
          if (this.accept(';')) return { k: 'return', line }
          const value = this.is('{') ? this.initList() : this.expression()
          this.expect(';')
          return { k: 'return', line, value }
        }
        case 'break':
          this.next()
          this.expect(';')
          return { k: 'break', line }
        case 'continue':
          this.next()
          this.expect(';')
          return { k: 'continue', line }
        case 'goto':
          this.unsupported('goto is not supported by the visualizer.')
          break
        case 'typedef':
          this.typedef()
          return { k: 'empty', line }
        case 'using':
          this.usingDirective()
          return { k: 'empty', line }
        case 'struct':
        case 'class':
          if (this.isStructDefinition()) {
            const def = this.structDefinition()
            this.structs.set(def.name, def)
            if (!this.accept(';')) {
              const declarators = this.declarators({
                k: 'struct',
                name: def.name,
              })
              this.expect(';')
              return { k: 'decl', line, declarators, isStatic: false }
            }
            return { k: 'local-struct', line, def }
          }
          break
        case 'try':
        case 'throw':
          this.unsupported('Exceptions are not supported by the visualizer.')
          break
      }
    }
    const declaration = this.tryDeclaration()
    if (declaration !== null) {
      this.expect(';')
      return declaration
    }
    const expr = this.expression()
    this.expect(';', "';'")
    return { k: 'expr', line, expr }
  }

  // A declaration statement if one starts here (without the `;`).
  private tryDeclaration(): Stmt | null {
    if (!this.looksLikeTypeStart()) return null
    const start = this.pos
    const line = this.peek().line
    const typeResult = this.tryType()
    if (typeResult === null) return null
    // auto [a, b] = ...
    let isRef = false
    if (this.is('&') || this.is('&&')) {
      if (this.is('[', 1)) {
        this.next()
        isRef = true
      }
    }
    if (this.is('[')) {
      this.next()
      const names: string[] = []
      do names.push(this.identifier('a binding name'))
      while (this.accept(','))
      this.expect(']')
      this.expect('=')
      const init = this.assignment()
      return { k: 'binding', line, names, isRef, init }
    }
    const next = this.peek()
    const declaratorStart =
      next.kind === 'ident' ||
      ((next.value === '&' || next.value === '&&') &&
        this.peek(1).kind === 'ident')
    if (!declaratorStart) {
      this.pos = start
      return null
    }
    const declarators = this.declarators(typeResult.type)
    return { k: 'decl', line, declarators, isStatic: typeResult.isStatic }
  }

  private condition(): Expr | Stmt {
    const declaration = this.tryDeclaration()
    if (declaration !== null) return declaration
    return this.expression()
  }

  private ifStatement(elseIf: boolean): Stmt {
    const at = this.next()
    this.accept('constexpr')
    this.expect('(')
    const textStart = this.pos
    let init: Stmt | undefined
    let cond = this.condition()
    // if (init; cond)
    if (this.accept(';')) {
      init =
        cond.k === 'decl'
          ? cond
          : { k: 'expr', line: at.line, expr: cond as Expr }
      cond = this.expression()
    }
    const text = this.text(textStart, this.pos)
    this.expect(')')
    const then = this.statement()
    let otherwise: Stmt | undefined
    let endLine = this.lastLine()
    const branch: Program['branches'][number] = {
      line: at.line,
      endLine,
      kind: elseIf ? 'elif' : 'if',
      text,
    }
    this.branches.push(branch)
    if (this.accept('else')) {
      otherwise = this.is('if') ? this.ifStatement(true) : this.statement()
      endLine = this.lastLine()
    }
    const stmt: Stmt = {
      k: 'if',
      line: at.line,
      endLine,
      cond,
      then,
      elseIf,
    }
    if (init !== undefined) stmt.init = init
    if (otherwise !== undefined) stmt.else = otherwise
    return stmt
  }

  private whileStatement(): Stmt {
    const at = this.next()
    this.expect('(')
    const textStart = this.pos
    const cond = this.condition()
    const text = this.text(textStart, this.pos)
    this.expect(')')
    const body = this.statement()
    const endLine = this.lastLine()
    this.branches.push({ line: at.line, endLine, kind: 'while', text })
    return { k: 'while', line: at.line, endLine, cond, body }
  }

  private doStatement(): Stmt {
    const at = this.next()
    const body = this.statement()
    const whileToken = this.expect('while')
    this.expect('(')
    const textStart = this.pos
    const cond = this.expression()
    const text = this.text(textStart, this.pos)
    this.expect(')')
    this.expect(';')
    this.branches.push({
      line: whileToken.line,
      endLine: whileToken.line,
      kind: 'do',
      text,
    })
    return {
      k: 'do',
      line: at.line,
      endLine: this.lastLine(),
      whileLine: whileToken.line,
      cond,
      body,
    }
  }

  private forStatement(): Stmt {
    const at = this.next()
    this.expect('(')
    const textStart = this.pos
    // Range-based: for (auto x : v) / for (auto& [a, b] : m)
    if (this.looksLikeTypeStart()) {
      const save = this.pos
      const typeResult = this.tryType()
      if (typeResult !== null) {
        let isRef = false
        if (this.accept('&') || this.accept('&&')) isRef = true
        let name: string | undefined
        let names: string[] | undefined
        if (this.accept('[')) {
          names = []
          do names.push(this.identifier('a binding name'))
          while (this.accept(','))
          this.expect(']')
        } else if (this.peek().kind === 'ident') {
          name = this.next().value
        }
        if ((name !== undefined || names !== undefined) && this.accept(':')) {
          const iterable = this.expression()
          const text = this.text(textStart, this.pos)
          this.expect(')')
          const body = this.statement()
          const endLine = this.lastLine()
          this.branches.push({ line: at.line, endLine, kind: 'for', text })
          const stmt: Stmt = {
            k: 'rangefor',
            line: at.line,
            endLine,
            type: typeResult.type,
            isRef,
            iterable,
            body,
          }
          if (name !== undefined) stmt.name = name
          if (names !== undefined) stmt.names = names
          return stmt
        }
      }
      this.pos = save
    }
    let init: Stmt | undefined
    if (!this.accept(';')) {
      const declaration = this.tryDeclaration()
      init = declaration ?? {
        k: 'expr',
        line: at.line,
        expr: this.expression(),
      }
      this.expect(';')
    }
    let cond: Expr | undefined
    if (!this.is(';')) cond = this.expression()
    this.expect(';')
    let update: Expr | undefined
    if (!this.is(')')) update = this.expression()
    const text = this.text(textStart, this.pos)
    this.expect(')')
    const body = this.statement()
    const endLine = this.lastLine()
    this.branches.push({ line: at.line, endLine, kind: 'for', text })
    const stmt: Stmt = { k: 'for', line: at.line, endLine, body }
    if (init !== undefined) stmt.init = init
    if (cond !== undefined) stmt.cond = cond
    if (update !== undefined) stmt.update = update
    return stmt
  }

  private switchStatement(): Stmt {
    const at = this.next()
    this.expect('(')
    const textStart = this.pos
    const value = this.expression()
    const text = this.text(textStart, this.pos)
    this.expect(')')
    this.expect('{')
    const cases: { values: Expr[] | null; line: number; body: Stmt[] }[] = []
    while (!this.accept('}')) {
      if (this.atEnd()) this.fail('Missing } for switch.', at)
      const label = this.peek()
      if (this.accept('case')) {
        const values = [this.ternary()]
        this.expect(':')
        // Consecutive labels share a body.
        while (this.is('case')) {
          this.next()
          values.push(this.ternary())
          this.expect(':')
        }
        cases.push({ values, line: label.line, body: [] })
        continue
      }
      if (this.accept('default')) {
        this.expect(':')
        cases.push({ values: null, line: label.line, body: [] })
        continue
      }
      const current = cases.at(-1)
      if (current === undefined) this.fail('Expected case or default.')
      current.body.push(this.statement())
    }
    const endLine = this.lastLine()
    this.branches.push({ line: at.line, endLine, kind: 'switch', text })
    return { k: 'switch', line: at.line, endLine, value, cases }
  }

  // ---- expressions ---------------------------------------------------------

  expression(minimum = 0): Expr {
    if (minimum > 0) return this.binary(minimum)
    let expr = this.assignment()
    while (this.is(',')) {
      const line = this.next().line
      expr = { k: 'comma', line, left: expr, right: this.assignment() }
    }
    return expr
  }

  private assignment(): Expr {
    const left = this.ternary()
    const token = this.peek()
    if (token.kind === 'punct' && assignmentOps.has(token.value)) {
      this.next()
      const value = this.is('{') ? this.initList() : this.assignment()
      return {
        k: 'assign',
        line: token.line,
        op: token.value,
        target: left,
        value,
      }
    }
    return left
  }

  private ternary(): Expr {
    const cond = this.binary(0)
    if (this.is('?')) {
      const line = this.next().line
      const yes = this.assignment()
      this.expect(':')
      const no = this.assignment()
      return { k: 'ternary', line, cond, yes, no }
    }
    return cond
  }

  private binary(minimum: number): Expr {
    let left = this.unary()
    for (;;) {
      const token = this.peek()
      if (token.kind !== 'punct') break
      const level = binaryPrecedence[token.value]
      if (level === undefined || level <= minimum) break
      this.next()
      const right = this.binary(level)
      left =
        token.value === '&&' || token.value === '||'
          ? { k: 'logical', line: token.line, op: token.value, left, right }
          : { k: 'binary', line: token.line, op: token.value, left, right }
    }
    return left
  }

  private unary(): Expr {
    const token = this.peek()
    const line = token.line
    if (token.kind === 'punct') {
      if (['!', '~', '-', '+', '*', '&'].includes(token.value)) {
        this.next()
        return { k: 'unary', line, op: token.value, operand: this.unary() }
      }
      if (token.value === '++' || token.value === '--') {
        this.next()
        return { k: 'unary', line, op: token.value, operand: this.unary() }
      }
      // C-style cast: (long long)x
      if (token.value === '(' && this.looksLikeTypeStart(1)) {
        const save = this.pos
        this.next()
        const typeResult = this.tryType()
        if (typeResult !== null && this.is(')')) {
          this.next()
          return { k: 'cast', line, type: typeResult.type, expr: this.unary() }
        }
        this.pos = save
      }
    }
    if (token.kind === 'ident') {
      if (token.value === 'sizeof') {
        this.next()
        if (this.is('(') && this.looksLikeTypeStart(1)) {
          const save = this.pos
          this.next()
          const typeResult = this.tryType()
          if (typeResult !== null && this.accept(')')) {
            return { k: 'sizeof', line, type: typeResult.type }
          }
          this.pos = save
        }
        return { k: 'sizeof', line, expr: this.unary() }
      }
      if (token.value === 'new') return this.newExpression()
      if (token.value === 'delete') {
        this.next()
        if (this.accept('[')) this.expect(']')
        return { k: 'delete', line, operand: this.unary() }
      }
    }
    return this.postfix(this.primary())
  }

  private newExpression(): Expr {
    const at = this.next()
    const type = this.type()
    if (this.accept('[')) {
      const arraySize = this.expression()
      this.expect(']')
      let zeroed = false
      if (this.accept('(')) {
        this.expect(')')
        zeroed = true
      } else if (this.is('{')) {
        this.bracedItems()
        zeroed = true
      }
      return {
        k: 'new',
        line: at.line,
        type,
        args: [],
        braced: false,
        arraySize,
        zeroed,
      }
    }
    if (this.is('(')) {
      return {
        k: 'new',
        line: at.line,
        type,
        args: this.callArgs(),
        braced: false,
      }
    }
    if (this.is('{')) {
      return {
        k: 'new',
        line: at.line,
        type,
        args: this.bracedItems(),
        braced: true,
      }
    }
    return { k: 'new', line: at.line, type, args: [], braced: false }
  }

  private postfix(start: Expr): Expr {
    let expr = start
    for (;;) {
      const token = this.peek()
      if (token.kind !== 'punct') break
      if (token.value === '[') {
        this.next()
        const index = this.expression()
        this.expect(']')
        this.recordIndexHint(expr, index)
        expr = { k: 'index', line: token.line, object: expr, index }
        continue
      }
      if (token.value === '(') {
        expr = {
          k: 'call',
          line: token.line,
          callee: expr,
          args: this.callArgs(),
        }
        continue
      }
      if (token.value === '.' || token.value === '->') {
        this.next()
        let name: string
        if (this.accept('template')) {
          name = this.identifier('a member name')
        } else if (this.accept('operator')) {
          name = `operator${this.operatorName()}`
        } else {
          name = this.identifier('a member name')
        }
        expr = {
          k: 'member',
          line: token.line,
          object: expr,
          name,
          arrow: token.value === '->',
        }
        continue
      }
      if (token.value === '++' || token.value === '--') {
        this.next()
        expr = {
          k: 'postfix',
          line: token.line,
          op: token.value,
          operand: expr,
        }
        continue
      }
      break
    }
    return expr
  }

  private callArgs(): Expr[] {
    this.expect('(')
    const args: Expr[] = []
    if (!this.is(')')) {
      do args.push(this.is('{') ? this.initList() : this.assignment())
      while (this.accept(','))
    }
    this.expect(')')
    return args
  }

  // Pointers are drawn under one-dimensional arrays, so only the first index
  // of a[i][j] counts.
  private recordIndexHint(object: Expr, index: Expr) {
    const name =
      object.k === 'ident'
        ? object.name
        : object.k === 'member'
          ? object.name
          : null
    if (name === null) return
    const names = new Set<string>()
    const visit = (expr: Expr) => {
      switch (expr.k) {
        case 'ident':
          names.add(expr.name)
          break
        case 'binary':
          visit(expr.left)
          visit(expr.right)
          break
        case 'unary':
        case 'postfix':
          visit(expr.operand)
          break
        case 'cast':
          visit(expr.expr)
          break
        default:
          break
      }
    }
    visit(index)
    if (names.size === 0) return
    const set = this.indexHints.get(name) ?? new Set<string>()
    for (const value of names) set.add(value)
    this.indexHints.set(name, set)
  }

  private primary(): Expr {
    const token = this.peek()
    const line = token.line
    switch (token.kind) {
      case 'number':
        this.next()
        return numberLiteral(token)
      case 'char':
        this.next()
        return { k: 'char', line, value: token.value.charCodeAt(0) || 0 }
      case 'string': {
        this.next()
        let value = token.value
        while (this.peek().kind === 'string') value += this.next().value
        return { k: 'string', line, value }
      }
      case 'punct':
        if (token.value === '(') {
          this.next()
          const expr = this.expression()
          this.expect(')')
          return expr
        }
        if (token.value === '[') return this.lambda()
        if (token.value === '{') return this.initList()
        this.fail(`Unexpected ${this.describe(token)}.`)
        break
      case 'ident':
        return this.identifierExpression()
      default:
        this.fail(`Unexpected ${this.describe(token)}.`)
    }
    return this.fail(`Unexpected ${this.describe(token)}.`)
  }

  private identifierExpression(): Expr {
    const token = this.peek()
    const line = token.line
    const word = token.value
    switch (word) {
      case 'true':
      case 'false':
        this.next()
        return { k: 'bool', line, value: word === 'true' }
      case 'nullptr':
      case 'NULL':
        this.next()
        return { k: 'null', line }
      case 'this':
        this.next()
        return { k: 'this', line }
      case 'static_cast':
      case 'const_cast':
      case 'dynamic_cast':
      case 'reinterpret_cast': {
        this.next()
        this.expect('<')
        const type = this.type()
        this.expect('>')
        this.expect('(')
        const expr = this.expression()
        this.expect(')')
        return { k: 'cast', line, type, expr }
      }
      case 'numeric_limits': {
        this.next()
        const args = this.templateArgs()
        this.expect('::')
        const name = this.identifier()
        const arg = args[0]
        const scoped: Expr = {
          k: 'scoped',
          line,
          scope: 'numeric_limits',
          name,
        }
        if (arg !== undefined && !isExpr(arg)) scoped.type = arg
        return scoped
      }
      default:
        break
    }
    // Construction and functional casts: int(x), vector<int>(n),
    // pair<int, int>{a, b}, Edge{u, v, w}, greater<int>().
    if (this.looksLikeTypeStart() && !qualifierWords.has(word)) {
      const save = this.pos
      const typeResult = this.tryType()
      if (typeResult !== null) {
        if (this.is('(')) {
          const args = this.callArgs()
          return {
            k: 'construct',
            line,
            type: typeResult.type,
            args,
            braced: false,
          }
        }
        if (this.is('{')) {
          const items = this.bracedItems()
          return {
            k: 'construct',
            line,
            type: typeResult.type,
            args: items,
            braced: true,
          }
        }
        if (this.is('::') && this.peek(1).kind === 'ident') {
          this.next()
          const name = this.identifier()
          return { k: 'scoped', line, scope: word, name, type: typeResult.type }
        }
      }
      this.pos = save
    }
    this.next()
    // ios_base::sync_with_stdio, string::npos, Struct::method
    if (this.is('::') && this.peek(1).kind === 'ident') {
      this.next()
      const name = this.identifier()
      return { k: 'scoped', line, scope: word, name }
    }
    if (
      templateFunctionWords.has(word) &&
      this.is('<') &&
      (word === 'get' || this.looksLikeTypeStart(1))
    ) {
      const templateArgs = this.templateArgs()
      const args = this.callArgs()
      return {
        k: 'call',
        line,
        callee: { k: 'ident', line, name: word },
        args,
        templateArgs,
      }
    }
    return { k: 'ident', line, name: word }
  }

  private lambda(): Expr {
    const at = this.expect('[')
    let byValue = false
    while (!this.accept(']')) {
      if (this.atEnd()) this.fail('Missing ] in a lambda capture.', at)
      const token = this.next()
      if (token.value === '=' && (this.is(',') || this.is(']'))) byValue = true
    }
    const params = this.is('(') ? this.parameters() : []
    while (
      this.accept('mutable') ||
      this.accept('constexpr') ||
      this.accept('noexcept')
    ) {
      // Lambda specifiers.
    }
    let returnType: CType = T.auto
    if (this.accept('->')) returnType = this.type()
    const body = this.block()
    return {
      k: 'lambda',
      line: at.line,
      fn: { name: 'lambda', returnType, params, body, line: at.line },
      byValue,
    }
  }
}

export function isExpr(value: CType | Expr): value is Expr {
  return 'line' in value
}

function numberLiteral(token: Token): Expr {
  const raw = token.value
  const line = token.line
  const lower = raw.toLowerCase()
  const isHex = lower.startsWith('0x')
  const isBinary = lower.startsWith('0b')
  const isFloat =
    !isHex && !isBinary && (lower.includes('.') || lower.includes('e'))
  if (isFloat) {
    const body = lower.replace(/[fl]$/, '')
    const value = Number(body)
    if (!Number.isFinite(value) && body !== 'inf') {
      throw new CppCompileError(`Invalid number ${raw}.`, line, token.col)
    }
    return {
      k: 'float',
      line,
      value,
      type: lower.endsWith('f') ? T.float : T.double,
    }
  }
  const suffixMatch = /[ul]+$/.exec(lower)
  const suffix = suffixMatch?.[0] ?? ''
  const digits = lower.slice(0, lower.length - suffix.length)
  let value: bigint
  try {
    if (isHex || isBinary) value = BigInt(digits)
    else if (digits.length > 1 && digits.startsWith('0')) {
      value = BigInt(`0o${digits.slice(1)}`)
    } else value = BigInt(digits)
  } catch {
    throw new CppCompileError(`Invalid number ${raw}.`, line, token.col)
  }
  const unsigned = suffix.includes('u')
  const long = suffix.includes('l')
  const decimal =
    !isHex && !isBinary && !(digits.length > 1 && digits.startsWith('0'))
  let type: CType
  if (!long && !unsigned && value <= 2147483647n) type = T.int
  else if (!long && unsigned && value <= 4294967295n) type = T.uint
  else if (!long && !unsigned && !decimal && value <= 4294967295n) type = T.uint
  else if (!unsigned && value <= 9223372036854775807n) type = T.ll
  else type = T.ull
  if (type.k === 'int' && type.bits >= 64) {
    return { k: 'int', line, value: BigInt.asUintN(64, value), type }
  }
  return { k: 'int', line, value: Number(value), type }
}

// The declared type without its outermost pointer: for `Node *a, *b` the
// base type of the declaration is Node*, and each name adds its own star.
function pointee(type: CType): CType {
  return type.k === 'pointer' ? type.to : type
}
