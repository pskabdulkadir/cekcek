module.exports = {
  apps: [{
    name: "cekcek-server",
    script: "dist/server.cjs", // Build çıktısı
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
