// Dynamic Expo config.
//
// This wraps the static app.json and injects runtime configuration into
// `expo.extra` from environment variables. constants/Config.ts reads these
// values via `Constants.expoConfig.extra` (with EXPO_PUBLIC_* env fallbacks),
// so production builds get real values by setting the env vars below in your
// EAS build profile (eas.json `env`) or a local `.env` file.
//
// IMPORTANT: never hardcode secrets here. Provide them via the environment.

const appJson = require('./app.json');

/** @param {import('@expo/config').ConfigContext} ctx */
module.exports = ({ config } = {}) => {
  const base = (config && Object.keys(config).length > 0 ? config : appJson.expo) || {};

  return {
    ...base,
    extra: {
      ...(base.extra || {}),
      // REST API base URL. Must include the /api/v1 prefix the backend mounts on.
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
      // GitHub OAuth client id for "Continue with GitHub". Required in any real
      // build; the OAuth URL is unusable when this is empty.
      githubClientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || '',
      // Socket.IO server URL for realtime messaging/notifications.
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001',
      eas: {
        ...((base.extra && base.extra.eas) || {}),
        projectId: process.env.EAS_PROJECT_ID || (base.extra && base.extra.eas && base.extra.eas.projectId),
      },
    },
  };
};
