import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { VERIFY_EMAIL_TOOL, handleVerifyEmail } from './tools/verifyEmail.js';
import { VERIFY_BATCH_TOOL, handleVerifyBatch } from './tools/verifyBatch.js';

// Create MCP Server instance
const server = new Server(
  {
    name: 'inboxvalid-mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

/**
 * Register Available Tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [VERIFY_EMAIL_TOOL, VERIFY_BATCH_TOOL]
  };
});

/**
 * Handle Tool Invocations
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'verify_email':
      return await handleVerifyEmail(args);

    case 'verify_email_batch':
      return await handleVerifyBatch(args);

    default:
      throw new Error(`Unknown tool requested: ${name}`);
  }
});

/**
 * Register Resources (e.g. Validation Guidelines / Disposable Policy)
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'inboxvalid://policy/deliverability-guidelines',
        name: 'InboxValid Deliverability Policy & Risk Rules',
        mimeType: 'application/json',
        description: 'Standard operational deliverability risk thresholds and email scoring policy used by InboxValid.ai.'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'inboxvalid://policy/deliverability-guidelines') {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              policy: 'InboxValid Deliverability & Risk Policy v1.0',
              thresholds: {
                valid: 'Score >= 0.85: High confidence deliverable email.',
                risky: 'Score 0.15 - 0.84: Disposable domain, role account, or DNS fallback.',
                invalid: 'Score = 0.0: Syntax failure, missing @, or domain has no MX records.'
              },
              recommendedAction: {
                valid: 'Proceed with email delivery.',
                risky: 'Require double opt-in or warn user.',
                invalid: 'Block registration and prompt for valid address.'
              }
            },
            null,
            2
          )
        }
      ]
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

/**
 * Register Prompt Templates (e.g. AI Lead List Audit Prompt)
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'audit_lead_list_emails',
        description: 'Prompt template instructing an AI agent to clean and audit a batch of sales leads using InboxValid verification tools.',
        arguments: [
          {
            name: 'lead_emails',
            description: 'Comma-separated list of candidate lead emails to audit.',
            required: true
          }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'audit_lead_list_emails') {
    const rawEmails = args?.lead_emails || '';
    const emailList = rawEmails.split(',').map((e) => e.trim()).filter(Boolean);

    return {
      description: 'Audit sales lead emails for deliverability risks',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please audit the following list of email addresses using the "verify_email_batch" tool: ${JSON.stringify(emailList)}.\nCategorize them into Valid, Risky, and Invalid, and summarize any disposable or missing MX domains.`
          }
        }
      ]
    };
  }

  throw new Error(`Prompt not found: ${name}`);
});

/**
 * Start Stdio Server Transport
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log message sent to stderr so stdin/stdout remain clean for JSON-RPC transport protocol
  console.error('InboxValid MCP Server running on stdio transport.');
}

main().catch((error) => {
  console.error('Fatal error starting InboxValid MCP Server:', error);
  process.exit(1);
});
