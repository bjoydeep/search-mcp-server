import https from 'https';
import fs from 'fs';

export interface TokenValidationResult {
  valid: boolean;
  user?: {
    username: string;
    uid: string;
    groups: string[];
  };
  error?: string;
}

export class KubernetesTokenValidator {
  private saTokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
  private k8sHost = process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc.cluster.local';
  private k8sPort = process.env.KUBERNETES_SERVICE_PORT || '443';
  private k8sUrl = `https://${this.k8sHost}:${this.k8sPort}`;

  async validateBearerToken(authHeader: string): Promise<TokenValidationResult> {
    // Validate Authorization header format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        valid: false,
        error: 'Invalid Bearer token format. Expected: Authorization: Bearer <token>'
      };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Basic token length validation
    if (token.length < 10) {
      return {
        valid: false,
        error: 'Token too short'
      };
    }

    try {
      // Read service account token for API calls
      let saToken: string;
      try {
        saToken = fs.readFileSync(this.saTokenPath, 'utf8').trim();
      } catch (error) {
        return {
          valid: false,
          error: 'Service account token not found. Ensure pod has proper service account mounted.'
        };
      }

      // Create TokenReview request
      const tokenReviewRequest = {
        apiVersion: 'authentication.k8s.io/v1',
        kind: 'TokenReview',
        spec: {
          token: token
        }
      };

      // Call Kubernetes TokenReview API
      const result = await this.callK8sAPI(
        '/apis/authentication.k8s.io/v1/tokenreviews',
        tokenReviewRequest,
        saToken
      );

      // Check authentication result
      if (result.status?.authenticated) {
        return {
          valid: true,
          user: {
            username: result.status.user?.username || 'unknown',
            uid: result.status.user?.uid || 'unknown',
            groups: result.status.user?.groups || []
          }
        };
      } else {
        return {
          valid: false,
          error: 'Token not authenticated by Kubernetes API'
        };
      }

    } catch (error) {
      console.error('Token validation error:', error);
      return {
        valid: false,
        error: `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private callK8sAPI(path: string, data: any, saToken: string, method: string = 'POST'): Promise<any> {
    return new Promise((resolve, reject) => {
      const isGet = method === 'GET';
      const postData = isGet ? '' : JSON.stringify(data);

      const options = {
        hostname: this.k8sHost,
        port: parseInt(this.k8sPort),
        path,
        method,
        headers: {
          'Authorization': `Bearer ${saToken}`,
          'Accept': 'application/json'
        } as any,
        rejectUnauthorized: false, // Skip TLS verification (like curl -k)
        timeout: 5000 // 5 second timeout
      };

      if (!isGet) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            // Accept both 200 and 201 status codes (Kubernetes may return either)
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              reject(new Error(`TokenReview API returned status ${res.statusCode}: ${body}`));
              return;
            }
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse TokenReview response: ${e instanceof Error ? e.message : 'Unknown error'}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TokenReview API request timed out'));
      });

      if (!isGet) {
        req.write(postData);
      }
      req.end();
    });
  }

  // Test method to check if we can reach the Kubernetes API
  async testK8sConnection(): Promise<boolean> {
    try {
      const saToken = fs.readFileSync(this.saTokenPath, 'utf8').trim();
      // Try a simple API call to test connectivity
      await this.callK8sAPI('/api', null, saToken, 'GET');
      return true;
    } catch (error) {
      console.error('Kubernetes API connection test failed:', error);
      return false;
    }
  }

  /**
   * Check if user has ACM administrator permissions
   *
   * This function determines if a user should have access to ACM search database
   * by checking for ACM administrative capabilities using the user's own token.
   *
   * @param validationResult - Result from validateBearerToken()
   * @param userToken - User's bearer token (for SelfSubjectAccessReview)
   * @returns Promise<boolean> - true if user has ACM admin access
   */
  async checkACMAdminPermissions(validationResult: TokenValidationResult, userToken: string): Promise<boolean> {
    if (!validationResult.valid || !validationResult.user) {
      return false;
    }

    const username = validationResult.user.username;

    try {
      console.log(`[ACM-AUTH] Checking permissions for user: ${username} using SelfSubjectAccessReview`);

      // 1. Check if user has cluster admin permissions (any method)
      // This is equivalent to 'oc auth can-i "*" "*"' using the user's own token
      console.log(`[ACM-AUTH] Testing cluster admin permissions for user: ${username}`);
      const hasClusterAdmin = await this.checkSelfSubjectAccessReview(userToken, username, {
        verb: '*',
        resource: '*'
      });

      if (hasClusterAdmin) {
        console.log(`[ACM-AUTH] User ${username} granted access via cluster admin permissions`);
        return true;
      }

      // 2. Fallback: Check ACM-specific permissions for non-cluster-admins
      console.log(`[ACM-AUTH] Testing ACM admin permissions for user: ${username}`);
      const hasACMAdmin = await this.checkSelfSubjectAccessReview(userToken, username, {
        verb: 'create',
        resource: 'managedclusters',
        group: 'cluster.open-cluster-management.io'
      });

      if (hasACMAdmin) {
        console.log(`[ACM-AUTH] User ${username} granted access via ACM admin permissions`);
        return true;
      }

      console.log(`[ACM-AUTH] User ${username} denied access - insufficient permissions`);
      return false;

    } catch (error) {
      console.error(`[ACM-AUTH] Error checking permissions for user ${username}:`, error);
      return false;
    }
  }


  /**
   * Check if user has specific permissions via SelfSubjectAccessReview API
   * Uses the user's own token (like 'oc auth can-i') instead of impersonation
   *
   * @param userToken - User's bearer token
   * @param username - Username for logging
   * @param permission - Permission to check (verb, resource, group)
   * @returns Promise<boolean> - true if user has the permission
   */
  private async checkSelfSubjectAccessReview(
    userToken: string,
    username: string,
    permission: { verb: string; resource: string; group?: string }
  ): Promise<boolean> {
    try {
      const selfSubjectAccessReview = {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        spec: {
          resourceAttributes: {
            verb: permission.verb,
            resource: permission.resource,
            group: permission.group || ''
          }
        }
      };

      const result = await this.callK8sAPI(
        '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
        selfSubjectAccessReview,
        userToken
      );

      const allowed = result.status?.allowed === true;

      if (allowed) {
        // Success: Brief logging
        console.log(`[ACM-AUTH] User ${username} granted ${permission.verb} ${permission.resource} permission`);
      } else {
        // Failure: Detailed logging for debugging
        console.log(`[ACM-AUTH] User ${username} denied ${permission.verb} ${permission.resource} permission: ${result.status?.reason || 'no reason provided'}`);
      }

      return allowed;

    } catch (error) {
      // Error: Full error details for troubleshooting
      console.error(`[ACM-AUTH] Permission check failed for user ${username} (${permission.verb} ${permission.resource}):`, error);
      return false;
    }
  }
}