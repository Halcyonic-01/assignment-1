import { spawn } from 'child_process';
import path from 'path';

async function runMcpProtocolTest() {
  console.log('====================================================');
  console.log('   Testing InboxValid MCP Server JSON-RPC Protocol');
  console.log('====================================================\n');

  const serverProcess = spawn('node', ['src/server.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stderr.on('data', (data) => {
    console.log(`[SERVER STDERR] ${data.toString().trim()}`);
  });

  let responseData = '';
  serverProcess.stdout.on('data', (chunk) => {
    responseData += chunk.toString();
  });

  // 1. Initialize MCP handshake
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };

  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
  await new Promise((r) => setTimeout(r, 500));

  // 2. List tools
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  };

  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
  await new Promise((r) => setTimeout(r, 500));

  // 3. Call verify_email tool
  const callToolRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'verify_email',
      arguments: { address: 'shubham@tvaram.com' }
    }
  };

  serverProcess.stdin.write(JSON.stringify(callToolRequest) + '\n');
  await new Promise((r) => setTimeout(r, 1000));

  serverProcess.kill();

  console.log('[CLIENT RECEIVED STDOUT]:');
  console.log(responseData);
  console.log('\nProtocol test completed successfully.');
}

runMcpProtocolTest();
