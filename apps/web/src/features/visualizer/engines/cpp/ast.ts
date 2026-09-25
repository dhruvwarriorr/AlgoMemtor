import type { CType } from './types'
import type { Ref } from './values'

// Every node carries the source line it starts on.

export type Expr =
  | { k: 'int'; line: number; value: number | bigint; type: CType }
  | { k: 'float'; line: number; value: number; type: CType }
  | { k: 'char'; line: number; value: number }
  | { k: 'string'; line: number; value: string }
  | { k: 'bool'; line: number; value: boolean }
  | { k: 'null'; line: number }
  | { k: 'ident'; line: number; name: string }
  | { k: 'this'; line: number }
  | { k: 'binary'; line: number; op: string; left: Expr; right: Expr }
  | { k: 'logical'; line: number; op: '&&' | '||'; left: Expr; right: Expr }
  | { k: 'assign'; line: number; op: string; target: Expr; value: Expr }
  | { k: 'unary'; line: number; op: string; operand: Expr }
  | { k: 'postfix'; line: number; op: '++' | '--'; operand: Expr }
  | { k: 'ternary'; line: number; cond: Expr; yes: Expr; no: Expr }
  | { k: 'comma'; line: number; left: Expr; right: Expr }
  | {
      k: 'call'
      line: number
      callee: Expr
      args: Expr[]
      // Explicit template arguments, e.g. get<0>(t) or max<long long>(a, b).
      templateArgs?: (CType | Expr)[]
    }
  | { k: 'member'; line: number; object: Expr; name: string; arrow: boolean }
  | { k: 'index'; line: number; object: Expr; index: Expr }
  | { k: 'cast'; line: number; type: CType; expr: Expr }
  | { k: 'construct'; line: number; type: CType; args: Expr[]; braced: boolean }
  | { k: 'initlist'; line: number; items: Expr[] }
  | { k: 'lambda'; line: number; fn: FunctionDef; byValue: boolean }
  | { k: 'sizeof'; line: number; type?: CType; expr?: Expr }
  // Qualified names such as numeric_limits<int>::max or string::npos.
  | { k: 'scoped'; line: number; scope: string; name: string; type?: CType }
  // An already evaluated operand (used when calls are evaluated first).
  | { k: 'preval'; line: number; ref: Ref }

export type Declarator = {
  name: string
  type: CType
  isRef: boolean
  line: number
  // `= expr`, `(args)` or `{items}`.
  init?:
    | { form: 'assign'; expr: Expr }
    | { form: 'ctor'; args: Expr[] }
    | { form: 'list'; items: Expr[] }
  // C array dimensions to evaluate at run time: int a[n][m].
  dims?: (Expr | null)[]
}

export type Stmt =
  | { k: 'block'; line: number; endLine: number; body: Stmt[] }
  | {
      k: 'decl'
      line: number
      declarators: Declarator[]
      isStatic: boolean
    }
  | {
      k: 'binding'
      line: number
      names: string[]
      isRef: boolean
      init: Expr
    }
  | { k: 'expr'; line: number; expr: Expr }
  | {
      k: 'if'
      line: number
      endLine: number
      init?: Stmt
      cond: Expr | Stmt
      then: Stmt
      else?: Stmt
      elseIf: boolean
    }
  | { k: 'while'; line: number; endLine: number; cond: Expr | Stmt; body: Stmt }
  | {
      k: 'do'
      line: number
      endLine: number
      whileLine: number
      cond: Expr
      body: Stmt
    }
  | {
      k: 'for'
      line: number
      endLine: number
      init?: Stmt
      cond?: Expr
      update?: Expr
      body: Stmt
    }
  | {
      k: 'rangefor'
      line: number
      endLine: number
      // A single variable or a structured binding.
      name?: string
      names?: string[]
      type: CType
      isRef: boolean
      iterable: Expr
      body: Stmt
    }
  | { k: 'return'; line: number; value?: Expr }
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number }
  | {
      k: 'switch'
      line: number
      endLine: number
      value: Expr
      cases: { values: Expr[] | null; line: number; body: Stmt[] }[]
    }
  | { k: 'empty'; line: number }
  | { k: 'local-struct'; line: number; def: StructDef }

export type Param = {
  name: string
  type: CType
  isRef: boolean
  defaultValue?: Expr
}

export type FunctionDef = {
  name: string
  returnType: CType
  params: Param[]
  body: Stmt & { k: 'block' }
  line: number
  // Methods run with the struct instance as `this`.
  owner?: string
  isCtor?: boolean
  // Constructor member initializers: `: a(x), b(y)`.
  inits?: { name: string; args: Expr[]; line: number }[]
}

export type StructField = {
  name: string
  type: CType
  init?: Declarator['init']
  dims?: (Expr | null)[]
  line: number
}

export type StructDef = {
  name: string
  fields: StructField[]
  methods: Map<string, FunctionDef[]>
  ctors: FunctionDef[]
  line: number
}

export type Program = {
  // Global declarations in source order (run before main).
  globals: (Stmt & { k: 'decl' })[]
  functions: Map<string, FunctionDef[]>
  structs: Map<string, StructDef>
  // Branch/loop headers for the trace.
  branches: {
    line: number
    endLine: number
    kind: 'if' | 'elif' | 'while' | 'for' | 'do' | 'switch'
    text: string
  }[]
  // Array name -> index identifiers used with it.
  indexHints: Record<string, string[]>
}
