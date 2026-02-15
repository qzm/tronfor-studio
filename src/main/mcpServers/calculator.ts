// Calculator MCP Server - precise mathematical calculations

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'

class CalculatorServer {
  public server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'calculator-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
    this.setupRequestHandlers()
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'calculate',
          description:
            'Evaluate a mathematical expression with high precision. Supports basic arithmetic (+, -, *, /, %), ' +
            'power (**), parentheses, and common math functions (sqrt, abs, ceil, floor, round, sin, cos, tan, log, log2, log10, exp, PI, E). ' +
            'Use this instead of mental math for accurate results.',
          inputSchema: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description:
                  'Mathematical expression to evaluate. Examples: "2 + 3 * 4", "sqrt(144)", "sin(PI / 2)", "(1 + 0.05) ** 12"'
              }
            },
            required: ['expression']
          }
        },
        {
          name: 'unit_convert',
          description:
            'Convert values between common units. Supports length, weight, temperature, area, volume, speed, data, and time units.',
          inputSchema: {
            type: 'object',
            properties: {
              value: {
                type: 'number',
                description: 'The numeric value to convert'
              },
              from_unit: {
                type: 'string',
                description:
                  'Source unit. Examples: "km", "mi", "kg", "lb", "celsius", "fahrenheit", "GB", "MB", "m2", "ft2"'
              },
              to_unit: {
                type: 'string',
                description: 'Target unit'
              }
            },
            required: ['value', 'from_unit', 'to_unit']
          }
        },
        {
          name: 'statistics',
          description:
            'Calculate statistical measures for a dataset: mean, median, mode, standard deviation, variance, min, max, range, sum, count, percentiles.',
          inputSchema: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { type: 'number' },
                description: 'Array of numbers to analyze'
              },
              measures: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['mean', 'median', 'mode', 'stddev', 'variance', 'min', 'max', 'range', 'sum', 'count', 'p25', 'p75', 'p90', 'p95', 'p99']
                },
                description: 'Which statistical measures to calculate. Defaults to all if not specified.'
              }
            },
            required: ['data']
          }
        },
        {
          name: 'number_base_convert',
          description: 'Convert numbers between different bases (binary, octal, decimal, hexadecimal).',
          inputSchema: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                description: 'The number to convert (as string, e.g. "FF" for hex, "1010" for binary)'
              },
              from_base: {
                type: 'number',
                description: 'Source base (2, 8, 10, 16)',
                default: 10
              },
              to_base: {
                type: 'number',
                description: 'Target base (2, 8, 10, 16)',
                default: 16
              }
            },
            required: ['value']
          }
        }
      ]
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'calculate':
          return this.calculate(args as { expression: string })
        case 'unit_convert':
          return this.unitConvert(args as { value: number; from_unit: string; to_unit: string })
        case 'statistics':
          return this.statistics(args as { data: number[]; measures?: string[] })
        case 'number_base_convert':
          return this.baseConvert(args as { value: string; from_base?: number; to_base?: number })
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`)
      }
    })
  }

  private calculate(args: { expression: string }) {
    const { expression } = args
    if (!expression || typeof expression !== 'string') {
      return { content: [{ type: 'text', text: 'Error: expression is required' }], isError: true }
    }

    try {
      const result = safeEval(expression)
      return {
        content: [{ type: 'text', text: `${expression} = ${result}` }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error evaluating "${expression}": ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      }
    }
  }

  private unitConvert(args: { value: number; from_unit: string; to_unit: string }) {
    const { value, from_unit, to_unit } = args

    try {
      const result = convertUnit(value, from_unit.toLowerCase(), to_unit.toLowerCase())
      return {
        content: [{ type: 'text', text: `${value} ${from_unit} = ${result} ${to_unit}` }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      }
    }
  }

  private statistics(args: { data: number[]; measures?: string[] }) {
    const { data, measures } = args

    if (!data || !Array.isArray(data) || data.length === 0) {
      return { content: [{ type: 'text', text: 'Error: data must be a non-empty array of numbers' }], isError: true }
    }

    const sorted = [...data].sort((a, b) => a - b)
    const n = data.length
    const sum = data.reduce((a, b) => a + b, 0)
    const mean = sum / n

    const allMeasures = measures || ['count', 'sum', 'mean', 'median', 'mode', 'min', 'max', 'range', 'stddev', 'variance']

    const results: string[] = []

    for (const m of allMeasures) {
      switch (m) {
        case 'count':
          results.push(`Count: ${n}`)
          break
        case 'sum':
          results.push(`Sum: ${sum}`)
          break
        case 'mean':
          results.push(`Mean: ${mean}`)
          break
        case 'median': {
          const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]
          results.push(`Median: ${median}`)
          break
        }
        case 'mode': {
          const freq = new Map<number, number>()
          data.forEach((v) => freq.set(v, (freq.get(v) || 0) + 1))
          const maxFreq = Math.max(...freq.values())
          const modes = [...freq.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v)
          results.push(`Mode: ${modes.join(', ')} (frequency: ${maxFreq})`)
          break
        }
        case 'min':
          results.push(`Min: ${sorted[0]}`)
          break
        case 'max':
          results.push(`Max: ${sorted[n - 1]}`)
          break
        case 'range':
          results.push(`Range: ${sorted[n - 1] - sorted[0]}`)
          break
        case 'variance': {
          const variance = data.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n
          results.push(`Variance: ${variance}`)
          break
        }
        case 'stddev': {
          const stddev = Math.sqrt(data.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n)
          results.push(`Std Dev: ${stddev}`)
          break
        }
        case 'p25':
          results.push(`P25: ${percentile(sorted, 25)}`)
          break
        case 'p75':
          results.push(`P75: ${percentile(sorted, 75)}`)
          break
        case 'p90':
          results.push(`P90: ${percentile(sorted, 90)}`)
          break
        case 'p95':
          results.push(`P95: ${percentile(sorted, 95)}`)
          break
        case 'p99':
          results.push(`P99: ${percentile(sorted, 99)}`)
          break
      }
    }

    return {
      content: [{ type: 'text', text: results.join('\n') }],
      isError: false
    }
  }

  private baseConvert(args: { value: string; from_base?: number; to_base?: number }) {
    const { value, from_base = 10, to_base = 16 } = args

    try {
      const decimal = parseInt(value, from_base)
      if (isNaN(decimal)) {
        throw new Error(`Invalid number "${value}" for base ${from_base}`)
      }
      const result = decimal.toString(to_base).toUpperCase()

      const baseNames: Record<number, string> = { 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hexadecimal' }
      const fromName = baseNames[from_base] || `Base-${from_base}`
      const toName = baseNames[to_base] || `Base-${to_base}`

      return {
        content: [{ type: 'text', text: `${fromName}: ${value}\n${toName}: ${result}\nDecimal: ${decimal}` }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      }
    }
  }
}

function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

// Safe math expression evaluator - no eval(), only whitelisted operations
function safeEval(expr: string): number {
  // Replace math constants and functions
  let processed = expr
    .replace(/\bPI\b/g, String(Math.PI))
    .replace(/\bE\b/g, String(Math.E))
    .replace(/\bsqrt\s*\(/g, 'Math.sqrt(')
    .replace(/\babs\s*\(/g, 'Math.abs(')
    .replace(/\bceil\s*\(/g, 'Math.ceil(')
    .replace(/\bfloor\s*\(/g, 'Math.floor(')
    .replace(/\bround\s*\(/g, 'Math.round(')
    .replace(/\bsin\s*\(/g, 'Math.sin(')
    .replace(/\bcos\s*\(/g, 'Math.cos(')
    .replace(/\btan\s*\(/g, 'Math.tan(')
    .replace(/\basin\s*\(/g, 'Math.asin(')
    .replace(/\bacos\s*\(/g, 'Math.acos(')
    .replace(/\batan\s*\(/g, 'Math.atan(')
    .replace(/\blog\s*\(/g, 'Math.log(')
    .replace(/\blog2\s*\(/g, 'Math.log2(')
    .replace(/\blog10\s*\(/g, 'Math.log10(')
    .replace(/\bexp\s*\(/g, 'Math.exp(')
    .replace(/\bpow\s*\(/g, 'Math.pow(')
    .replace(/\bmin\s*\(/g, 'Math.min(')
    .replace(/\bmax\s*\(/g, 'Math.max(')

  // Validate: only allow numbers, operators, Math functions, parentheses, commas, dots, spaces
  const safePattern = /^[\d\s+\-*/%().^,eE]+$|Math\.(sqrt|abs|ceil|floor|round|sin|cos|tan|asin|acos|atan|log|log2|log10|exp|pow|min|max)\(/
  // Remove all Math.xxx( calls for validation
  const forValidation = processed.replace(/Math\.(sqrt|abs|ceil|floor|round|sin|cos|tan|asin|acos|atan|log|log2|log10|exp|pow|min|max)/g, '')
  if (!/^[\d\s+\-*/%().^,eE]*$/.test(forValidation)) {
    throw new Error('Expression contains disallowed characters')
  }

  // Replace ** with Math.pow for safety (** works in Function constructor too)
  // Use Function constructor instead of eval for slightly better isolation
  const fn = new Function(`"use strict"; return (${processed})`)
  const result = fn()

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error(`Result is not a finite number: ${result}`)
  }

  return result
}

// Unit conversion tables
const LENGTH_TO_METERS: Record<string, number> = {
  mm: 0.001, cm: 0.01, m: 1, km: 1000,
  in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
  nm: 1852, // nautical mile
  // Chinese units
  li: 500, zhang: 3.3333, chi: 0.3333, cun: 0.0333
}

const WEIGHT_TO_KG: Record<string, number> = {
  mg: 0.000001, g: 0.001, kg: 1, t: 1000, // metric ton
  oz: 0.0283495, lb: 0.453592, st: 6.35029,
  // Chinese units
  jin: 0.5, liang: 0.05
}

const AREA_TO_M2: Record<string, number> = {
  mm2: 0.000001, cm2: 0.0001, m2: 1, km2: 1000000,
  ha: 10000, // hectare
  in2: 0.00064516, ft2: 0.092903, yd2: 0.836127, acre: 4046.86, mi2: 2589988.11,
  mu: 666.667 // 亩
}

const VOLUME_TO_L: Record<string, number> = {
  ml: 0.001, l: 1, m3: 1000,
  'fl oz': 0.0295735, cup: 0.236588, pt: 0.473176, qt: 0.946353, gal: 3.78541
}

const SPEED_TO_MS: Record<string, number> = {
  'km/h': 0.277778, 'kmh': 0.277778,
  'm/s': 1, 'ms': 1,
  'mph': 0.44704, 'mi/h': 0.44704,
  'knot': 0.514444, 'kn': 0.514444
}

const DATA_TO_BYTES: Record<string, number> = {
  b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, pb: 1024 ** 5
}

const TIME_TO_SECONDS: Record<string, number> = {
  ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000
}

function convertUnit(value: number, from: string, to: string): number {
  // Temperature - special case
  if (isTemperatureUnit(from) && isTemperatureUnit(to)) {
    return convertTemperature(value, from, to)
  }

  // Try each category
  const categories: [Record<string, number>, string][] = [
    [LENGTH_TO_METERS, 'length'],
    [WEIGHT_TO_KG, 'weight'],
    [AREA_TO_M2, 'area'],
    [VOLUME_TO_L, 'volume'],
    [SPEED_TO_MS, 'speed'],
    [DATA_TO_BYTES, 'data'],
    [TIME_TO_SECONDS, 'time']
  ]

  for (const [table] of categories) {
    if (from in table && to in table) {
      return (value * table[from]) / table[to]
    }
  }

  throw new Error(`Cannot convert from "${from}" to "${to}". Units must be of the same category.`)
}

function isTemperatureUnit(unit: string): boolean {
  return ['celsius', 'c', 'fahrenheit', 'f', 'kelvin', 'k'].includes(unit)
}

function convertTemperature(value: number, from: string, to: string): number {
  // Normalize to celsius first
  let celsius: number
  switch (from) {
    case 'celsius': case 'c': celsius = value; break
    case 'fahrenheit': case 'f': celsius = (value - 32) * 5 / 9; break
    case 'kelvin': case 'k': celsius = value - 273.15; break
    default: throw new Error(`Unknown temperature unit: ${from}`)
  }

  switch (to) {
    case 'celsius': case 'c': return celsius
    case 'fahrenheit': case 'f': return celsius * 9 / 5 + 32
    case 'kelvin': case 'k': return celsius + 273.15
    default: throw new Error(`Unknown temperature unit: ${to}`)
  }
}

export default CalculatorServer
