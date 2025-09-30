# Token Optimization Guide

## Overview
This document outlines the token optimization strategies implemented in the ClickUp MCP Server and HTTP Wrapper to reduce token usage in AI workflows.

## Optimizations Implemented

### 1. ✅ Removed Redundant Filtering in HTTP Wrapper
**Impact**: High
**Location**: `index.js:208-226`

The HTTP wrapper previously re-filtered responses that were already optimized by the MCP server. This redundancy has been removed to let the MCP server handle all optimization.

**Before**: Wrapper added optimization params AND filtered responses
**After**: Wrapper passes parameters directly to MCP server

---

### 2. ✅ Reduced MAX_TASKS_RETURNED
**Impact**: High
**Location**: `../clickup-mcp-server/src/tools/task/handlers.ts:44`

Reduced maximum tasks returned per query from 15 to **10 tasks** for maximum token efficiency.

**Usage**: Responses now include `has_more` flag to indicate if more tasks exist.

---

### 3. ✅ Field Selection Support
**Impact**: Medium
**Location**: `../clickup-mcp-server/src/tools/task/handlers.ts:864-890`

Added optional `fields` parameter to `get_workspace_tasks` to request specific fields only.

**Default Fields** (always included):
- `id`
- `name` (truncated to 50 chars)
- `status`
- `url`
- `list.id`
- `list.name` (truncated to 25 chars)

**Optional Fields** (specify via `fields` parameter):
- `priority`
- `due_date`
- `assignees` (max 3, trimmed)
- `tags` (max 5)

**Example Usage**:
```json
{
  "list_ids": ["123456"],
  "fields": "priority,due_date,tags"
}
```

---

### 4. ✅ ENABLED_TOOLS Configuration
**Impact**: High
**Location**: Both MCP server config and wrapper

Limit which tools are loaded to reduce tool list overhead.

**MCP Server** (set in environment):
```bash
ENABLED_TOOLS="get_workspace_hierarchy,create_task,get_task,update_task,get_workspace_tasks"
```

**HTTP Wrapper** (informational only):
```bash
ENABLED_TOOLS="get_workspace_hierarchy,create_task,get_task,update_task,get_workspace_tasks"
```

---

### 5. ✅ Sponsor Message Control
**Impact**: Low
**Location**: `../clickup-mcp-server/src/config.ts:123`

Disable sponsor messages to save tokens (defaults to enabled).

```bash
ENABLE_SPONSOR_MESSAGE=false
```

---

## Environment Variables Summary

### MCP Server Environment Variables
```bash
# Required
CLICKUP_API_KEY=your-api-key
CLICKUP_TEAM_ID=your-team-id

# Token Optimization
ENABLED_TOOLS="get_workspace_hierarchy,create_task,get_task,update_task,get_workspace_tasks"
ENABLE_SPONSOR_MESSAGE=false

# Optional
LOG_LEVEL=error  # Reduce logging overhead
```

### HTTP Wrapper Environment Variables
```bash
# Required
MCP_SERVER_URL=https://clickup-mcp-server-production-872b.up.railway.app

# Token Optimization (informational)
ENABLED_TOOLS="get_workspace_hierarchy,create_task,get_task,update_task,get_workspace_tasks"

# Optional
PORT=3000
```

---

## Best Practices

### 1. Use Minimal Tool Set
Only enable tools you actually use:
```bash
# Minimal set for basic task management
ENABLED_TOOLS="get_workspace_hierarchy,create_task,get_task,update_task"

# Add workspace search when needed
ENABLED_TOOLS="get_workspace_hierarchy,create_task,get_task,update_task,get_workspace_tasks"

# Include document tools if using ClickUp Docs (7 tools)
ENABLED_TOOLS="get_workspace_hierarchy,create_task,get_task,update_task,get_workspace_tasks,create_document,get_document,list_documents,list_document_pages,get_document_pages,create_document_page,update_document_page"
```

**Document Tools** (if `DOCUMENT_SUPPORT=true`):
- `create_document` - Create new docs
- `get_document` - Get doc details
- `list_documents` - List docs in workspace
- `list_document_pages` - List pages in a doc
- `get_document_pages` - Get specific pages
- `create_document_page` - Create new page
- `update_document_page` - Update existing page

### 2. Request Only Required Fields
When querying workspace tasks, specify only the fields you need:
```json
{
  "list_ids": ["123456"],
  "fields": "priority,due_date"  // Only get priority and due_date
}
```

### 3. Use Aggressive Filters
Always provide filters to limit results:
```json
{
  "list_ids": ["123456"],
  "date_updated_gt": 1704067200000,  // Last 7 days
  "statuses": ["in progress"]
}
```

### 4. Disable Sponsor Messages
Set `ENABLE_SPONSOR_MESSAGE=false` in production environments.

### 5. Use Error-Level Logging
Set `LOG_LEVEL=error` to minimize logging overhead in responses.

---

## Expected Token Savings

| Optimization | Estimated Savings |
|--------------|-------------------|
| Removed redundant filtering | 20-30% |
| Reduced to 10 tasks max | 33% |
| Field selection | 40-60% (when using minimal fields) |
| Limited tool list | 10-15% |
| Disabled sponsor messages | 1-2% |
| **Total Potential Savings** | **50-75%** |

---

## Deployment Checklist

- [ ] Set `ENABLED_TOOLS` on MCP server
- [ ] Set `ENABLE_SPONSOR_MESSAGE=false` on MCP server
- [ ] Set `LOG_LEVEL=error` on MCP server
- [ ] Update workflows to use `fields` parameter
- [ ] Test with minimal field set first
- [ ] Deploy HTTP wrapper with updated code
- [ ] Monitor token usage in production

---

## Additional Recommendations

### Consider Direct MCP Connection
The HTTP wrapper adds overhead. If possible, connect your workflow directly to the MCP server's `/mcp` endpoint to eliminate the wrapper layer entirely.

### Cache Workspace Hierarchy
The workspace hierarchy rarely changes. Consider caching it in your workflow to avoid repeated calls.

### Use Pagination
For large datasets, use multiple small queries instead of one large query.

---

## Support

For issues or questions, see:
- MCP Server: https://github.com/TaazKareem/clickup-mcp-server
- Report issues: https://github.com/TaazKareem/clickup-mcp-server/issues
