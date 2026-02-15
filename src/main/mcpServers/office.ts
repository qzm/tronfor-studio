// Office MCP Server - Read/create Word, Excel, CSV, and other office documents

import { loggerService } from '@logger'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs/promises'
import path from 'path'

const logger = loggerService.withContext('MCPServer:Office')

class OfficeServer {
  public server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'office-server',
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
          name: 'read_document',
          description:
            'Read and extract text content from office documents. Supports: ' +
            'Word (.docx, .doc), Excel (.xlsx, .xls), PowerPoint (.pptx, .ppt), ' +
            'CSV (.csv), and plain text files (.txt, .md, .json, .xml, .yaml, .yml). ' +
            'Uses officeparser for broad format support.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the document file'
              },
              max_chars: {
                type: 'number',
                description: 'Maximum characters to return. Default: 200000',
                default: 200000
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'read_excel',
          description:
            'Read an Excel file (.xlsx, .xls) with structured output. ' +
            'Returns data as formatted tables or JSON. Supports selecting specific sheets.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the Excel file'
              },
              sheet_name: {
                type: 'string',
                description: 'Specific sheet name to read. Defaults to first sheet.'
              },
              output_format: {
                type: 'string',
                enum: ['table', 'json', 'csv'],
                description:
                  'Output format: "table" for markdown table, "json" for JSON array, "csv" for CSV text. Default: "table"',
                default: 'table'
              },
              header_row: {
                type: 'number',
                description: 'Row number to use as headers (1-based). Default: 1',
                default: 1
              },
              max_rows: {
                type: 'number',
                description: 'Maximum number of rows to return. Default: 1000',
                default: 1000
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'create_excel',
          description:
            'Create a new Excel file from structured data. Provide headers and rows to create a formatted spreadsheet.',
          inputSchema: {
            type: 'object',
            properties: {
              output_path: {
                type: 'string',
                description: 'Absolute path for the output Excel file (.xlsx)'
              },
              sheet_name: {
                type: 'string',
                description: 'Sheet name. Default: "Sheet1"',
                default: 'Sheet1'
              },
              headers: {
                type: 'array',
                items: { type: 'string' },
                description: 'Column headers'
              },
              rows: {
                type: 'array',
                items: {
                  type: 'array',
                  items: {}
                },
                description: 'Data rows (array of arrays)'
              }
            },
            required: ['output_path', 'headers', 'rows']
          }
        },
        {
          name: 'read_csv',
          description: 'Read a CSV file and return structured data. Supports custom delimiters and encoding.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the CSV file'
              },
              delimiter: {
                type: 'string',
                description: 'Column delimiter. Default: "," (comma)',
                default: ','
              },
              output_format: {
                type: 'string',
                enum: ['table', 'json'],
                description: 'Output format. Default: "table"',
                default: 'table'
              },
              max_rows: {
                type: 'number',
                description: 'Maximum rows to return. Default: 1000',
                default: 1000
              },
              encoding: {
                type: 'string',
                description: 'File encoding. Default: "utf-8"',
                default: 'utf-8'
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'write_csv',
          description: 'Create or write data to a CSV file.',
          inputSchema: {
            type: 'object',
            properties: {
              output_path: {
                type: 'string',
                description: 'Absolute path for the output CSV file'
              },
              headers: {
                type: 'array',
                items: { type: 'string' },
                description: 'Column headers'
              },
              rows: {
                type: 'array',
                items: {
                  type: 'array',
                  items: {}
                },
                description: 'Data rows (array of arrays)'
              },
              delimiter: {
                type: 'string',
                description: 'Column delimiter. Default: ","',
                default: ','
              }
            },
            required: ['output_path', 'headers', 'rows']
          }
        },
        {
          name: 'file_info',
          description:
            'Get detailed information about a file: size, type, creation/modification dates, and format-specific metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the file'
              }
            },
            required: ['file_path']
          }
        }
      ]
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'read_document':
          return await this.readDocument(args as { file_path: string; max_chars?: number })
        case 'read_excel':
          return await this.readExcel(args as any)
        case 'create_excel':
          return await this.createExcel(args as any)
        case 'read_csv':
          return await this.readCsv(args as any)
        case 'write_csv':
          return await this.writeCsv(args as any)
        case 'file_info':
          return await this.fileInfo(args as { file_path: string })
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`)
      }
    })
  }

  private async readDocument(args: { file_path: string; max_chars?: number }) {
    const { file_path, max_chars = 200000 } = args
    const ext = path.extname(file_path).toLowerCase()

    try {
      // For plain text files, read directly
      const textExtensions = [
        '.txt',
        '.md',
        '.json',
        '.xml',
        '.yaml',
        '.yml',
        '.html',
        '.htm',
        '.css',
        '.js',
        '.ts',
        '.log',
        '.ini',
        '.cfg',
        '.conf'
      ]
      if (textExtensions.includes(ext)) {
        let content = await fs.readFile(file_path, 'utf-8')
        if (content.length > max_chars) {
          content = content.substring(0, max_chars) + `\n\n... [Truncated. Total: ${content.length} chars]`
        }
        return { content: [{ type: 'text', text: content }], isError: false }
      }

      // For CSV
      if (ext === '.csv') {
        return await this.readCsv({ file_path, output_format: 'table', max_rows: 1000 })
      }

      // For office documents, use officeparser
      const officeparser = await import('officeparser')
      const text = await officeparser.parseOfficeAsync(file_path)

      let result = `File: ${path.basename(file_path)}\nType: ${ext}\n---\n${text}`
      if (result.length > max_chars) {
        result = result.substring(0, max_chars) + `\n\n... [Truncated. Total: ${text.length} chars]`
      }

      return { content: [{ type: 'text', text: result }], isError: false }
    } catch (error) {
      logger.error(`Document read error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error reading document: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private async readExcel(args: {
    file_path: string
    sheet_name?: string
    output_format?: string
    header_row?: number
    max_rows?: number
  }) {
    const { file_path, sheet_name, output_format = 'table', header_row = 1, max_rows = 1000 } = args

    try {
      const XLSX = await import('xlsx')
      const buffer = await fs.readFile(file_path)
      const workbook = XLSX.read(buffer, { type: 'buffer' })

      const sheetNames = workbook.SheetNames
      const targetSheet = sheet_name || sheetNames[0]

      if (!sheetNames.includes(targetSheet)) {
        return {
          content: [{ type: 'text', text: `Sheet "${targetSheet}" not found. Available: ${sheetNames.join(', ')}` }],
          isError: true
        }
      }

      const worksheet = workbook.Sheets[targetSheet]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][]

      if (jsonData.length === 0) {
        return { content: [{ type: 'text', text: `Sheet "${targetSheet}" is empty` }], isError: false }
      }

      const headers = jsonData[header_row - 1] as string[]
      const dataRows = jsonData.slice(header_row).slice(0, max_rows)
      const totalRows = jsonData.length - header_row

      let result: string

      switch (output_format) {
        case 'json': {
          const records = dataRows.map((row) => {
            const obj: Record<string, any> = {}
            headers.forEach((h, i) => {
              obj[String(h)] = row[i] ?? ''
            })
            return obj
          })
          result = JSON.stringify(records, null, 2)
          break
        }
        case 'csv': {
          const csvLines = [headers.join(',')]
          dataRows.forEach((row) => {
            csvLines.push(
              row
                .map((cell) => {
                  const str = String(cell ?? '')
                  return str.includes(',') || str.includes('"') || str.includes('\n')
                    ? `"${str.replace(/"/g, '""')}"`
                    : str
                })
                .join(',')
            )
          })
          result = csvLines.join('\n')
          break
        }
        case 'table':
        default: {
          result = this.toMarkdownTable(headers.map(String), dataRows)
          break
        }
      }

      const meta = [
        `File: ${path.basename(file_path)}`,
        `Sheet: ${targetSheet} (${sheetNames.length} sheets total: ${sheetNames.join(', ')})`,
        `Rows: ${Math.min(dataRows.length, max_rows)} shown of ${totalRows} total`,
        `Columns: ${headers.length}`,
        `---`
      ].join('\n')

      return { content: [{ type: 'text', text: `${meta}\n${result}` }], isError: false }
    } catch (error) {
      logger.error(`Excel read error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error reading Excel: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private async createExcel(args: { output_path: string; sheet_name?: string; headers: string[]; rows: any[][] }) {
    const { output_path, sheet_name = 'Sheet1', headers, rows } = args

    try {
      const XLSX = await import('xlsx')
      const data = [headers, ...rows]
      const worksheet = XLSX.utils.aoa_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet_name)
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      await fs.writeFile(output_path, buffer)

      return {
        content: [
          {
            type: 'text',
            text: `Created Excel file: ${output_path}\nSheet: ${sheet_name}\nHeaders: ${headers.length} columns\nData: ${rows.length} rows`
          }
        ],
        isError: false
      }
    } catch (error) {
      logger.error(`Excel create error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error creating Excel: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private async readCsv(args: {
    file_path: string
    delimiter?: string
    output_format?: string
    max_rows?: number
    encoding?: string
  }) {
    const { file_path, delimiter = ',', output_format = 'table', max_rows = 1000, encoding = 'utf-8' } = args

    try {
      const content = await fs.readFile(file_path, encoding as BufferEncoding)
      const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)

      if (lines.length === 0) {
        return { content: [{ type: 'text', text: 'File is empty' }], isError: false }
      }

      const parseRow = (line: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false

        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (char === delimiter && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      }

      const headers = parseRow(lines[0])
      const dataRows = lines.slice(1, max_rows + 1).map(parseRow)
      const totalRows = lines.length - 1

      let result: string
      if (output_format === 'json') {
        const records = dataRows.map((row) => {
          const obj: Record<string, string> = {}
          headers.forEach((h, i) => {
            obj[h] = row[i] ?? ''
          })
          return obj
        })
        result = JSON.stringify(records, null, 2)
      } else {
        result = this.toMarkdownTable(headers, dataRows)
      }

      const meta = [
        `File: ${path.basename(file_path)}`,
        `Rows: ${Math.min(dataRows.length, max_rows)} shown of ${totalRows} total`,
        `Columns: ${headers.length}`,
        `---`
      ].join('\n')

      return { content: [{ type: 'text', text: `${meta}\n${result}` }], isError: false }
    } catch (error) {
      logger.error(`CSV read error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error reading CSV: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private async writeCsv(args: { output_path: string; headers: string[]; rows: any[][]; delimiter?: string }) {
    const { output_path, headers, rows, delimiter = ',' } = args

    try {
      const escapeField = (field: any): string => {
        const str = String(field ?? '')
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const lines = [
        headers.map(escapeField).join(delimiter),
        ...rows.map((row) => row.map(escapeField).join(delimiter))
      ]

      await fs.writeFile(output_path, lines.join('\n'), 'utf-8')

      return {
        content: [
          {
            type: 'text',
            text: `Created CSV file: ${output_path}\nColumns: ${headers.length}\nRows: ${rows.length}`
          }
        ],
        isError: false
      }
    } catch (error) {
      logger.error(`CSV write error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error writing CSV: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private async fileInfo(args: { file_path: string }) {
    const { file_path } = args

    try {
      const stats = await fs.stat(file_path)
      const ext = path.extname(file_path).toLowerCase()

      const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
      }

      const typeMap: Record<string, string> = {
        '.pdf': 'PDF Document',
        '.docx': 'Microsoft Word Document',
        '.doc': 'Microsoft Word Document (Legacy)',
        '.xlsx': 'Microsoft Excel Spreadsheet',
        '.xls': 'Microsoft Excel Spreadsheet (Legacy)',
        '.pptx': 'Microsoft PowerPoint Presentation',
        '.ppt': 'Microsoft PowerPoint Presentation (Legacy)',
        '.csv': 'Comma-Separated Values',
        '.txt': 'Plain Text',
        '.md': 'Markdown',
        '.json': 'JSON',
        '.xml': 'XML',
        '.html': 'HTML',
        '.yaml': 'YAML',
        '.yml': 'YAML'
      }

      const result = [
        `=== File Information ===`,
        `Name: ${path.basename(file_path)}`,
        `Path: ${file_path}`,
        `Type: ${typeMap[ext] || `Unknown (${ext})`}`,
        `Size: ${formatSize(stats.size)}`,
        `Created: ${stats.birthtime.toISOString()}`,
        `Modified: ${stats.mtime.toISOString()}`,
        `Accessed: ${stats.atime.toISOString()}`,
        `Is File: ${stats.isFile()}`,
        `Is Directory: ${stats.isDirectory()}`
      ].join('\n')

      return { content: [{ type: 'text', text: result }], isError: false }
    } catch (error) {
      logger.error(`File info error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error getting file info: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private toMarkdownTable(headers: string[], rows: any[][]): string {
    const maxWidths = headers.map((h, i) => {
      const dataWidths = rows.map((r) => String(r[i] ?? '').length)
      return Math.max(String(h).length, ...dataWidths, 3)
    })

    const headerRow = '| ' + headers.map((h, i) => String(h).padEnd(maxWidths[i])).join(' | ') + ' |'
    const separator = '| ' + maxWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |'
    const dataRows = rows.map(
      (row) => '| ' + headers.map((_, i) => String(row[i] ?? '').padEnd(maxWidths[i])).join(' | ') + ' |'
    )

    return [headerRow, separator, ...dataRows].join('\n')
  }
}

export default OfficeServer
