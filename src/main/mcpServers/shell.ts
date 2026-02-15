// Shell MCP Server - execute shell commands in a sandboxed environment

import { loggerService } from '@logger'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const logger = loggerService.withContext('MCPServer:Shell')

// Commands that should be blocked for safety
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
  '> /dev/sda',
  'chmod -R 777 /',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init 0',
  'init 6'
]

function isCommandBlocked(command: string): boolean {
  const normalized = command.trim().toLowerCase()
  return BLOCKED_COMMANDS.some((blocked) => normalized.includes(blocked.toLowerCase()))
}

class ShellServer {
  public server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'shell-server',
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
          name: 'execute_command',
          description:
            'Execute a shell command and return its output (stdout and stderr). ' +
            'Commands run with the current user privileges. ' +
            'Destructive system commands are blocked for safety. ' +
            'Use this for file operations, system queries, package management, git commands, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The shell command to execute'
              },
              cwd: {
                type: 'string',
                description: 'Working directory for the command. Defaults to the user home directory.'
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 30000, max: 120000)',
                default: 30000
              },
              shell: {
                type: 'string',
                description: 'Shell to use (e.g. "/bin/bash", "/bin/zsh"). Defaults to system default shell.'
              }
            },
            required: ['command']
          }
        },
        {
          name: 'get_environment',
          description:
            'Get the value of one or more environment variables. ' +
            'Useful for checking PATH, HOME, SHELL, and other environment settings.',
          inputSchema: {
            type: 'object',
            properties: {
              variables: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'List of environment variable names to retrieve. If empty, returns all environment variables.'
              }
            },
            required: []
          }
        }
      ]
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'execute_command':
          return await this.executeCommand(
            args as {
              command: string
              cwd?: string
              timeout?: number
              shell?: string
            }
          )

        case 'get_environment':
          return this.getEnvironment(args as { variables?: string[] })

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`)
      }
    })
  }

  private async executeCommand(args: { command: string; cwd?: string; timeout?: number; shell?: string }) {
    const { command, cwd, timeout = 30000, shell } = args

    if (!command || typeof command !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Command parameter is required and must be a string')
    }

    if (isCommandBlocked(command)) {
      return {
        content: [{ type: 'text', text: 'Error: This command is blocked for safety reasons.' }],
        isError: true
      }
    }

    const effectiveTimeout = Math.min(timeout, 120000)

    logger.debug(`Executing command: ${command}`)

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.env.HOME,
        timeout: effectiveTimeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: shell || undefined,
        env: { ...process.env }
      })

      const parts: string[] = []
      if (stdout) parts.push(`stdout:\n${stdout}`)
      if (stderr) parts.push(`stderr:\n${stderr}`)
      if (parts.length === 0) parts.push('Command executed successfully (no output)')

      return {
        content: [{ type: 'text', text: parts.join('\n\n') }],
        isError: false
      }
    } catch (error: any) {
      const errorMsg = error.killed
        ? `Command timed out after ${effectiveTimeout}ms`
        : `Exit code ${error.code || 'unknown'}\nstdout: ${error.stdout || ''}\nstderr: ${error.stderr || error.message}`

      logger.error(`Command execution error: ${errorMsg}`)
      return {
        content: [{ type: 'text', text: errorMsg }],
        isError: true
      }
    }
  }

  private getEnvironment(args: { variables?: string[] }) {
    const { variables } = args

    if (!variables || variables.length === 0) {
      // Return a safe subset of environment variables
      const safeKeys = ['HOME', 'USER', 'SHELL', 'PATH', 'LANG', 'TERM', 'EDITOR', 'NODE_ENV', 'PWD']
      const env = safeKeys
        .filter((key) => process.env[key])
        .map((key) => `${key}=${process.env[key]}`)
        .join('\n')
      return {
        content: [{ type: 'text', text: env || 'No environment variables found' }],
        isError: false
      }
    }

    const results = variables.map((v) => `${v}=${process.env[v] ?? '(not set)'}`).join('\n')

    return {
      content: [{ type: 'text', text: results }],
      isError: false
    }
  }
}

export default ShellServer
