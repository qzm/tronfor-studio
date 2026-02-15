import { loggerService } from '@logger'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { BuiltinMCPServerName } from '@types'
import { BuiltinMCPServerNames } from '@types'

import AmapServer from './amap'
import BraveSearchServer from './brave-search'
import BrowserServer from './browser'
import CalculatorServer from './calculator'
import DiDiMcpServer from './didi-mcp'
import DifyKnowledgeServer from './dify-knowledge'
import FetchServer from './fetch'
import FileSystemServer from './filesystem'
import HubServer from './hub'
import MemoryServer from './memory'
import OfficeServer from './office'
import PDFServer from './pdf'
import PythonServer from './python'
import ThinkingServer from './sequentialthinking'
import ShellServer from './shell'
import SystemInfoServer from './system-info'
import TimeServer from './time'

const logger = loggerService.withContext('MCPFactory')

export function createInMemoryMCPServer(
  name: BuiltinMCPServerName,
  args: string[] = [],
  envs: Record<string, string> = {}
): Server {
  logger.debug(`[MCP] Creating in-memory MCP server: ${name} with args: ${args} and envs: ${JSON.stringify(envs)}`)
  switch (name) {
    case BuiltinMCPServerNames.memory: {
      const envPath = envs.MEMORY_FILE_PATH
      return new MemoryServer(envPath).server
    }
    case BuiltinMCPServerNames.sequentialThinking: {
      return new ThinkingServer().server
    }
    case BuiltinMCPServerNames.braveSearch: {
      return new BraveSearchServer(envs.BRAVE_API_KEY).server
    }
    case BuiltinMCPServerNames.fetch: {
      return new FetchServer().server
    }
    case BuiltinMCPServerNames.filesystem: {
      return new FileSystemServer(envs.WORKSPACE_ROOT).server
    }
    case BuiltinMCPServerNames.difyKnowledge: {
      const difyKey = envs.DIFY_KEY
      return new DifyKnowledgeServer(difyKey, args).server
    }
    case BuiltinMCPServerNames.python: {
      return new PythonServer().server
    }
    case BuiltinMCPServerNames.didiMCP: {
      const apiKey = envs.DIDI_API_KEY
      return new DiDiMcpServer(apiKey).server
    }
    case BuiltinMCPServerNames.browser: {
      return new BrowserServer().server
    }
    case BuiltinMCPServerNames.hub: {
      return new HubServer().server
    }
    case BuiltinMCPServerNames.time: {
      return new TimeServer().server
    }
    case BuiltinMCPServerNames.shell: {
      return new ShellServer().server
    }
    case BuiltinMCPServerNames.systemInfo: {
      return new SystemInfoServer().server
    }
    case BuiltinMCPServerNames.amap: {
      const apiKey = envs.AMAP_API_KEY
      return new AmapServer(apiKey).server
    }
    case BuiltinMCPServerNames.calculator: {
      return new CalculatorServer().server
    }
    case BuiltinMCPServerNames.pdf: {
      return new PDFServer().server
    }
    case BuiltinMCPServerNames.office: {
      return new OfficeServer().server
    }
    default:
      throw new Error(`Unknown in-memory MCP server: ${name}`)
  }
}
