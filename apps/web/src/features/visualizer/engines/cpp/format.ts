// Number formatting that matches iostream and printf output from glibc.

export function formatFloat(
  x: number,
  mode: 'general' | 'fixed' | 'scientific',
  precision: number,
  upper = false,
): string {
  if (Number.isNaN(x)) return upper ? 'NAN' : Object.is(x, NaN) ? 'nan' : 'nan'
  if (!Number.isFinite(x)) {
    const text = x < 0 ? '-inf' : 'inf'
    return upper ? text.toUpperCase() : text
  }
  const p = Math.max(0, Math.min(precision, 60))
  if (mode === 'fixed') return toFixed(x, p)
  if (mode === 'scientific') return toScientific(x, p, upper)
  return toGeneral(x, p === 0 ? 1 : p, upper, false)
}

function toFixed(x: number, digits: number): string {
  if (Math.abs(x) < 1e21) {
    const text = x.toFixed(digits)
    // -0.00 prints as -0.00 in C as well; keep the sign.
    return Object.is(x, -0) && !text.startsWith('-') ? `-${text}` : text
  }
  const whole = BigInt(Math.round(x)).toString()
  return digits > 0 ? `${whole}.${'0'.repeat(digits)}` : whole
}

function toScientific(x: number, digits: number, upper: boolean): string {
  const text = x.toExponential(Math.min(digits, 100))
  const [mantissa = '0', exponent = '0'] = text.split('e')
  const sign = exponent.startsWith('-') ? '-' : '+'
  const magnitude = exponent.replace(/^[+-]/, '').padStart(2, '0')
  const result = `${mantissa}e${sign}${magnitude}`
  return upper ? result.toUpperCase() : result
}

// %g: precision is significant digits; trailing zeros are removed unless
// `alternate` (#) is set.
function toGeneral(
  x: number,
  precision: number,
  upper: boolean,
  alternate: boolean,
): string {
  if (x === 0) {
    const zero = alternate ? `0.${'0'.repeat(precision - 1)}` : '0'
    return Object.is(x, -0) ? `-${zero}` : zero
  }
  const exponential = x.toExponential(precision - 1)
  const exponent = Number(exponential.split('e')[1] ?? '0')
  let text: string
  if (exponent < -4 || exponent >= precision) {
    text = toScientific(x, precision - 1, upper)
    if (!alternate) {
      text = text.replace(/\.?0+(e)/i, '$1')
    }
  } else {
    text = x.toFixed(Math.max(0, precision - 1 - exponent))
    if (!alternate && text.includes('.')) {
      text = text.replace(/\.?0+$/, '')
    }
  }
  return text
}

export type PrintfArg = {
  kind: 'int' | 'float' | 'string' | 'char'
  value: number | bigint | string
  unsigned?: boolean
}

// Formats a printf template. Arguments are consumed in order; `%n` is not
// supported.
export function formatPrintf(
  template: string,
  args: readonly PrintfArg[],
): string {
  let output = ''
  let argIndex = 0
  const nextArg = (): PrintfArg | undefined => args[argIndex++]
  for (let i = 0; i < template.length; i += 1) {
    const c = template[i]
    if (c !== '%') {
      output += c
      continue
    }
    const match =
      /^%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d*))?(hh|h|ll|l|L|z|j|t|q)?([diouxXfFeEgGcsp%])/.exec(
        template.slice(i),
      )
    if (match === null) {
      output += c
      continue
    }
    i += match[0].length - 1
    const flags = match[1] ?? ''
    let width = 0
    if (match[2] === '*') width = Number(nextArg()?.value ?? 0)
    else if (match[2] !== undefined) width = Number(match[2])
    let precision: number | undefined
    if (match[3] !== undefined) {
      precision =
        match[3] === '*'
          ? Number(nextArg()?.value ?? 0)
          : Number(match[3] || '0')
    }
    const conversion = match[5] ?? ''
    if (conversion === '%') {
      output += '%'
      continue
    }
    const arg = nextArg()
    let body = ''
    let numericSign = ''
    switch (conversion) {
      case 'd':
      case 'i':
      case 'u': {
        let value = toBig(arg)
        if (conversion === 'u' && value < 0n) {
          value = BigInt.asUintN(
            match[4] === 'll' || match[4] === 'l' ? 64 : 32,
            value,
          )
        }
        if (value < 0n) {
          numericSign = '-'
          value = -value
        } else if (flags.includes('+')) numericSign = '+'
        else if (flags.includes(' ')) numericSign = ' '
        body = value.toString()
        if (precision !== undefined) body = body.padStart(precision, '0')
        break
      }
      case 'o':
      case 'x':
      case 'X': {
        let value = toBig(arg)
        if (value < 0n) {
          value = BigInt.asUintN(
            match[4] === 'll' || match[4] === 'l' ? 64 : 32,
            value,
          )
        }
        body = value.toString(conversion === 'o' ? 8 : 16)
        if (conversion === 'X') body = body.toUpperCase()
        if (flags.includes('#') && value !== 0n) {
          body =
            (conversion === 'o' ? '0' : conversion === 'x' ? '0x' : '0X') + body
        }
        break
      }
      case 'f':
      case 'F':
      case 'e':
      case 'E':
      case 'g':
      case 'G': {
        const value = Number(arg?.kind === 'string' ? 0 : (arg?.value ?? 0))
        const p = precision ?? 6
        const upper =
          conversion === 'E' || conversion === 'G' || conversion === 'F'
        body =
          conversion === 'f' || conversion === 'F'
            ? formatFloat(Math.abs(value), 'fixed', p, upper)
            : conversion === 'e' || conversion === 'E'
              ? formatFloat(Math.abs(value), 'scientific', p, upper)
              : toGeneral(
                  Math.abs(value),
                  p === 0 ? 1 : p,
                  upper,
                  flags.includes('#'),
                )
        if (value < 0 || Object.is(value, -0)) numericSign = '-'
        else if (flags.includes('+')) numericSign = '+'
        else if (flags.includes(' ')) numericSign = ' '
        break
      }
      case 'c':
        body =
          arg?.kind === 'string'
            ? String(arg.value).slice(0, 1)
            : String.fromCharCode(Number(arg?.value ?? 0) & 0xff)
        break
      case 's': {
        body = arg === undefined ? '(null)' : String(arg.value)
        if (precision !== undefined) body = body.slice(0, precision)
        break
      }
      case 'p':
        body = '0x0'
        break
    }
    const content = numericSign + body
    if (content.length >= width) {
      output += content
    } else if (flags.includes('-')) {
      output += content.padEnd(width, ' ')
    } else if (
      flags.includes('0') &&
      !'csp'.includes(conversion) &&
      precision === undefined
    ) {
      output += numericSign + body.padStart(width - numericSign.length, '0')
    } else if (flags.includes('0') && 'fFeEgG'.includes(conversion)) {
      output += numericSign + body.padStart(width - numericSign.length, '0')
    } else {
      output += content.padStart(width, ' ')
    }
  }
  return output
}

function toBig(arg: PrintfArg | undefined): bigint {
  if (arg === undefined) return 0n
  if (typeof arg.value === 'bigint') return arg.value
  if (typeof arg.value === 'number') return BigInt(Math.trunc(arg.value))
  return 0n
}
