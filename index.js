// HTTP-to-MCP Wrapper for n8n integration
// Deploy this to Railway as a separate service

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Your existing MCP server URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://clickup-mcp-server-production-872b.up.railway.app';

// MCP client state - Global variables
let mcpInitialized = false;
let sessionId = null;

// Initialize MCP client properly
async function initializeMCPClient() {
  if (mcpInitialized && sessionId) return true;
  
  try {
    console.log('🔄 Initializing MCP client...');
    
    const initResponse = await axios.post(`${MCP_SERVER_URL}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'n8n-wrapper',
          version: '1.0.0'
        }
      }
    }, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    });
    
    console.log('✅ MCP client initialized:', {
      status: initResponse.status,
      hasData: !!initResponse.data
    });
    
    // Extract session ID from response headers
    sessionId = initResponse.headers['mcp-session-id'] || 
                initResponse.headers['x-session-id'];
    
    // If no session ID in headers, try parsing from SSE response data
    if (!sessionId && typeof initResponse.data === 'string') {
      const sessionMatch = initResponse.data.match(/sessionId[=:]([a-f0-9-]+)/i);
      if (sessionMatch) {
        sessionId = sessionMatch[1];
        console.log('🔍 Extracted session ID from response data');
      }
    }
    
    // Fallback: generate session ID
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      console.log('🎲 Generated fallback session ID');
    }
    
    console.log('🔑 Using session ID:', sessionId);
    console.log('🔍 Session ID type:', typeof sessionId);
    
    // Check if response is SSE format
    if (typeof initResponse.data === 'string' && initResponse.data.includes('event: message')) {
      console.log('📡 Received SSE format response');
      console.log('📋 Response preview:', initResponse.data.substring(0, 300));
    }
    
    mcpInitialized = true;
    return true;
  } catch (error) {
    console.error('❌ MCP initialization failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    return false;
  }
}

// Call MCP server
async function callMCPServer(method, params = {}) {
  console.log('🔍 Debug - mcpInitialized:', mcpInitialized);
  console.log('🔍 Debug - sessionId:', sessionId);
  console.log('🔍 Debug - sessionId type:', typeof sessionId);
  
  // Initialize MCP client first if not done
  if (!mcpInitialized || !sessionId) {
    const initialized = await initializeMCPClient();
    if (!initialized) {
      throw new Error('Failed to initialize MCP client');
    }
  }
  
  try {
    console.log(`🔄 Calling MCP: ${method} with session: ${sessionId}`);
    
    const response = await axios.post(`${MCP_SERVER_URL}/mcp`, {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    }, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      }
    });
    
    console.log('✅ MCP response received:', {
      status: response.status,
      dataType: typeof response.data,
      dataPreview: typeof response.data === 'string' ? response.data.substring(0, 200) : 'object'
    });
    return response.data;
  } catch (error) {
    console.error('❌ MCP call failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    // Reset initialization on error
    mcpInitialized = false;
    sessionId = null;
    throw error;
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

// Get workspace tasks with filtering (OPTIMIZED FOR TOKENS)
app.post('/tasks/search', async (req, res) => {
  try {
    // STEP 1: Optimize parameters before calling MCP
    const optimizedParams = {
      ...req.body,
      detail_level: "summary",        // Force lightweight mode
      subtasks: false,               // No subtasks
      include_closed: false,         // No closed tasks
      include_archived_lists: false, // No archived lists
      page: 0,                       // First page only
      // Force recent date filter if not provided (last 7 days)
      date_updated_gt: req.body.date_updated_gt || (Date.now() - (7 * 24 * 60 * 60 * 1000))
    };
    
    // Limit list_ids to max 5 lists to prevent overload
    if (optimizedParams.list_ids && optimizedParams.list_ids.length > 5) {
      optimizedParams.list_ids = optimizedParams.list_ids.slice(0, 5);
      console.log('⚠️ Limited list_ids to 5 for performance');
    }
    
    console.log(`🔄 Calling get_workspace_tasks with optimized params`);
    console.log(`📏 Request size: ${JSON.stringify(optimizedParams).length} chars`);
    
    const result = await callMCPServer('tools/call', {
      name: 'get_workspace_tasks',
      arguments: optimizedParams
    });
    
    // STEP 2: Filter the response to reduce tokens
    if (result?.content?.[0]?.text) {
      try {
        const data = JSON.parse(result.content[0].text);
        
        if (data.tasks) {
          console.log(`📊 Original tasks: ${data.tasks.length}`);
          
          // Limit to 50 tasks maximum
          if (data.tasks.length > 50) {
            data.tasks = data.tasks.slice(0, 50);
            console.log(`✂️ Truncated to 50 tasks`);
          }
          
          // Strip heavy fields from each task
          data.tasks = data.tasks.map(task => ({
            id: task.id,
            name: task.name?.substring(0, 100), // Truncate long names
            status: task.status?.status || task.status,
            priority: task.priority?.priority || task.priority,
            url: task.url,
            list: { 
              id: task.list?.id, 
              name: task.list?.name?.substring(0, 50)
            },
            due_date: task.due_date,
            assignees: task.assignees?.slice(0, 3).map(a => ({
              id: a.id, 
              username: a.username
            })) || [],
            tags: task.tags?.slice(0, 5).map(t => t.name || t) || []
            // REMOVED: description, custom_fields, attachments, time_entries, etc.
          }));
          
          // Update the response
          result.content[0].text = JSON.stringify(data);
          console.log(`✅ Filtered tasks: ${data.tasks.length}`);
          console.log(`📉 Response size: ${JSON.stringify(result).length} chars`);
        }
      } catch (parseError) {
        console.log('⚠️ Could not parse response for filtering:', parseError.message);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error in /tasks/search:', error.message);
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
  console.log('✅ Ready to handle requests');
});
