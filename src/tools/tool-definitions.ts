/**
 * Centralized tool definitions for conditional exposure
 */

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: any;
  category: 'primary' | 'database';
}

// Primary tool that's always visible
export const PRIMARY_TOOLS: ToolDefinition[] = [
  {
    name: 'find_resources',
    title: 'Find ACM Resources',
    description: 'Find and analyze Kubernetes resources across ACM managed clusters with advanced filtering, counting, and health analysis',
    category: 'primary',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: 'Resource kind (Pod, Deployment, Service, ManagedCluster, etc.)'
        },
        name: {
          type: 'string',
          description: 'Resource name (exact match or shell-style pattern with * and ?)'
        },
        namespace: {
          type: 'string',
          description: 'Namespace name, comma-separated list, or wildcard patterns. Examples: "default", "kube-system,openshift-config", "open-cluster-management*", "kube-*,default"'
        },
        cluster: {
          type: 'string',
          description: 'Cluster name or comma-separated list. Examples: "jb-mc-1", "local-cluster", "jb-mc-1,local-cluster"'
        },
        labelSelector: {
          type: 'string',
          description: 'Kubernetes label selector: "app=nginx,env!=test"'
        },
        clusterSelector: {
          type: 'string',
          description: 'Filter by cluster labels: "env=prod,cloud=AWS"'
        },
        status: {
          type: 'string',
          description: 'Status filter: "Running,Failed" or "CrashLoopBackOff"'
        },
        textSearch: {
          type: 'string',
          description: 'Comprehensive text search across: (1) resource names, (2) namespaces, and (3) ALL JSON fields including labels, annotations, status, and nested data. Case-insensitive pattern matching. Examples: "NonCompliant" finds non-compliant policies, "CrashLoopBackOff" finds failing pods, "prometheus" finds monitoring resources. Performance: Slower than specific field filters but searches everything.'
        },
        ageNewerThan: {
          type: 'string',
          description: 'Resources newer than: "1h", "2d", "1w"'
        },
        ageOlderThan: {
          type: 'string',
          description: 'Resources older than: "1h", "2d", "1w"'
        },
        outputMode: {
          type: 'string',
          enum: ['list', 'count', 'summary', 'health'],
          default: 'list',
          description: 'Output format: list=detailed table, count=aggregated counts, summary=overview, health=status focus'
        },
        groupBy: {
          type: 'string',
          description: 'Group results by: status, namespace, cluster, kind, or label:key'
        },
        countOnly: {
          type: 'boolean',
          description: 'Return only count numbers, no details'
        },
        limit: {
          type: 'number',
          default: 50,
          description: 'Max results for list mode (1-1000)'
        },
        sortBy: {
          type: 'string',
          default: 'name',
          description: 'Sort by: name, created, namespace, cluster'
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          default: 'asc',
          description: 'Sort direction'
        }
      }
    }
  }
];

// Database tools that require explicit header to show
export const DATABASE_TOOLS: ToolDefinition[] = [
  {
    name: 'query_database',
    title: 'Query ACM Database',
    description: 'Execute a SQL query against the ACM database containing Kubernetes resources from all managed clusters in the fleet',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL query to execute'
        },
        parameters: {
          type: 'array',
          items: { type: 'string' },
          description: 'Query parameters (for parameterized queries)'
        },
        maxRows: {
          type: 'number',
          description: 'Maximum number of rows to return',
          default: 100
        }
      },
      required: ['sql']
    }
  },
  {
    name: 'get_database_stats',
    title: 'Get Database Statistics',
    description: 'Get statistics about the ACM database containing Kubernetes resources from all managed clusters in the fleet',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_tables',
    title: 'List Database Tables',
    description: 'Get a list of all tables in the ACM database that stores Kubernetes resources from managed clusters',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        schema: {
          type: 'string',
          description: 'Schema name to filter by',
          default: 'public'
        }
      }
    }
  },
  {
    name: 'search_tables',
    title: 'Search Database Tables',
    description: 'Search for tables by name in the ACM database containing Kubernetes resources from managed clusters',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term to match table names'
        }
      },
      required: ['searchTerm']
    }
  }
];

// All tools combined
export const ALL_TOOLS: ToolDefinition[] = [...PRIMARY_TOOLS, ...DATABASE_TOOLS];

/**
 * Get filtered tools based on whether database tools should be shown
 */
export function getFilteredTools(showDatabaseTools: boolean): ToolDefinition[] {
  if (showDatabaseTools) {
    return ALL_TOOLS;
  }
  return PRIMARY_TOOLS;
}

/**
 * Check if database tools should be shown based on header value
 */
export function shouldShowDatabaseTools(dbHeader?: string): boolean {
  return dbHeader === 'show';
}