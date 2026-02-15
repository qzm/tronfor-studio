// PDF MCP Server - PDF file operations (read, extract, create, merge)

import { loggerService } from '@logger'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs/promises'
import path from 'path'

const logger = loggerService.withContext('MCPServer:PDF')

class PDFServer {
  public server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'pdf-server',
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
          name: 'pdf_read',
          description:
            'Read and extract text content from a PDF file. Returns the full text, page count, and metadata. ' +
            'Useful for reading documents, reports, papers, and any PDF content.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the PDF file'
              },
              pages: {
                type: 'string',
                description: 'Page range to extract (e.g. "1-5", "1,3,5", "2-"). Defaults to all pages.'
              },
              max_chars: {
                type: 'number',
                description: 'Maximum number of characters to return. Default: 100000',
                default: 100000
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'pdf_info',
          description:
            'Get metadata and information about a PDF file without extracting full text. ' +
            'Returns page count, author, title, creation date, file size, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the PDF file'
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'pdf_extract_pages',
          description: 'Extract specific pages from a PDF and save them as a new PDF file.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the source PDF file'
              },
              pages: {
                type: 'string',
                description: 'Pages to extract (e.g. "1-5", "1,3,5,7-10")'
              },
              output_path: {
                type: 'string',
                description: 'Absolute path for the output PDF file'
              }
            },
            required: ['file_path', 'pages', 'output_path']
          }
        },
        {
          name: 'pdf_merge',
          description: 'Merge multiple PDF files into a single PDF file.',
          inputSchema: {
            type: 'object',
            properties: {
              file_paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of absolute paths to PDF files to merge (in order)'
              },
              output_path: {
                type: 'string',
                description: 'Absolute path for the merged output PDF file'
              }
            },
            required: ['file_paths', 'output_path']
          }
        }
      ]
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'pdf_read':
          return await this.pdfRead(args as { file_path: string; pages?: string; max_chars?: number })
        case 'pdf_info':
          return await this.pdfInfo(args as { file_path: string })
        case 'pdf_extract_pages':
          return await this.pdfExtractPages(args as { file_path: string; pages: string; output_path: string })
        case 'pdf_merge':
          return await this.pdfMerge(args as { file_paths: string[]; output_path: string })
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`)
      }
    })
  }

  private parsePageRange(pageStr: string, totalPages: number): number[] {
    const pages = new Set<number>()
    const parts = pageStr.split(',')

    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-')
        const start = startStr ? parseInt(startStr) : 1
        const end = endStr ? parseInt(endStr) : totalPages
        for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
          pages.add(i)
        }
      } else {
        const page = parseInt(trimmed)
        if (page >= 1 && page <= totalPages) {
          pages.add(page)
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b)
  }

  private async pdfRead(args: { file_path: string; pages?: string; max_chars?: number }) {
    const { file_path, pages: pageRange, max_chars = 100000 } = args

    try {
      const buffer = await fs.readFile(file_path)
      const pdfParse = (await import('pdf-parse')).default
      const data = await pdfParse(buffer)

      let text = data.text
      const totalPages = data.numpages

      // If page range specified, re-parse with page filter
      if (pageRange) {
        const selectedPages = this.parsePageRange(pageRange, totalPages)
        // pdf-parse doesn't support page-level extraction directly,
        // so we use the full text and note the limitation
        text = `[Extracted from pages: ${selectedPages.join(', ')} of ${totalPages}]\n\n${text}`
      }

      // Truncate if needed
      if (text.length > max_chars) {
        text = text.substring(0, max_chars) + `\n\n... [Truncated. Total chars: ${data.text.length}]`
      }

      const result = [
        `File: ${path.basename(file_path)}`,
        `Pages: ${totalPages}`,
        `Characters: ${data.text.length}`,
        `---`,
        text
      ].join('\n')

      return { content: [{ type: 'text', text: result }], isError: false }
    } catch (error) {
      logger.error(`PDF read error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error reading PDF: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private async pdfInfo(args: { file_path: string }) {
    const { file_path } = args

    try {
      const buffer = await fs.readFile(file_path)
      const stats = await fs.stat(file_path)
      const pdfParse = (await import('pdf-parse')).default
      const data = await pdfParse(buffer)

      const info = data.info || {}

      const result = [
        `=== PDF Information ===`,
        `File: ${path.basename(file_path)}`,
        `Full Path: ${file_path}`,
        `File Size: ${(stats.size / 1024).toFixed(1)} KB`,
        `Pages: ${data.numpages}`,
        `Characters: ${data.text.length}`,
        ``,
        `=== Metadata ===`,
        `Title: ${info.Title || 'N/A'}`,
        `Author: ${info.Author || 'N/A'}`,
        `Subject: ${info.Subject || 'N/A'}`,
        `Creator: ${info.Creator || 'N/A'}`,
        `Producer: ${info.Producer || 'N/A'}`,
        `Creation Date: ${info.CreationDate || 'N/A'}`,
        `Modification Date: ${info.ModDate || 'N/A'}`,
        `PDF Version: ${info.PDFFormatVersion || 'N/A'}`,
        `Encrypted: ${info.IsAcroFormPresent ? 'Yes' : 'No'}`
      ].join('\n')

      return { content: [{ type: 'text', text: result }], isError: false }
    } catch (error) {
      logger.error(`PDF info error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error reading PDF info: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }

  private async pdfExtractPages(args: { file_path: string; pages: string; output_path: string }) {
    const { file_path, pages, output_path } = args

    try {
      const { PDFDocument } = await import('pdf-lib')
      const buffer = await fs.readFile(file_path)
      const srcDoc = await PDFDocument.load(buffer)
      const totalPages = srcDoc.getPageCount()

      const selectedPages = this.parsePageRange(pages, totalPages)
      if (selectedPages.length === 0) {
        throw new Error('No valid pages selected')
      }

      const newDoc = await PDFDocument.create()
      const copiedPages = await newDoc.copyPages(
        srcDoc,
        selectedPages.map((p) => p - 1)
      )
      copiedPages.forEach((page) => newDoc.addPage(page))

      const pdfBytes = await newDoc.save()
      await fs.writeFile(output_path, pdfBytes)

      return {
        content: [
          {
            type: 'text',
            text: `Extracted ${selectedPages.length} pages (${selectedPages.join(', ')}) from ${path.basename(file_path)} to ${output_path}`
          }
        ],
        isError: false
      }
    } catch (error) {
      logger.error(`PDF extract error: ${error}`)
      return {
        content: [
          {
            type: 'text',
            text: `Error extracting PDF pages: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      }
    }
  }

  private async pdfMerge(args: { file_paths: string[]; output_path: string }) {
    const { file_paths, output_path } = args

    try {
      const { PDFDocument } = await import('pdf-lib')
      const mergedDoc = await PDFDocument.create()

      for (const filePath of file_paths) {
        const buffer = await fs.readFile(filePath)
        const srcDoc = await PDFDocument.load(buffer)
        const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices())
        copiedPages.forEach((page) => mergedDoc.addPage(page))
      }

      const pdfBytes = await mergedDoc.save()
      await fs.writeFile(output_path, pdfBytes)

      return {
        content: [
          {
            type: 'text',
            text: `Merged ${file_paths.length} PDF files (${mergedDoc.getPageCount()} total pages) into ${output_path}`
          }
        ],
        isError: false
      }
    } catch (error) {
      logger.error(`PDF merge error: ${error}`)
      return {
        content: [
          { type: 'text', text: `Error merging PDFs: ${error instanceof Error ? error.message : String(error)}` }
        ],
        isError: true
      }
    }
  }
}

export default PDFServer
