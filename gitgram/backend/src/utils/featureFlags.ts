// Feature flag system (LaunchDarkly ready)
// For production, install: npm install launchdarkly-node-server-sdk

import logger from './logger';

interface FeatureFlag {
  key: string;
  enabled: boolean;
  value?: any;
  description?: string;
}

class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();
  private client: any = null;
  private initialized: boolean = false;

  // Initialize with LaunchDarkly (optional)
  async initialize(sdkKey?: string) {
    if (sdkKey) {
      try {
        const LaunchDarkly = require('launchdarkly-node-server-sdk');
        this.client = LaunchDarkly.init(sdkKey, {
          logger,
        });
        
        await this.client.waitForInitialization();
        this.initialized = true;
        logger.info('LaunchDarkly initialized');
        
        // Set up flag change listener
        this.client.on('update', () => {
          this.syncFlags();
        });
      } catch (error) {
        logger.warn('LaunchDarkly initialization failed:', error);
        this.initializeLocal();
      }
    } else {
      this.initializeLocal();
    }
  }

  private initializeLocal() {
    // Initialize with local flags from environment
    const flags = process.env.FEATURE_FLAGS?.split(',') || [];
    flags.forEach((flag) => {
      const [key, enabled] = flag.split(':');
      this.flags.set(key, {
        key,
        enabled: enabled === 'true',
      });
    });
    this.initialized = true;
    logger.info('Feature flags initialized (local)');
  }

  private async syncFlags() {
    if (!this.client) return;

    // Sync flags from LaunchDarkly
    // This would be implemented based on LaunchDarkly API
  }

  // Check if feature is enabled
  async isEnabled(
    flagKey: string,
    userId?: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    if (this.client && userId) {
      try {
        const user = {
          key: userId,
          ...context,
        };
        return await this.client.variation(flagKey, user, false);
      } catch (error) {
        logger.error('Feature flag check error:', error);
      }
    }

    // Fallback to local flags
    const flag = this.flags.get(flagKey);
    return flag?.enabled || false;
  }

  // Get feature flag value
  async getValue<T>(
    flagKey: string,
    defaultValue: T,
    userId?: string,
    context?: Record<string, any>
  ): Promise<T> {
    if (this.client && userId) {
      try {
        const user = {
          key: userId,
          ...context,
        };
        return await this.client.variation(flagKey, user, defaultValue);
      } catch (error) {
        logger.error('Feature flag value error:', error);
      }
    }

    // Fallback to local flags
    const flag = this.flags.get(flagKey);
    return (flag?.value as T) || defaultValue;
  }

  // Set local flag (for testing/development)
  setFlag(key: string, enabled: boolean, value?: any) {
    this.flags.set(key, {
      key,
      enabled,
      value,
    });
  }

  // Get all flags
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  // Close connection
  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

export const featureFlags = new FeatureFlagManager();

// Initialize on startup
if (process.env.LAUNCHDARKLY_SDK_KEY) {
  featureFlags.initialize(process.env.LAUNCHDARKLY_SDK_KEY).catch((error) => {
    logger.error('Feature flags initialization failed:', error);
  });
} else {
  featureFlags.initialize();
}

// Common feature flags
export const FEATURE_FLAGS = {
  NEW_POST_UI: 'new-post-ui',
  VIDEO_UPLOADS: 'video-uploads',
  STORIES: 'stories',
  DIRECT_MESSAGES: 'direct-messages',
  GITHUB_SYNC: 'github-sync',
  PUSH_NOTIFICATIONS: 'push-notifications',
  DARK_MODE: 'dark-mode',
  ANALYTICS: 'analytics',
} as const;

// Middleware to check feature flags
export function requireFeature(flagKey: string) {
  return async (req: any, res: any, next: any) => {
    const userId = req.user?.id;
    const enabled = await featureFlags.isEnabled(flagKey, userId, {
      email: req.user?.email,
      role: req.user?.role,
    });

    if (!enabled) {
      return res.status(403).json({
        error: 'Feature not available',
        feature: flagKey,
      });
    }

    next();
  };
}

