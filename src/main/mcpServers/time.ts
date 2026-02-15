// Time MCP Server - provides current time, timezone conversion, and date calculations

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const GET_CURRENT_TIME_TOOL: Tool = {
  name: 'get_current_time',
  description:
    'Get the current date and time. Returns ISO 8601 formatted time with timezone info, ' +
    'Unix timestamp, and human-readable format. Optionally specify a timezone.',
  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description:
          'IANA timezone name (e.g. "Asia/Shanghai", "America/New_York", "Europe/London"). ' +
          'Defaults to the system local timezone if not specified.'
      },
      format: {
        type: 'string',
        enum: ['iso', 'unix', 'human', 'all'],
        description:
          'Output format: "iso" for ISO 8601, "unix" for timestamp, "human" for readable, "all" for everything. Default: "all"',
        default: 'all'
      }
    },
    required: []
  }
}

const CONVERT_TIMEZONE_TOOL: Tool = {
  name: 'convert_timezone',
  description:
    'Convert a date/time from one timezone to another. ' + 'Accepts ISO 8601 format or common date string formats.',
  inputSchema: {
    type: 'object',
    properties: {
      datetime: {
        type: 'string',
        description: 'The date/time string to convert (ISO 8601 or common formats like "2024-01-15 14:30:00")'
      },
      from_timezone: {
        type: 'string',
        description: 'Source IANA timezone (e.g. "Asia/Shanghai"). Defaults to UTC.'
      },
      to_timezone: {
        type: 'string',
        description: 'Target IANA timezone (e.g. "America/New_York")'
      }
    },
    required: ['datetime', 'to_timezone']
  }
}

const DATE_CALCULATE_TOOL: Tool = {
  name: 'date_calculate',
  description:
    'Calculate date differences or add/subtract time from a date. ' +
    'Can compute the difference between two dates or add a duration to a date.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['diff', 'add', 'subtract'],
        description: '"diff" to calculate difference between two dates, "add" or "subtract" to modify a date'
      },
      date1: {
        type: 'string',
        description: 'The first/base date (ISO 8601 or common format)'
      },
      date2: {
        type: 'string',
        description: 'The second date (only for "diff" operation)'
      },
      amount: {
        type: 'number',
        description: 'Amount to add/subtract (only for "add"/"subtract" operations)'
      },
      unit: {
        type: 'string',
        enum: ['years', 'months', 'days', 'hours', 'minutes', 'seconds'],
        description: 'Unit for the amount (only for "add"/"subtract" operations)',
        default: 'days'
      }
    },
    required: ['operation', 'date1']
  }
}

function formatTime(date: Date, timezone?: string, format: string = 'all'): string {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long'
  }

  const isoStr = date.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T')
  const humanStr = date.toLocaleString('en-US', options)
  const unixTs = Math.floor(date.getTime() / 1000)

  switch (format) {
    case 'iso':
      return isoStr
    case 'unix':
      return String(unixTs)
    case 'human':
      return humanStr
    case 'all':
    default:
      return [
        `Timezone: ${tz}`,
        `ISO 8601: ${isoStr}`,
        `Unix Timestamp: ${unixTs}`,
        `Human Readable: ${humanStr}`
      ].join('\n')
  }
}

function dateDiff(d1: Date, d2: Date): string {
  const diffMs = Math.abs(d2.getTime() - d1.getTime())
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  const years = Math.floor(diffDays / 365.25)
  const months = Math.floor((diffDays % 365.25) / 30.44)
  const days = Math.floor(diffDays % 30.44)

  return [
    `Total milliseconds: ${diffMs}`,
    `Total seconds: ${diffSeconds}`,
    `Total minutes: ${diffMinutes}`,
    `Total hours: ${diffHours}`,
    `Total days: ${diffDays}`,
    `Approximate: ${years} years, ${months} months, ${days} days`
  ].join('\n')
}

function dateAdd(date: Date, amount: number, unit: string): Date {
  const result = new Date(date)
  switch (unit) {
    case 'years':
      result.setFullYear(result.getFullYear() + amount)
      break
    case 'months':
      result.setMonth(result.getMonth() + amount)
      break
    case 'days':
      result.setDate(result.getDate() + amount)
      break
    case 'hours':
      result.setHours(result.getHours() + amount)
      break
    case 'minutes':
      result.setMinutes(result.getMinutes() + amount)
      break
    case 'seconds':
      result.setSeconds(result.getSeconds() + amount)
      break
  }
  return result
}

class TimeServer {
  public server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'time-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
    this.initialize()
  }

  private initialize() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [GET_CURRENT_TIME_TOOL, CONVERT_TIMEZONE_TOOL, DATE_CALCULATE_TOOL]
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params

        if (!args) {
          throw new Error('No arguments provided')
        }

        switch (name) {
          case 'get_current_time': {
            const { timezone, format = 'all' } = args as { timezone?: string; format?: string }
            const result = formatTime(new Date(), timezone, format)
            return { content: [{ type: 'text', text: result }], isError: false }
          }

          case 'convert_timezone': {
            const {
              datetime,
              from_timezone = 'UTC',
              to_timezone
            } = args as {
              datetime: string
              from_timezone?: string
              to_timezone: string
            }
            // Parse the date in the source timezone context
            const date = new Date(datetime)
            if (isNaN(date.getTime())) {
              throw new Error(`Invalid date format: ${datetime}`)
            }
            const fromStr = formatTime(date, from_timezone, 'all')
            const toStr = formatTime(date, to_timezone, 'all')
            const result = `From:\n${fromStr}\n\nTo:\n${toStr}`
            return { content: [{ type: 'text', text: result }], isError: false }
          }

          case 'date_calculate': {
            const {
              operation,
              date1,
              date2,
              amount,
              unit = 'days'
            } = args as {
              operation: string
              date1: string
              date2?: string
              amount?: number
              unit?: string
            }
            const d1 = new Date(date1)
            if (isNaN(d1.getTime())) {
              throw new Error(`Invalid date format: ${date1}`)
            }

            if (operation === 'diff') {
              if (!date2) throw new Error('"date2" is required for diff operation')
              const d2 = new Date(date2)
              if (isNaN(d2.getTime())) {
                throw new Error(`Invalid date format: ${date2}`)
              }
              const result = dateDiff(d1, d2)
              return { content: [{ type: 'text', text: result }], isError: false }
            }

            if (operation === 'add' || operation === 'subtract') {
              if (amount === undefined) throw new Error('"amount" is required for add/subtract operation')
              const multiplier = operation === 'subtract' ? -1 : 1
              const resultDate = dateAdd(d1, amount * multiplier, unit)
              const result = `Original: ${d1.toISOString()}\nResult: ${resultDate.toISOString()}`
              return { content: [{ type: 'text', text: result }], isError: false }
            }

            throw new Error(`Unknown operation: ${operation}`)
          }

          default:
            return {
              content: [{ type: 'text', text: `Unknown tool: ${name}` }],
              isError: true
            }
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        }
      }
    })
  }
}

export default TimeServer
