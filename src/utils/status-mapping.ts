/**
 * STATUS MAPPING IMPLEMENTATION EXAMPLE
 *
 * Fixes the status filtering problem in the ACM MCP Server for a key subset of resources.
 * For rest of the resources, we do a text search 
 * - refer to cross-resource.ts/function buildStatusConditions
 *
 */

export type StatusCategory = 'simple' | 'custom' | 'complex' | 'multi-condition' | 'nested' | 'none';

export interface StatusMapping {
  kind: string;
  category: StatusCategory;

  // For simple/custom categories - single field lookup
  field?: string;  // Field name: 'status', 'compliant', 'available', etc.
  validValues?: string[];  // Known valid values for documentation/validation

  // For complex categories - custom evaluation function
  healthLogic?: (data: any) => string;  // Returns: 'healthy', 'unhealthy', 'degraded', 'unknown'

  // For multi-condition categories - multiple related fields
  conditionFields?: string[];  // List of fields to check

  // For nested categories - JSON path to status field
  jsonPath?: string;  // e.g., 'status.health.status' becomes data->'status'->'health'->>'status'

  // Optional: Status value mappings (e.g., "True" -> "healthy")
  valueMapping?: Record<string, string>;
}

/**
 * Comprehensive status mappings for Kubernetes/OpenShift/ACM resource types
 *
 * This mapping defines how to extract and interpret status for each resource kind.
 * Categories:
 * - simple: Single field with direct status values
 * - custom: Different field name but same pattern
 * - complex: Requires custom logic to determine health
 * - multi-condition: Multiple related boolean/condition fields
 * - nested: Status is in a nested JSON structure
 * - none: No meaningful status concept
 */
export const STATUS_MAPPINGS: StatusMapping[] = [
  // ==================== CATEGORY 1: SIMPLE STATUS FIELD ====================
  // Resources with straightforward data->>'status' field

  {
    kind: 'Pod',
    category: 'simple',
    field: 'status',
    validValues: [
      'Running',           // Normal running state
      'Pending',           // Waiting to start
      'Succeeded',         // Completed successfully
      'Failed',            // Completed with error
      'Unknown',           // Unknown state
      'CrashLoopBackOff', // Repeatedly crashing
      'ImagePullBackOff', // Can't pull image
      'Error',            // Generic error state
      'Completed',        // Job/init containers completed
      'ContainerCreating',// Container being created
      'Terminating'       // Pod shutting down
    ]
  },

  {
    kind: 'Node',
    category: 'simple',
    field: 'status',
    validValues: ['Ready', 'NotReady', 'Unknown', 'SchedulingDisabled']
  },

  {
    kind: 'PersistentVolume',
    category: 'simple',
    field: 'status',
    validValues: ['Available', 'Bound', 'Released', 'Failed']
  },

  {
    kind: 'PersistentVolumeClaim',
    category: 'simple',
    field: 'status',
    validValues: ['Pending', 'Bound', 'Lost']
  },

  {
    kind: 'Job',
    category: 'simple',
    field: 'status',
    validValues: ['Complete', 'Failed', 'Running', 'Suspended']
  },

  {
    kind: 'CronJob',
    category: 'simple',
    field: 'status',
    validValues: ['Active', 'Suspended']
  },

  {
    kind: 'Build',
    category: 'simple',
    field: 'status',
    validValues: ['New', 'Pending', 'Running', 'Complete', 'Failed', 'Error', 'Cancelled']
  },

  {
    kind: 'BuildConfig',
    category: 'simple',
    field: 'status',
    validValues: ['New', 'Pending', 'Running', 'Complete', 'Failed']
  },

  // ==================== CATEGORY 2: CUSTOM STATUS FIELD ====================
  // Resources that use a different field name for status

  {
    kind: 'Policy',
    category: 'custom',
    field: 'compliant',
    validValues: ['Compliant', 'NonCompliant', 'Pending', 'Unknown']
  },

  {
    kind: 'ManagedCluster',
    category: 'custom',
    field: 'available',
    validValues: ['True', 'False', 'Unknown'],
    valueMapping: {
      'True': 'healthy',
      'False': 'unhealthy',
      'Unknown': 'unknown'
    }
  },

  {
    kind: 'Certificate',
    category: 'custom',
    field: 'ready',
    validValues: ['True', 'False'],
    valueMapping: {
      'True': 'healthy',
      'False': 'unhealthy'
    }
  },

  {
    kind: 'CertificateRequest',
    category: 'custom',
    field: 'ready',
    validValues: ['True', 'False', 'Pending']
  },

  {
    kind: 'Ingress',
    category: 'custom',
    field: 'ready',
    validValues: ['True', 'False']
  },

  // ==================== CATEGORY 3: COMPLEX BOOLEAN LOGIC ====================
  // Resources requiring evaluation of multiple fields with custom logic

  {
    kind: 'Deployment',
    category: 'complex',
    healthLogic: (data: any) => {
      // Extract replica counts
      const ready = parseInt(data.ready) || 0;
      const desired = parseInt(data.desired) || 0;
      const available = parseInt(data.available) || 0;

      if (desired === 0) return 'unknown';  // Scaled to zero
      if (ready >= desired && available >= desired) return 'healthy';  // All replicas ready
      if (ready === 0) return 'unhealthy';  // No replicas running
      if (ready < desired) return 'degraded';  // Some replicas missing
      return 'unknown';
    }
  },

  {
    kind: 'ReplicaSet',
    category: 'complex',
    healthLogic: (data: any) => {
      const ready = parseInt(data.ready) || 0;
      const replicas = parseInt(data.replicas) || 0;

      if (replicas === 0) return 'unknown';
      if (ready >= replicas) return 'healthy';
      if (ready === 0) return 'unhealthy';
      return 'degraded';
    }
  },

  {
    kind: 'StatefulSet',
    category: 'complex',
    healthLogic: (data: any) => {
      const ready = parseInt(data.ready) || 0;
      const replicas = parseInt(data.replicas) || 0;

      if (replicas === 0) return 'unknown';
      if (ready >= replicas) return 'healthy';
      if (ready === 0) return 'unhealthy';
      return 'degraded';
    }
  },

  {
    kind: 'DaemonSet',
    category: 'complex',
    healthLogic: (data: any) => {
      const numberReady = parseInt(data.numberReady) || 0;
      const desiredNumberScheduled = parseInt(data.desiredNumberScheduled) || 0;
      const numberMisscheduled = parseInt(data.numberMisscheduled) || 0;

      if (desiredNumberScheduled === 0) return 'unknown';
      if (numberReady >= desiredNumberScheduled && numberMisscheduled === 0) return 'healthy';
      if (numberReady === 0) return 'unhealthy';
      return 'degraded';
    }
  },

  {
    kind: 'ClusterOperator',
    category: 'complex',
    healthLogic: (data: any) => {
      const available = data.available;
      const degraded = data.degraded;
      const progressing = data.progressing;

      if (available === 'True' && degraded === 'False') {
        return progressing === 'True' ? 'degraded' : 'healthy';
      }
      if (available === 'False' || degraded === 'True') return 'unhealthy';
      return 'unknown';
    }
  },

  {
    kind: 'DeploymentConfig',
    category: 'complex',
    healthLogic: (data: any) => {
      const ready = parseInt(data.ready) || 0;
      const desired = parseInt(data.desired) || 0;

      if (desired === 0) return 'unknown';
      if (ready >= desired) return 'healthy';
      if (ready === 0) return 'unhealthy';
      return 'degraded';
    }
  },

  // ==================== CATEGORY 4: MULTI-CONDITION FIELDS ====================
  // Resources with multiple independent condition/status indicators

  {
    kind: 'ClusterOperator',
    category: 'multi-condition',
    conditionFields: ['available', 'degraded', 'progressing', 'upgradeable']
  },

  {
    kind: 'ManagedCluster',
    category: 'multi-condition',
    conditionFields: ['available', 'joined', 'hubAccepted', 'managed']
  },

  {
    kind: 'Certificate',
    category: 'multi-condition',
    conditionFields: ['ready', 'issuing', 'renewing']
  },

  // ==================== CATEGORY 5: NO STATUS CONCEPT ====================
  // Resources that are purely configuration/data with no health status

  {
    kind: 'Secret',
    category: 'none'
  },

  {
    kind: 'ConfigMap',
    category: 'none'
  },

  {
    kind: 'Service',
    category: 'none'
  },

  {
    kind: 'Namespace',
    category: 'none'
  },

  {
    kind: 'ServiceAccount',
    category: 'none'
  },

  {
    kind: 'Role',
    category: 'none'
  },

  {
    kind: 'RoleBinding',
    category: 'none'
  },

  {
    kind: 'ClusterRole',
    category: 'none'
  },

  {
    kind: 'ClusterRoleBinding',
    category: 'none'
  },

  {
    kind: 'NetworkPolicy',
    category: 'none'
  },

  {
    kind: 'LimitRange',
    category: 'none'
  },

  {
    kind: 'ResourceQuota',
    category: 'none'
  },

  {
    kind: 'PodSecurityPolicy',
    category: 'none'
  },

  {
    kind: 'StorageClass',
    category: 'none'
  },

  {
    kind: 'PriorityClass',
    category: 'none'
  },

  // ==================== CATEGORY 6: NESTED/COMPLEX STATUS ====================
  // Resources with deeply nested status structures

  {
    kind: 'Application',
    category: 'nested',
    jsonPath: 'status.health.status',
    validValues: ['Healthy', 'Progressing', 'Degraded', 'Suspended', 'Missing', 'Unknown']
  },

  {
    kind: 'ApplicationSet',
    category: 'nested',
    jsonPath: 'status.health.status',
    validValues: ['Healthy', 'Progressing', 'Degraded']
  },

  {
    kind: 'Route',
    category: 'nested',
    jsonPath: 'status.ingress.0.conditions.0.status',
    validValues: ['True', 'False']
  }
];

// Default mapping for unknown resource types - use textSearch fallback
export const DEFAULT_STATUS_MAPPING: StatusMapping = {
  kind: 'Unknown',
  category: 'none'  // Force textSearch fallback for unmapped types
};

/**
 * Get status mapping for a specific resource kind
 * @param kind - The Kubernetes resource kind
 * @returns StatusMapping configuration for the kind
 */
export function getStatusMapping(kind: string): StatusMapping {
  return STATUS_MAPPINGS.find(m => m.kind === kind) || DEFAULT_STATUS_MAPPING;
}

/**
 * Check if a resource kind supports status filtering
 * @param kind - The Kubernetes resource kind
 * @returns true if the kind has a status concept
 */
export function hasStatusConcept(kind: string): boolean {
  const mapping = getStatusMapping(kind);
  return mapping.category !== 'none';
}

/**
 * Build kind-aware SQL conditions for status filtering
 *
 * This is the MAIN FUNCTION that replaces buildStatusConditions() in cross-resource.ts
 *
 * @param kind - Resource kind(s) being queried
 * @param status - Status value(s) to filter by
 * @param dataColumn - Name of the JSON data column (usually 'data')
 * @param paramStartIndex - Starting parameter index for SQL placeholders
 * @returns SQL conditions, parameters, and next parameter index
 */
export function buildKindAwareStatusConditions(
  kind: string | string[] | undefined,
  status: string | string[],
  dataColumn: string = 'data',
  paramStartIndex: number = 1
): { conditions: string[], params: any[], nextParamIndex: number } {

  // Handle multi-kind queries (complex case)
  if (Array.isArray(kind) && kind.length > 1) {
    return buildMultiKindStatusConditions(kind, status, dataColumn, paramStartIndex);
  }

  // Single kind or no kind specified
  const singleKind = Array.isArray(kind) ? kind[0] : kind;

  if (!singleKind) {
    // No kind specified - use default simple status field
    console.warn('Status filtering without specifying kind - using default status field');
    return buildSimpleStatusConditions(status, 'status', dataColumn, paramStartIndex);
  }

  const mapping = getStatusMapping(singleKind);

  switch (mapping.category) {
    case 'none':
      // Resource has no status concept
      console.warn(`Resource kind '${singleKind}' has no status concept - ignoring status filter`);
      return { conditions: [], params: [], nextParamIndex: paramStartIndex };

    case 'simple':
      return buildSimpleStatusConditions(status, mapping.field || 'status', dataColumn, paramStartIndex);

    case 'custom':
      if (!mapping.field) {
        throw new Error(`Invalid mapping for ${singleKind}: custom category requires field`);
      }
      return buildSimpleStatusConditions(status, mapping.field, dataColumn, paramStartIndex);

    case 'complex':
      // For complex logic, we need to post-process results
      // Return a placeholder condition and handle filtering after query
      console.warn(`Status filtering for ${singleKind} requires post-query processing`);
      // Return all results - will be filtered in processHealthMode()
      return { conditions: ['1=1'], params: [], nextParamIndex: paramStartIndex };

    case 'multi-condition':
      // Build conditions for multiple fields
      if (!mapping.conditionFields) {
        throw new Error(`Invalid mapping for ${singleKind}: multi-condition requires conditionFields`);
      }
      return buildMultiConditionStatusConditions(status, mapping.conditionFields, dataColumn, paramStartIndex);

    case 'nested':
      if (!mapping.jsonPath) {
        throw new Error(`Invalid mapping for ${singleKind}: nested category requires jsonPath`);
      }
      return buildNestedStatusConditions(status, mapping.jsonPath, dataColumn, paramStartIndex);

    default:
      // Fallback to simple status
      return buildSimpleStatusConditions(status, 'status', dataColumn, paramStartIndex);
  }
}

/**
 * Helper: Build simple status conditions for a single field
 */
function buildSimpleStatusConditions(
  status: string | string[],
  field: string,
  dataColumn: string,
  paramStartIndex: number
): { conditions: string[], params: any[], nextParamIndex: number } {
  const statusArray = Array.isArray(status) ? status : [status];

  if (statusArray.length === 0) {
    return { conditions: [], params: [], nextParamIndex: paramStartIndex };
  }

  if (statusArray.length === 1) {
    return {
      conditions: [`${dataColumn}->>'${field}' = $${paramStartIndex}`],
      params: statusArray,
      nextParamIndex: paramStartIndex + 1
    };
  }

  const placeholders = statusArray.map((_, index) => `$${paramStartIndex + index}`).join(',');
  return {
    conditions: [`${dataColumn}->>'${field}' IN (${placeholders})`],
    params: statusArray,
    nextParamIndex: paramStartIndex + statusArray.length
  };
}

/**
 * Helper: Build nested JSON path conditions
 * Converts 'status.health.status' to SQL: data->'status'->'health'->>'status'
 */
function buildNestedStatusConditions(
  status: string | string[],
  jsonPath: string,
  dataColumn: string,
  paramStartIndex: number
): { conditions: string[], params: any[], nextParamIndex: number } {
  const pathParts = jsonPath.split('.');
  const lastIndex = pathParts.length - 1;

  // Build SQL path: data->'status'->'health'->>'status'
  let sqlPath = dataColumn;
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    if (i === lastIndex) {
      // Last part uses ->> for text extraction
      sqlPath += `->>'${part}'`;
    } else {
      // Intermediate parts use -> for JSON navigation
      sqlPath += `->'${part}'`;
    }
  }

  const statusArray = Array.isArray(status) ? status : [status];

  if (statusArray.length === 1) {
    return {
      conditions: [`${sqlPath} = $${paramStartIndex}`],
      params: statusArray,
      nextParamIndex: paramStartIndex + 1
    };
  }

  const placeholders = statusArray.map((_, index) => `$${paramStartIndex + index}`).join(',');
  return {
    conditions: [`${sqlPath} IN (${placeholders})`],
    params: statusArray,
    nextParamIndex: paramStartIndex + statusArray.length
  };
}

/**
 * Helper: Build multi-condition status conditions
 * For resources with multiple independent status fields
 */
function buildMultiConditionStatusConditions(
  status: string | string[],
  conditionFields: string[],
  dataColumn: string,
  paramStartIndex: number
): { conditions: string[], params: any[], nextParamIndex: number } {
  // For multi-condition, status filter should match ANY of the condition fields
  const statusArray = Array.isArray(status) ? status : [status];
  const orConditions: string[] = [];
  let currentParamIndex = paramStartIndex;

  for (const field of conditionFields) {
    if (statusArray.length === 1) {
      orConditions.push(`${dataColumn}->>'${field}' = $${currentParamIndex}`);
      currentParamIndex++;
    } else {
      const placeholders = statusArray.map((_, i) => `$${currentParamIndex + i}`).join(',');
      orConditions.push(`${dataColumn}->>'${field}' IN (${placeholders})`);
      currentParamIndex += statusArray.length;
    }
  }

  const allParams: any[] = [];
  for (let i = 0; i < conditionFields.length; i++) {
    allParams.push(...statusArray);
  }

  return {
    conditions: [`(${orConditions.join(' OR ')})`],
    params: allParams,
    nextParamIndex: currentParamIndex
  };
}

/**
 * Helper: Build multi-kind status conditions
 * For queries filtering multiple resource kinds simultaneously
 * Example: kind=Pod,Deployment status=healthy
 */
function buildMultiKindStatusConditions(
  kinds: string[],
  status: string | string[],
  dataColumn: string,
  paramStartIndex: number
): { conditions: string[], params: any[], nextParamIndex: number } {
  const orConditions: string[] = [];
  const allParams: any[] = [];
  let currentParamIndex = paramStartIndex;

  for (const kind of kinds) {
    const mapping = getStatusMapping(kind);

    // Skip resources without status concept
    if (mapping.category === 'none') {
      continue;
    }

    // Build kind condition
    const kindCondition = `${dataColumn}->>'kind' = $${currentParamIndex}`;
    allParams.push(kind);
    currentParamIndex++;

    if (mapping.category === 'simple' || mapping.category === 'custom') {
      const field = mapping.field || 'status';
      const statusArray = Array.isArray(status) ? status : [status];

      if (statusArray.length === 1) {
        const statusCondition = `${dataColumn}->>'${field}' = $${currentParamIndex}`;
        allParams.push(statusArray[0]);
        currentParamIndex++;
        orConditions.push(`(${kindCondition} AND ${statusCondition})`);
      } else {
        const placeholders = statusArray.map((_, i) => `$${currentParamIndex + i}`).join(',');
        const statusCondition = `${dataColumn}->>'${field}' IN (${placeholders})`;
        allParams.push(...statusArray);
        currentParamIndex += statusArray.length;
        orConditions.push(`(${kindCondition} AND ${statusCondition})`);
      }
    } else if (mapping.category === 'nested' && mapping.jsonPath) {
      // Handle nested status for this kind
      const pathParts = mapping.jsonPath.split('.');
      let sqlPath = dataColumn;
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        sqlPath += i === pathParts.length - 1 ? `->>'${part}'` : `->'${part}'`;
      }

      const statusArray = Array.isArray(status) ? status : [status];
      if (statusArray.length === 1) {
        const statusCondition = `${sqlPath} = $${currentParamIndex}`;
        allParams.push(statusArray[0]);
        currentParamIndex++;
        orConditions.push(`(${kindCondition} AND ${statusCondition})`);
      } else {
        const placeholders = statusArray.map((_, i) => `$${currentParamIndex + i}`).join(',');
        const statusCondition = `${sqlPath} IN (${placeholders})`;
        allParams.push(...statusArray);
        currentParamIndex += statusArray.length;
        orConditions.push(`(${kindCondition} AND ${statusCondition})`);
      }
    } else {
      // For complex/multi-condition kinds in multi-kind query, skip SQL filtering
      console.warn(`Skipping status filter for ${kind} in multi-kind query (requires post-processing)`);
    }
  }

  if (orConditions.length === 0) {
    return { conditions: [], params: [], nextParamIndex: currentParamIndex };
  }

  return {
    conditions: [`(${orConditions.join(' OR ')})`],
    params: allParams,
    nextParamIndex: currentParamIndex
  };
}

/**
 * Evaluate complex status logic for a resource
 * Used for post-query filtering when SQL can't express the logic
 *
 * @param kind - Resource kind
 * @param data - Resource data object
 * @returns Status string: 'healthy', 'unhealthy', 'degraded', 'unknown'
 */
export function evaluateComplexStatus(kind: string, data: any): string {
  const mapping = getStatusMapping(kind);

  if (mapping.category !== 'complex' || !mapping.healthLogic) {
    return 'unknown';
  }

  try {
    return mapping.healthLogic(data);
  } catch (error) {
    console.error(`Error evaluating status for ${kind}:`, error);
    return 'unknown';
  }
}

/**
 * Post-process query results to filter by complex status logic
 * Use this for Deployment, ReplicaSet, ClusterOperator, etc.
 *
 * @param results - Raw query results
 * @param statusFilter - Desired status values
 * @returns Filtered results matching the status
 */
export function postFilterByComplexStatus(results: any[], statusFilter: string | string[]): any[] {
  const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];

  return results.filter(row => {
    const data = row[2];  // Assuming [uid, cluster, data] structure
    const kind = data?.kind;
    if (!kind) return false;

    const evaluatedStatus = evaluateComplexStatus(kind, data);
    return statusArray.includes(evaluatedStatus);
  });
}
