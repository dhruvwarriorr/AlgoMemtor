// Recursive-descent parser for Java programs. It builds the same AST as the
// C++ parser: every class becomes a struct definition (instance fields,
// methods and constructors), static fields become globals and static methods
// become functions. Java-only constructs (array creation, method references,
// try/catch, labels) use the extra AST nodes.

import type {
  Declarator,
  Expr,
  FunctionDef,
  Param,
  Program,
  Stmt,
  StructDef,
  StructField,
} from '../cpp/ast'
import { CppCompileError, type Token } from '../cpp/lexer'
import { T, type CType } from '../cpp/types'

export const JCHAR: CType = { k: 'int', bits: 16, unsigned: true, char: true }
export const JBYTE: CType = { k: 'int', bits: 8, unsigned: false }

const primitiveTypes: Record<string, CType> = {
  int: T.int,
  long: T.ll,
  short: T.short,
  byte: JBYTE,
  char: JCHAR,
  boolean: T.bool,
  double: T.double,
  float: T.float,
  void: T.void,
}

const boxedTypes: Record<string, CType> = {
  Integer: { ...T.int, boxed: true } as CType,
  Long: { ...T.ll, boxed: true } as CType,
  Short: { ...T.short, boxed: true } as CType,
  Byte: { ...JBYTE, boxed: true },
  Character: { ...JCHAR, boxed: true },
  Boolean: { k: 'bool', boxed: true },
  Double: { k: 'float', name: 'double', boxed: true },
  Float: { k: 'float', name: 'float', boxed: true },
}

// Library classes a Java program may name as a type.
const libraryTypes = new Set([
  'String',
  'CharSequence',
  'Object',
  'Number',
  'StringBuilder',
  'StringBuffer',
  'Scanner',
  'BufferedReader',
  'InputStreamReader',
  'StringTokenizer',
  'PrintWriter',
  'PrintStream',
  'BufferedWriter',
  'OutputStreamWriter',
  'Random',
  'List',
  'ArrayList',
  'LinkedList',
  'Vector',
  'Collection',
  'Iterable',
  'Stack',
  'Queue',
  'Deque',
  'ArrayDeque',
  'PriorityQueue',
  'Map',
  'HashMap',
  'TreeMap',
  'LinkedHashMap',
  'Hashtable',
  'SortedMap',
  'NavigableMap',
  'Set',
  'HashSet',
  'TreeSet',
  'LinkedHashSet',
  'SortedSet',
  'NavigableSet',
  'Iterator',
  'Comparator',
  'Comparable',
  'Function',
  'BiFunction',
  'Supplier',
  'Consumer',
  'BiConsumer',
  'Predicate',
  'BiPredicate',
  'UnaryOperator',
  'BinaryOperator',
  'IntBinaryOperator',
  'IntUnaryOperator',
  'Runnable',
  'Entry',
  'Optional',
  'IOException',
  'Exception',
  'RuntimeException',
  'Throwable',
  'Error',
  'ArithmeticException',
  'IllegalArgumentException',
  'IllegalStateException',
  'NumberFormatException',
  'NullPointerException',
  'IndexOutOfBoundsException',
  'ArrayIndexOutOfBoundsException',
  'StringIndexOutOfBoundsException',
  'NoSuchElementException',
  'InputMismatchException',
  'UnsupportedOperationException',
  'StackOverflowError',
  'InterruptedException',
  'EmptyStackException',
  ...Object.keys(boxedTypes),
])

// Classes whose members are accessed statically: Math.max, Integer.parseInt.
export const staticClasses = new Set([
  'Math',
  'Integer',
  'Long',
  'Short',
  'Byte',
  'Double',
  'Float',
  'Character',
  'Boolean',
  'String',
  'Arrays',
  'Collections',
  'System',
  'Objects',
  'List',
  'Set',
  'Map',
  'Comparator',
  'Thread',
  'StrictMath',
  'Collectors',
  'IntStream',
  'LongStream',
  'Stream',
])

const modifiers = new Set([
  'public',
  'private',
  'protected',
  'static',
  'final',
  'abstract',
  'synchronized',
  'native',
  'transient',
  'volatile',
  'strictfp',
  'default',
  'sealed',
  'non-sealed',
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
  '>>>=',
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
  '>>>': 8,
  '+': 9,
  '-': 9,
  '*': 10,
  '/': 10,
  '%': 10,
}

// A program plus Java-only details the interpreter needs.
export type JavaProgram = Program & {
  // Static fields and static initializer blocks, in source order.
  staticInit: Stmt[]
  // Class that declares each static method, for Class.method() calls.
  staticOwners: Map<string, string>
  mainClass: string
  // Every class and interface a class is an instance of (itself included).
  supertypes: Map<string, Set<string>>
  // record classes (value equality, Name[x=1, y=2] text).
  records: Set<string>
  // enum class -> its constants in declaration order.
  enums: Map<string, string[]>
}

export function parseJava(tokens: Token[]): JavaProgram {
  return new JavaParser(tokens).program()
}

type Modifiers = { isStatic: boolean }

class JavaParser {
  private readonly tokens: Token[]
  private pos = 0
  private readonly classNames = new Set<string>()
  private typeParams: Set<string>[] = []
  private readonly functions = new Map<string, FunctionDef[]>()
  private readonly structs = new Map<string, StructDef>()
  private readonly staticInit: Stmt[] = []
  private readonly staticOwners = new Map<string, string>()
  private readonly branches: Program['branches'] = []
  private readonly indexHints = new Map<string, Set<string>>()
  private anonymous = 0
  private mainClass = ''
  private readonly parents = new Map<string, string>()
  private readonly interfacesOf = new Map<string, string[]>()
  private readonly interfaceNames = new Set<string>()
  private readonly records = new Set<string>()
  private readonly enums = new Map<string, string[]>()
  // Enclosing classes while parsing, for super(...) and super.method().
  private readonly classStack: string[] = []

  constructor(tokens: Token[]) {
    this.tokens = tokens
    // Classes can be used before they are declared.
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const token = tokens[i]
      const next = tokens[i + 1]
      if (
        token.kind === 'ident' &&
        ['class', 'interface', 'enum', 'record'].includes(token.value) &&
        next.kind === 'ident'
      ) {
        this.classNames.add(next.value)
      }
    }
  }

  program(): JavaProgram {
    while (!this.atEnd()) {
      if (this.accept(';')) continue
      if (this.is('package') || this.is('import')) {
        while (!this.is(';') && !this.atEnd()) this.next()
        this.expect(';')
        continue
      }
      this.typeDeclaration()
    }
    if (!this.functions.has('main')) {
      throw new CppCompileError(
        'No main method. Add public static void main(String[] args) that reads the input and prints the answer.',
        1,
        undefined,
        true,
      )
    }
    const indexHints: Record<string, string[]> = {}
    for (const [name, values] of this.indexHints) {
      indexHints[name] = [...values]
    }
    const supertypes = this.resolveHierarchy()
    return {
      globals: [],
      staticInit: this.staticInit,
      staticOwners: this.staticOwners,
      mainClass: this.mainClass,
      supertypes,
      records: this.records,
      enums: this.enums,
      functions: this.functions,
      structs: this.structs,
      branches: [...this.branches].sort((a, b) => a.line - b.line),
      indexHints,
    }
  }

  // ---- tokens ---------------------------------------------------------------

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

  // Splits `>>`/`>>>` when closing type arguments.
  private closeAngle(): boolean {
    const token = this.peek()
    if (token.kind !== 'punct') return false
    if (token.value === '>') {
      this.pos += 1
      return true
    }
    if (
      token.value === '>>' ||
      token.value === '>>>' ||
      token.value === '>=' ||
      token.value === '>>='
    ) {
      this.tokens[this.pos] = {
        ...token,
        value: token.value.slice(1),
        col: token.col + 1,
      }
      return true
    }
    return false
  }

  private expect(value: string, what?: string): Token {
    if (this.is(value)) return this.next()
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
        [',', ';', ')', ']', '.', '++', '--', '::'].includes(value) ||
        ['(', '[', '.', '::', '!', '~'].includes(previous?.value ?? '') ||
        (value === '(' && previous?.kind === 'ident') ||
        (value === '[' && previous?.kind === 'ident')
      result += (tight ? '' : ' ') + value
    }
    return result.length > 120 ? `${result.slice(0, 117)}…` : result
  }

  private modifiers(): Modifiers {
    let isStatic = false
    while (this.peek().kind === 'ident' && modifiers.has(this.peek().value)) {
      if (this.peek().value === 'static') isStatic = true
      this.next()
    }
    return { isStatic }
  }

  // ---- types -----------------------------------------------------------------

  // After modifiers: does a method (rather than a field) start here?
  private looksLikeMethodAhead(): boolean {
    const saved = this.pos
    try {
      if (this.is('<')) return true
      if (this.tryType() === null) return false
      if (this.peek().kind !== 'ident') return false
      this.next()
      return this.is('(')
    } catch {
      return false
    } finally {
      this.pos = saved
    }
  }

  private isTypeWord(name: string) {
    return (
      name in primitiveTypes ||
      libraryTypes.has(name) ||
      this.classNames.has(name) ||
      name === 'var' ||
      this.typeParams.some((scope) => scope.has(name))
    )
  }

  private looksLikeTypeStart(offset = 0) {
    const token = this.peek(offset)
    return (
      token.kind === 'ident' &&
      (this.isTypeWord(token.value) || token.value === 'final')
    )
  }

  private typeArguments(): CType[] {
    // `<>` (diamond) or `<A, B<C>>`
    this.expect('<')
    const args: CType[] = []
    if (this.closeAngle()) return args
    do {
      if (this.accept('?')) {
        if (this.accept('extends') || this.accept('super'))
          args.push(this.type())
        else args.push(T.auto)
        continue
      }
      args.push(this.type())
    } while (this.accept(','))
    if (!this.closeAngle()) this.fail("Expected '>' to close type arguments.")
    return args
  }

  private tryType(): CType | null {
    const start = this.pos
    while (this.accept('final')) {
      // `final int x`
    }
    const token = this.peek()
    if (token.kind !== 'ident' || !this.isTypeWord(token.value)) {
      this.pos = start
      return null
    }
    this.next()
    let name = token.value
    // Map.Entry, AbstractMap.SimpleEntry
    while (
      this.is('.') &&
      this.peek(1).kind === 'ident' &&
      /^[A-Z]/.test(this.peek(1).value)
    ) {
      this.next()
      name = this.next().value
    }
    let args: CType[] = []
    if (this.is('<')) {
      const save = this.pos
      try {
        args = this.typeArguments()
      } catch {
        this.pos = save
        this.pos = start
        return null
      }
    }
    let type = this.namedType(name, args)
    while (this.is('[') && this.is(']', 1)) {
      this.pos += 2
      type = { k: 'carray', elem: type, size: null }
    }
    if (this.is('...')) {
      this.next()
      type = { k: 'carray', elem: type, size: null }
    }
    return type
  }

  private type(): CType {
    const type = this.tryType()
    if (type === null) this.fail('Expected a type.')
    return type
  }

  private namedType(name: string, args: CType[]): CType {
    const arg = (index: number): CType => args[index] ?? T.auto
    const primitive = primitiveTypes[name]
    if (primitive !== undefined) return primitive
    const boxed = boxedTypes[name]
    if (boxed !== undefined) return boxed
    if (this.typeParams.some((scope) => scope.has(name))) return T.auto
    switch (name) {
      case 'var':
      case 'Object':
      case 'Number':
        return T.auto
      case 'String':
      case 'CharSequence':
        return T.string
      case 'List':
      case 'ArrayList':
      case 'Vector':
      case 'Collection':
      case 'Iterable':
        return { k: 'vector', elem: arg(0) }
      case 'LinkedList':
      case 'Deque':
      case 'ArrayDeque':
      case 'Queue':
        return { k: 'deque', elem: arg(0) }
      case 'Stack':
        return { k: 'stack', elem: arg(0) }
      case 'PriorityQueue':
        return { k: 'pq', elem: arg(0), cmp: null }
      case 'Map':
      case 'HashMap':
      case 'LinkedHashMap':
      case 'Hashtable':
        return {
          k: 'map',
          key: arg(0),
          value: arg(1),
          ordered: false,
          multi: false,
          cmp: null,
        }
      case 'TreeMap':
      case 'SortedMap':
      case 'NavigableMap':
        return {
          k: 'map',
          key: arg(0),
          value: arg(1),
          ordered: true,
          multi: false,
          cmp: null,
        }
      case 'Set':
      case 'HashSet':
      case 'LinkedHashSet':
        return {
          k: 'set',
          elem: arg(0),
          ordered: false,
          multi: false,
          cmp: null,
        }
      case 'TreeSet':
      case 'SortedSet':
      case 'NavigableSet':
        return {
          k: 'set',
          elem: arg(0),
          ordered: true,
          multi: false,
          cmp: null,
        }
      case 'Entry':
        return { k: 'pair', first: arg(0), second: arg(1) }
      case 'Comparator':
      case 'Comparable':
      case 'Function':
      case 'BiFunction':
      case 'Supplier':
      case 'Consumer':
      case 'BiConsumer':
      case 'Predicate':
      case 'BiPredicate':
      case 'UnaryOperator':
      case 'BinaryOperator':
      case 'IntBinaryOperator':
      case 'IntUnaryOperator':
      case 'Runnable':
        return T.function
      default:
        if (this.classNames.has(name)) return { k: 'struct', name }
        return {
          k: 'jclass',
          name: name === 'StringBuffer' ? 'StringBuilder' : name,
        }
    }
  }

  // ---- declarations ---------------------------------------------------------

  private typeDeclaration() {
    this.modifiers()
    if (!this.nestedType()) this.fail('Expected a class declaration.')
  }

  // class, interface, enum or record; false when none starts here.
  private nestedType(): boolean {
    if (this.is('class')) this.classDeclaration()
    else if (this.is('interface')) this.interfaceDeclaration()
    else if (this.is('enum')) this.enumDeclaration()
    else if (this.is('record')) this.recordDeclaration()
    else return false
    return true
  }

  private typeParameters(): Set<string> {
    const params = new Set<string>()
    if (this.is('<')) {
      this.next()
      // Bounds may name the parameters themselves: <T extends Comparable<T>>.
      this.typeParams.push(params)
      try {
        do {
          params.add(this.identifier('a type parameter'))
          if (this.accept('extends')) {
            this.type()
            while (this.accept('&')) this.type()
          }
        } while (this.accept(','))
        this.closeAngle()
      } finally {
        this.typeParams.pop()
      }
    }
    return params
  }

  private implementsClause(name: string) {
    if (!this.accept('implements')) return
    const list = this.interfacesOf.get(name) ?? []
    do {
      const type = this.type()
      if (type.k === 'struct') list.push(type.name)
    } while (this.accept(','))
    this.interfacesOf.set(name, list)
  }

  private withClass<R>(name: string, params: Set<string>, body: () => R): R {
    this.typeParams.push(params)
    this.classStack.push(name)
    try {
      return body()
    } finally {
      this.classStack.pop()
      this.typeParams.pop()
    }
  }

  private interfaceDeclaration(): StructDef {
    const at = this.expect('interface')
    const name = this.identifier('an interface name')
    this.classNames.add(name)
    this.interfaceNames.add(name)
    const params = this.typeParameters()
    if (this.accept('extends')) {
      const list = this.interfacesOf.get(name) ?? []
      do {
        const type = this.type()
        if (type.k === 'struct') list.push(type.name)
      } while (this.accept(','))
      this.interfacesOf.set(name, list)
    }
    return this.withClass(name, params, () =>
      this.classBody(name, at.line, true),
    )
  }

  // enum Color { RED, GREEN(2); fields, constructor, methods }
  private enumDeclaration(): StructDef {
    const at = this.expect('enum')
    const name = this.identifier('an enum name')
    this.classNames.add(name)
    this.implementsClause(name)
    return this.withClass(name, new Set(), () => {
      const def: StructDef = {
        name,
        fields: [],
        methods: new Map(),
        ctors: [],
        line: at.line,
      }
      this.structs.set(name, def)
      this.expect('{')
      const constants: string[] = []
      while (!this.is(';') && !this.is('}')) {
        const token = this.peek()
        const constant = this.identifier('an enum constant')
        const args = this.is('(') ? this.callArgs() : []
        if (this.is('{')) {
          this.unsupported(
            'Enum constants with their own class bodies are not supported yet.',
          )
        }
        this.staticInit.push({
          k: 'decl',
          line: token.line,
          isStatic: false,
          declarators: [
            {
              name: constant,
              type: { k: 'struct', name },
              isRef: false,
              line: token.line,
              init: {
                form: 'assign',
                expr: {
                  k: 'new',
                  line: token.line,
                  type: { k: 'struct', name },
                  args,
                  braced: false,
                  enumConst: { name: constant, ordinal: constants.length },
                },
              },
            },
          ],
        })
        this.staticOwners.set(constant, name)
        constants.push(constant)
        if (!this.accept(',')) break
      }
      this.enums.set(name, constants)
      this.accept(';')
      while (!this.accept('}')) {
        if (this.atEnd()) this.fail(`Missing } for enum ${name}.`)
        this.member(def)
      }
      return def
    })
  }

  // record Point(int x, int y) { methods }
  private recordDeclaration(): StructDef {
    const at = this.expect('record')
    const name = this.identifier('a record name')
    this.classNames.add(name)
    this.records.add(name)
    const params = this.typeParameters()
    return this.withClass(name, params, () => {
      const components = this.parameters()
      this.implementsClause(name)
      const def = this.classBody(name, at.line, false, components)
      const line = at.line
      const self: Expr = { k: 'this', line }
      if (!def.ctors.some((ctor) => ctor.params.length === components.length)) {
        def.ctors.push({
          name,
          returnType: T.void,
          params: components,
          line,
          owner: name,
          isCtor: true,
          body: {
            k: 'block',
            line,
            endLine: line,
            body: components.map((param) => ({
              k: 'expr' as const,
              line,
              expr: {
                k: 'assign' as const,
                line,
                op: '=',
                target: {
                  k: 'member' as const,
                  line,
                  object: self,
                  name: param.name,
                  arrow: false,
                },
                value: { k: 'ident' as const, line, name: param.name },
              },
            })),
          },
        })
      }
      for (const param of components) {
        if (def.methods.has(param.name)) continue
        def.methods.set(param.name, [
          {
            name: param.name,
            returnType: param.type,
            params: [],
            line,
            owner: name,
            body: {
              k: 'block',
              line,
              endLine: line,
              body: [
                {
                  k: 'return',
                  line,
                  value: {
                    k: 'member',
                    line,
                    object: self,
                    name: param.name,
                    arrow: false,
                  },
                },
              ],
            },
          },
        ])
      }
      return def
    })
  }

  private classDeclaration(): StructDef {
    const at = this.expect('class')
    const name = this.identifier('a class name')
    this.classNames.add(name)
    const params = this.typeParameters()
    if (this.accept('extends')) {
      const parent = this.type()
      if (parent.k === 'struct') this.parents.set(name, parent.name)
      else if (!(
        parent.k === 'auto' ||
        (parent.k === 'jclass' && /Exception|Error|Throwable/.test(parent.name))
      )) {
        this.unsupported(
          `Extending the library class ${parent.k === 'jclass' ? parent.name : parent.k} is not supported by the visualizer yet.`,
          at,
        )
      }
    }
    this.implementsClause(name)
    return this.withClass(name, params, () => this.classBody(name, at.line))
  }

  // Copies inherited fields and methods into each subclass so a lookup on
  // the object's own class finds them, and returns every supertype.
  private resolveHierarchy(): Map<string, Set<string>> {
    const supertypes = new Map<string, Set<string>>()
    const done = new Set<string>()
    const resolving = new Set<string>()
    const resolve = (name: string): Set<string> => {
      const known = supertypes.get(name)
      if (known !== undefined && done.has(name)) return known
      if (resolving.has(name)) {
        this.fail(`The class ${name} inherits from itself.`)
      }
      resolving.add(name)
      const all = new Set<string>([name])
      const def = this.structs.get(name)
      const parent = this.parents.get(name)
      const inheritFrom = (other: string, fields: boolean) => {
        for (const type of resolve(other)) all.add(type)
        const source = this.structs.get(other)
        if (def === undefined || source === undefined) return
        if (fields) {
          const own = new Set(def.fields.map((field) => field.name))
          def.fields = [
            ...source.fields.filter((field) => !own.has(field.name)),
            ...def.fields,
          ]
        }
        for (const [method, overloads] of source.methods) {
          const mine = def.methods.get(method) ?? []
          const extra = overloads.filter(
            (fn) =>
              !mine.some(
                (candidate) => candidate.params.length === fn.params.length,
              ),
          )
          if (extra.length === 0) continue
          // An abstract declaration never hides a real body.
          const kept = mine.filter(
            (fn) =>
              !fn.name.endsWith('#abstract') ||
              !extra.some((other) => other.params.length === fn.params.length),
          )
          def.methods.set(method, [...kept, ...extra])
        }
      }
      if (parent !== undefined) {
        inheritFrom(parent, true)
        if (def !== undefined) this.inheritConstructors(def, parent)
      }
      for (const iface of this.interfacesOf.get(name) ?? [])
        inheritFrom(iface, false)
      resolving.delete(name)
      done.add(name)
      supertypes.set(name, all)
      return all
    }
    for (const name of this.structs.keys()) resolve(name)
    return supertypes
  }

  // A constructor that does not start with this(...) or super(...) runs the
  // parent's no-argument constructor first, as Java does.
  private inheritConstructors(def: StructDef, parent: string) {
    const base = this.structs.get(parent)
    if (base === undefined) return
    const noArg = base.ctors.find((ctor) => ctor.params.length === 0)
    const superCall = (line: number): Stmt => ({
      k: 'expr',
      line,
      expr: {
        k: 'call',
        line,
        callee: { k: 'scoped', line, scope: '$super', name: parent },
        args: [],
      },
    })
    if (def.ctors.length === 0) {
      if (noArg === undefined) {
        if (base.ctors.length > 0) {
          this.fail(
            `${def.name} must call super(...) because ${parent} has no constructor without arguments.`,
          )
        }
        return
      }
      def.ctors.push({
        name: def.name,
        returnType: T.void,
        params: [],
        line: def.line,
        owner: def.name,
        isCtor: true,
        body: {
          k: 'block',
          line: def.line,
          endLine: def.line,
          body: [superCall(def.line)],
        },
      })
      return
    }
    for (const ctor of def.ctors) {
      const first = ctor.body.body[0]
      const explicit =
        first?.k === 'expr' &&
        first.expr.k === 'call' &&
        (first.expr.callee.k === 'this' ||
          (first.expr.callee.k === 'scoped' &&
            first.expr.callee.scope === '$super'))
      if (!explicit && noArg !== undefined) {
        ctor.body = {
          ...ctor.body,
          body: [superCall(ctor.line), ...ctor.body.body],
        }
      }
    }
  }

  private classBody(
    name: string,
    line: number,
    isInterface = false,
    components: Param[] = [],
  ): StructDef {
    const def: StructDef = {
      name,
      fields: components.map((param) => ({
        name: param.name,
        type: param.type,
        line,
      })),
      methods: new Map(),
      ctors: [],
      line,
    }
    this.structs.set(name, def)
    this.expect('{')
    while (!this.accept('}')) {
      if (this.atEnd())
        this.fail(
          `Missing } for ${isInterface ? 'interface' : 'class'} ${name}.`,
        )
      this.member(def, isInterface)
    }
    return def
  }

  private member(def: StructDef, isInterface = false) {
    if (this.accept(';')) return
    const start = this.peek()
    const mods = this.modifiers()
    if (this.nestedType()) return
    // Interface fields are constants; interface methods without a body are
    // abstract, with `default` they are inherited.
    const isStatic =
      mods.isStatic || (isInterface && !this.looksLikeMethodAhead())
    if (this.records.has(def.name) && this.is(def.name) && this.is('{', 1)) {
      this.unsupported('Compact record constructors are not supported yet.')
    }
    if (this.is('{')) {
      const block = this.block()
      if (isStatic) this.staticInit.push(block)
      else
        this.unsupported('Instance initializer blocks are not supported yet.')
      return
    }
    // Generic method: <T> void f(...)
    const params = this.typeParameters()
    this.typeParams.push(params)
    try {
      // Constructor: Name(
      if (this.is(def.name) && this.is('(', 1)) {
        this.next()
        const fn = this.methodRest(def.name, T.void, start.line, def.name)
        fn.isCtor = true
        def.ctors.push(fn)
        return
      }
      const type = this.type()
      const nameToken = this.peek()
      const memberName = this.identifier('a member name')
      if (this.is('(')) {
        if (isStatic) {
          const fn = this.methodRest(memberName, type, start.line)
          this.addFunction(fn)
          this.staticOwners.set(memberName, def.name)
          if (memberName === 'main' && this.mainClass === '')
            this.mainClass = def.name
        } else {
          const fn = this.methodRest(memberName, type, start.line, def.name)
          const list = def.methods.get(memberName) ?? []
          list.push(fn)
          def.methods.set(memberName, list)
        }
        return
      }
      this.pos -= 1
      void nameToken
      const declarators = this.declarators(type)
      this.expect(';')
      if (isStatic) {
        this.staticInit.push({
          k: 'decl',
          line: start.line,
          declarators,
          isStatic: false,
        })
      } else {
        for (const declarator of declarators) {
          const field: StructField = {
            name: declarator.name,
            type: declarator.type,
            line: declarator.line,
          }
          if (declarator.init !== undefined) field.init = declarator.init
          def.fields.push(field)
        }
      }
    } finally {
      this.typeParams.pop()
    }
  }

  private addFunction(fn: FunctionDef) {
    const list = this.functions.get(fn.name) ?? []
    list.push(fn)
    this.functions.set(fn.name, list)
  }

  private methodRest(
    name: string,
    returnType: CType,
    line: number,
    owner?: string,
  ): FunctionDef {
    const params = this.parameters()
    while (this.is('[') && this.is(']', 1)) this.pos += 2
    if (this.accept('throws')) {
      do this.type()
      while (this.accept(','))
    }
    if (this.accept(';')) {
      return {
        name: `${name}#abstract`,
        returnType,
        params,
        body: { k: 'block', line, endLine: line, body: [] },
        line,
      }
    }
    const body = this.block()
    const fn: FunctionDef = { name, returnType, params, body, line }
    if (owner !== undefined) fn.owner = owner
    return fn
  }

  private parameters(): Param[] {
    this.expect('(')
    const params: Param[] = []
    if (this.accept(')')) return params
    do {
      this.modifiers()
      let type = this.type()
      const name = this.identifier('a parameter name')
      while (this.is('[') && this.is(']', 1)) {
        this.pos += 2
        type = { k: 'carray', elem: type, size: null }
      }
      params.push({ name, type, isRef: false })
    } while (this.accept(','))
    this.expect(')')
    return params
  }

  private declarators(base: CType): Declarator[] {
    const result: Declarator[] = []
    do {
      const at = this.peek()
      const name = this.identifier('a variable name')
      let type = base
      // int a[] = ...
      while (this.is('[') && this.is(']', 1)) {
        this.pos += 2
        type = { k: 'carray', elem: type, size: null }
      }
      const declarator: Declarator = { name, type, isRef: false, line: at.line }
      if (this.accept('=')) {
        if (this.is('{')) {
          declarator.init = { form: 'list', items: this.arrayItems() }
        } else {
          declarator.init = { form: 'assign', expr: this.expression() }
        }
      }
      result.push(declarator)
    } while (this.accept(','))
    return result
  }

  // {1, 2, {3, 4}}
  private arrayItems(): Expr[] {
    this.expect('{')
    const items: Expr[] = []
    while (!this.is('}')) {
      items.push(this.is('{') ? this.initList() : this.expression())
      if (!this.accept(',')) break
    }
    this.expect('}')
    return items
  }

  private initList(): Expr {
    const line = this.peek().line
    return { k: 'initlist', line, items: this.arrayItems() }
  }

  // ---- statements -------------------------------------------------------------

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
      // label: for (...)
      if (this.is(':', 1) && !this.isTypeWord(token.value)) {
        this.next()
        this.next()
        const inner = this.statement()
        if (
          inner.k === 'for' ||
          inner.k === 'while' ||
          inner.k === 'do' ||
          inner.k === 'rangefor' ||
          inner.k === 'switch'
        ) {
          inner.label = token.value
        }
        return inner
      }
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
          const value = this.expression()
          this.expect(';')
          return { k: 'return', line, value }
        }
        case 'break':
        case 'continue': {
          this.next()
          const label =
            this.peek().kind === 'ident' ? this.next().value : undefined
          this.expect(';')
          const stmt: Stmt =
            token.value === 'break'
              ? { k: 'break', line }
              : { k: 'continue', line }
          if (label !== undefined) stmt.label = label
          return stmt
        }
        case 'throw': {
          this.next()
          const value = this.expression()
          this.expect(';')
          return { k: 'throw', line, value }
        }
        case 'try':
          return this.tryStatement()
        case 'assert': {
          // Java runs with assertions disabled by default.
          while (!this.is(';') && !this.atEnd()) this.next()
          this.expect(';')
          return { k: 'empty', line }
        }
        case 'synchronized': {
          this.next()
          this.expect('(')
          this.expression()
          this.expect(')')
          return this.block()
        }
        case 'class':
          this.unsupported(
            'Local classes are not supported yet. Declare the class at the top level.',
          )
          break
        default:
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

  private tryDeclaration(): (Stmt & { k: 'decl' }) | null {
    if (!this.looksLikeTypeStart()) return null
    const start = this.pos
    const line = this.peek().line
    const type = this.tryType()
    if (
      type === null ||
      this.peek().kind !== 'ident' ||
      this.is('instanceof')
    ) {
      this.pos = start
      return null
    }
    // `a.b(...)` where a looked like a type: not a declaration.
    if (this.is('(', 1) || this.is('.', 1)) {
      this.pos = start
      return null
    }
    const declarators = this.declarators(type)
    return { k: 'decl', line, declarators, isStatic: false }
  }

  private ifStatement(elseIf: boolean): Stmt {
    const at = this.next()
    this.expect('(')
    const textStart = this.pos
    const cond = this.expression()
    const text = this.text(textStart, this.pos)
    this.expect(')')
    const then = this.statement()
    let endLine = this.lastLine()
    this.branches.push({
      line: at.line,
      endLine,
      kind: elseIf ? 'elif' : 'if',
      text,
    })
    let otherwise: Stmt | undefined
    if (this.accept('else')) {
      otherwise = this.is('if') ? this.ifStatement(true) : this.statement()
      endLine = this.lastLine()
    }
    const stmt: Stmt = { k: 'if', line: at.line, endLine, cond, then, elseIf }
    if (otherwise !== undefined) stmt.else = otherwise
    return stmt
  }

  private whileStatement(): Stmt {
    const at = this.next()
    this.expect('(')
    const textStart = this.pos
    const cond = this.expression()
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
    // for (int x : list)
    if (this.looksLikeTypeStart()) {
      const save = this.pos
      const type = this.tryType()
      if (type !== null && this.peek().kind === 'ident' && this.is(':', 1)) {
        const name = this.next().value
        this.next()
        const iterable = this.expression()
        const text = this.text(textStart, this.pos)
        this.expect(')')
        const body = this.statement()
        const endLine = this.lastLine()
        this.branches.push({ line: at.line, endLine, kind: 'for', text })
        return {
          k: 'rangefor',
          line: at.line,
          endLine,
          type,
          isRef: false,
          name,
          iterable,
          body,
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
      let values: Expr[] | null = null
      if (this.accept('case')) {
        values = [this.ternary()]
        while (this.accept(',')) values.push(this.ternary())
      } else if (!this.accept('default')) {
        const current = cases.at(-1)
        if (current === undefined) this.fail('Expected case or default.')
        current.body.push(this.statement())
        continue
      }
      if (this.accept('->')) {
        // Arrow cases never fall through.
        const body: Stmt[] = []
        if (this.is('{')) body.push(this.block())
        else if (this.is('throw')) body.push(this.statement())
        else {
          const expr = this.expression()
          this.expect(';')
          body.push({ k: 'expr', line: label.line, expr })
        }
        body.push({ k: 'break', line: this.lastLine() })
        cases.push({ values, line: label.line, body })
        continue
      }
      this.expect(':')
      cases.push({ values, line: label.line, body: [] })
    }
    const endLine = this.lastLine()
    this.branches.push({ line: at.line, endLine, kind: 'switch', text })
    return { k: 'switch', line: at.line, endLine, value, cases }
  }

  private tryStatement(): Stmt {
    const at = this.next()
    const resources: Stmt[] = []
    if (this.accept('(')) {
      while (!this.accept(')')) {
        const declaration = this.tryDeclaration()
        if (declaration === null) this.fail('Expected a resource declaration.')
        resources.push(declaration)
        this.accept(';')
      }
    }
    const inner = this.block()
    const block: Stmt & { k: 'block' } =
      resources.length === 0
        ? inner
        : { ...inner, body: [...resources, ...inner.body] }
    const catches: (Stmt & { k: 'try' })['catches'] = []
    while (this.is('catch')) {
      const catchToken = this.next()
      this.expect('(')
      this.modifiers()
      const types = [this.qualifiedName()]
      while (this.accept('|')) types.push(this.qualifiedName())
      const name = this.identifier('an exception variable')
      this.expect(')')
      catches.push({ types, name, line: catchToken.line, body: this.block() })
    }
    const stmt: Stmt = { k: 'try', line: at.line, block, catches }
    if (this.accept('finally')) stmt.finally = this.block()
    if (
      catches.length === 0 &&
      stmt.finally === undefined &&
      resources.length === 0
    ) {
      this.fail('try needs a catch or finally block.', at)
    }
    return stmt
  }

  private qualifiedName(): string {
    let name = this.identifier('a type')
    while (this.accept('.')) name = this.identifier('a type')
    return name
  }

  // ---- expressions --------------------------------------------------------------

  expression(): Expr {
    return this.assignment()
  }

  private assignment(): Expr {
    const lambda = this.tryLambda()
    if (lambda !== null) return lambda
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

  private tryLambda(): Expr | null {
    const token = this.peek()
    let params: Param[] | null = null
    const start = this.pos
    if (token.kind === 'ident' && this.is('->', 1)) {
      this.pos += 2
      params = [{ name: token.value, type: T.auto, isRef: false }]
    } else if (token.value === '(' && token.kind === 'punct') {
      // Find the matching ) and check for ->.
      let depth = 0
      let j = this.pos
      for (; j < this.tokens.length; j += 1) {
        const current = this.tokens[j]
        if (current.value === '(') depth += 1
        if (current.value === ')') {
          depth -= 1
          if (depth === 0) break
        }
      }
      if (this.tokens[j + 1]?.value !== '->') return null
      this.next()
      params = []
      while (!this.accept(')')) {
        this.modifiers()
        // (a, b) or (int a, int b)
        let type: CType = T.auto
        if (this.peek(1).kind === 'ident' && !this.is(',', 1)) {
          type = this.type()
        }
        params.push({
          name: this.identifier('a lambda parameter'),
          type,
          isRef: false,
        })
        this.accept(',')
      }
      this.expect('->')
    }
    if (params === null) {
      this.pos = start
      return null
    }
    let body: Stmt & { k: 'block' }
    if (this.is('{')) {
      body = this.block()
    } else {
      const value = this.expression()
      body = {
        k: 'block',
        line: token.line,
        endLine: this.lastLine(),
        body: [{ k: 'return', line: token.line, value }],
      }
    }
    return {
      k: 'lambda',
      line: token.line,
      fn: {
        name: 'lambda',
        returnType: T.auto,
        params,
        body,
        line: token.line,
      },
      byValue: false,
    }
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
      if (token.kind === 'ident' && token.value === 'instanceof') {
        if ((binaryPrecedence['<'] ?? 0) <= minimum) break
        this.next()
        this.accept('final')
        const type = this.type()
        const bind =
          this.peek().kind === 'ident' && !this.is('instanceof')
            ? this.next().value
            : undefined
        left = {
          k: 'instanceof',
          line: token.line,
          operand: left,
          type,
          ...(bind === undefined ? {} : { bind }),
        }
        continue
      }
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
      if (['!', '~', '-', '+'].includes(token.value)) {
        this.next()
        return { k: 'unary', line, op: token.value, operand: this.unary() }
      }
      if (token.value === '++' || token.value === '--') {
        this.next()
        return { k: 'unary', line, op: token.value, operand: this.unary() }
      }
      if (token.value === '(') {
        const cast = this.tryCast()
        if (cast !== null) return cast
      }
    }
    return this.postfix(this.primary())
  }

  private tryCast(): Expr | null {
    const save = this.pos
    const line = this.next().line
    const first = this.peek()
    if (first.kind !== 'ident' || !this.isTypeWord(first.value)) {
      this.pos = save
      return null
    }
    const type = this.tryType()
    if (type === null || !this.accept(')')) {
      this.pos = save
      return null
    }
    const primitive = first.value in primitiveTypes
    const next = this.peek()
    const startsOperand =
      next.kind === 'ident' ||
      next.kind === 'number' ||
      next.kind === 'string' ||
      next.kind === 'char' ||
      next.value === '(' ||
      next.value === '!' ||
      next.value === '~' ||
      (primitive && (next.value === '-' || next.value === '+'))
    if (!startsOperand) {
      this.pos = save
      return null
    }
    return { k: 'cast', line, type, expr: this.unary() }
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
      if (token.value === '.') {
        this.next()
        // obj.<T>method()
        if (this.is('<')) this.typeArguments()
        const name = this.identifier('a member name')
        if (this.is('(')) {
          expr = {
            k: 'call',
            line: token.line,
            callee: {
              k: 'member',
              line: token.line,
              object: expr,
              name,
              arrow: false,
            },
            args: this.callArgs(),
          }
        } else {
          expr = {
            k: 'member',
            line: token.line,
            object: expr,
            name,
            arrow: false,
          }
        }
        continue
      }
      if (token.value === '::') {
        this.next()
        const name = this.is('new')
          ? this.next().value
          : this.identifier('a method name')
        const target =
          expr.k === 'ident' ? expr.name : expr.k === 'this' ? 'this' : 'value'
        expr = { k: 'methodref', line: token.line, target, name }
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
      do args.push(this.expression())
      while (this.accept(','))
    }
    this.expect(')')
    return args
  }

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
        return javaNumber(token)
      case 'char':
        this.next()
        return { k: 'char', line, value: token.value.charCodeAt(0) || 0 }
      case 'string':
        this.next()
        return { k: 'string', line, value: token.value }
      case 'punct':
        if (token.value === '(') {
          this.next()
          const expr = this.expression()
          this.expect(')')
          return expr
        }
        return this.fail(`Unexpected ${this.describe(token)}.`)
      case 'ident':
        return this.identifierExpression()
      default:
        return this.fail(`Unexpected ${this.describe(token)}.`)
    }
  }

  private identifierExpression(): Expr {
    const token = this.next()
    const line = token.line
    const word = token.value
    switch (word) {
      case 'true':
      case 'false':
        return { k: 'bool', line, value: word === 'true' }
      case 'null':
        return { k: 'null', line }
      case 'this':
        if (this.is('(')) {
          return {
            k: 'call',
            line,
            callee: { k: 'this', line },
            args: this.callArgs(),
          }
        }
        return { k: 'this', line }
      case 'super': {
        const owner = this.classStack.at(-1) ?? ''
        const parent = this.parents.get(owner)
        if (this.is('(')) {
          const args = this.callArgs()
          // super() of Object or an exception class does nothing visible.
          if (parent === undefined) return { k: 'bool', line, value: true }
          return {
            k: 'call',
            line,
            callee: { k: 'scoped', line, scope: '$super', name: parent },
            args,
          }
        }
        this.expect('.')
        const member = this.identifier('a member name')
        if (this.is('(')) {
          if (parent === undefined) {
            if (['toString', 'hashCode', 'equals'].includes(member)) {
              return {
                k: 'call',
                line,
                callee: { k: 'scoped', line, scope: '$object', name: member },
                args: this.callArgs(),
              }
            }
            this.unsupported(`super.${member}() needs a parent class.`)
          }
          return {
            k: 'call',
            line,
            callee: {
              k: 'scoped',
              line,
              scope: `$super.${parent}`,
              name: member,
            },
            args: this.callArgs(),
          }
        }
        return {
          k: 'member',
          line,
          object: { k: 'this', line },
          name: member,
          arrow: false,
        }
      }
      case 'new':
        return this.newExpression(line)
      default:
        break
    }
    // Static access: Math.max, Integer.MAX_VALUE, Main.helper, System.out
    if (
      this.is('.') &&
      this.peek(1).kind === 'ident' &&
      (staticClasses.has(word) || this.classNames.has(word))
    ) {
      // Map.Entry<...> e = ... is handled as a type before reaching here.
      this.next()
      if (this.is('<')) this.typeArguments()
      const name = this.identifier()
      const scoped: Expr = { k: 'scoped', line, scope: word, name }
      if (this.is('('))
        return { k: 'call', line, callee: scoped, args: this.callArgs() }
      return scoped
    }
    if (this.is('(')) {
      return {
        k: 'call',
        line,
        callee: { k: 'ident', line, name: word },
        args: this.callArgs(),
      }
    }
    return { k: 'ident', line, name: word }
  }

  private newExpression(line: number): Expr {
    // Element type without array brackets.
    const typeToken = this.peek()
    if (typeToken.kind !== 'ident') this.fail('Expected a type after new.')
    let base: CType
    const name = typeToken.value
    this.next()
    let qualified = name
    while (this.is('.') && this.peek(1).kind === 'ident') {
      this.next()
      qualified = this.next().value
    }
    let args: CType[] = []
    if (this.is('<')) args = this.typeArguments()
    base = this.namedType(qualified, args)
    if (
      !this.isTypeWord(qualified) &&
      !(qualified in primitiveTypes) &&
      base.k === 'jclass'
    ) {
      base = { k: 'jclass', name: qualified }
    }
    if (this.is('[')) {
      const dims: Expr[] = []
      let extraDims = 0
      while (this.is('[')) {
        this.next()
        if (this.accept(']')) {
          extraDims += 1
          continue
        }
        if (extraDims > 0) this.fail('Array dimensions must come before []s.')
        dims.push(this.expression())
        this.expect(']')
      }
      const expr: Expr = { k: 'newarray', line, elem: base, dims, extraDims }
      if (this.is('{')) {
        if (dims.length > 0)
          this.fail('An array with sizes cannot also have an initializer.')
        expr.init = this.initList()
      }
      return expr
    }
    const callArgs = this.callArgs()
    if (this.is('{')) {
      // Anonymous class: new Comparator<int[]>() { public int compare(...) }
      this.anonymous += 1
      const anonymousName = `${qualified}$${this.anonymous}`
      this.classNames.add(anonymousName)
      const def = this.classBody(anonymousName, line)
      return {
        k: 'new',
        line,
        type: { k: 'struct', name: def.name },
        args: callArgs,
        braced: false,
      }
    }
    return {
      k: 'new',
      line,
      type: base,
      args: callArgs,
      braced: false,
      className: qualified,
    }
  }
}

function javaNumber(token: Token): Expr {
  const raw = token.value
  const line = token.line
  const lower = raw.toLowerCase()
  const isHex = lower.startsWith('0x')
  const isBinary = lower.startsWith('0b')
  const isFloat =
    !isHex && !isBinary && (/[.e]/.test(lower) || /[fd]$/.test(lower))
  if (isFloat) {
    const body = lower.replace(/[fd]$/, '')
    return {
      k: 'float',
      line,
      value: Number(body),
      type: lower.endsWith('f') ? T.float : T.double,
    }
  }
  const long = lower.endsWith('l')
  const digits = long ? lower.slice(0, -1) : lower
  let value: bigint
  try {
    if (isHex || isBinary) value = BigInt(digits)
    else if (digits.length > 1 && digits.startsWith('0'))
      value = BigInt(`0o${digits.slice(1)}`)
    else value = BigInt(digits)
  } catch {
    throw new CppCompileError(`Invalid number ${raw}.`, line, token.col)
  }
  const decimal =
    !isHex && !isBinary && !(digits.length > 1 && digits.startsWith('0'))
  if (long) {
    return { k: 'int', line, value: BigInt.asIntN(64, value), type: T.ll }
  }
  if (decimal && value > 2147483648n) {
    throw new CppCompileError(
      `integer number too large: ${raw} (add L for a long literal).`,
      line,
      token.col,
    )
  }
  // 0xFFFFFFFF is the int -1; 2147483648 only appears as -2147483648.
  return {
    k: 'int',
    line,
    value: Number(BigInt.asIntN(32, value)),
    type: T.int,
  }
}
