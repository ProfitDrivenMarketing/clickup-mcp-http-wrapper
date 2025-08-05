// HTTP-to-MCP Wrapper for n8n integration
// Deploy this to Railway as a separate service

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Your existing MCP server URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://clickup-mcp-server-production-872b.up.railway.app';

// Session management
let sessionId = null;

// Initialize MCP session
async function initializeMCPSession() {
  try {
    console.log('🔄 Initializing MCP session...');
    
    // Get session from SSE endpoint with longer timeout and different approach
    const sseResponse = await axios.get(`${MCP_SERVER_URL}/sse`, {
      headers: { 
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000, // Increased timeout
      responseType: 'text'
    });
    
    console.log('📡 SSE Response:', sseResponse.data);
    
    // Extract session ID from SSE response
    const match = sseResponse.data.match(/sessionId=([a-f0-9-]+)/);
    if (match) {
      sessionId = match[1];
      console.log('✅ MCP Session initialized:', sessionId);
      return sessionId;
    } else {
      console.log('⚠️ No session ID found in SSE response');
    }
  } catch (error) {
    console.error('❌ Failed to initialize MCP session:', error.message);
    
    // Fallback: try to generate a simple session ID
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    console.log('🔄 Using fallback session ID:', sessionId);
  }
  return sessionId;
}

// Call MCP server
async function callMCPServer(method, params = {}) {
  // Try the direct /mcp endpoint first (might work better)
  try {
    console.log(`🔄 Calling MCP: ${method}`);
    
    const response = await axios.post(`${MCP_SERVER_URL}/mcp`, {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    }, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    });
    
    console.log('✅ MCP response received');
    return response.data;
  } catch (directError) {
    console.log('⚠️ Direct /mcp failed, trying /messages with session...');
    
    // Fallback to messages endpoint with session
    if (!sessionId) {
      await initializeMCPSession();
    }
    
    try {
      const response = await axios.post(`${MCP_SERVER_URL}/messages?sessionId=${sessionId}`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      return response.data;
    } catch (sessionError) {
      console.error('❌ Both MCP approaches failed:', {
        direct: directError.message,
        session: sessionError.message
      });
      throw sessionError;
    }
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get available tools
app.get('/tools', async (req, res) => {
  try {
    const result = await callMCPServer('tools/list');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get workspace hierarchy
app.get('/workspace/hierarchy', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'get_workspace_hierarchy',
      arguments: {}
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create task
app.post('/task', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'create_task',
      arguments: req.body
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task
app.get('/task/:taskId', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'get_task',
      arguments: { taskId: req.params.taskId }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task
app.put('/task/:taskId', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'update_task',
      arguments: { taskId: req.params.taskId, ...req.body }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get workspace tasks with filtering
app.post('/tasks/search', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'get_workspace_tasks',
      arguments: req.body
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Document operations
app.get('/documents', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'list_documents',
      arguments: req.query
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/document', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'create_document',
      arguments: req.body
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/document/:docId/pages', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: 'list_document_pages',
      arguments: { documentId: req.params.docId }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generic tool call endpoint
app.post('/call/:toolName', async (req, res) => {
  try {
    const result = await callMCPServer('tools/call', {
      name: req.params.toolName,
      arguments: req.body
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP-to-MCP Wrapper running on port ${PORT}`);
  console.log(`📡 MCP Server: ${MCP_SERVER_URL}`);
  
  // Initialize session on startup
  initializeMCPSession();
});
