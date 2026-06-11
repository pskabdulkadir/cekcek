// PM2 configuration has been moved to ecosystem.config.cjs for CommonJS compatibility
// This file is kept for reference only - DO NOT USE with PM2
// 
// Use: pm2 start ecosystem.config.cjs
// Or:  pm2 start ecosystem.config.cjs --name cekcek-server

// Please use ecosystem.config.cjs instead
console.warn('WARNING: Use ecosystem.config.cjs instead of ecosystem.config.js for PM2');

export default {
  apps: [{
    name: "cekcek-server",
    script: "dist/server.cjs",
    instances: 1,
    exec_mode: "fork",
    node_args: "--expose-gc --dns-result-order=ipv4first",
    max_memory_restart: "700M",
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: "production"
    }
  }]
};
