const path = require("path");

module.exports = {
  apps: [
    {
      name: "aitm-api",
      cwd: path.resolve(__dirname, "../api-server"),
      script: "dist/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3001,
      },
    },
  ],
};
