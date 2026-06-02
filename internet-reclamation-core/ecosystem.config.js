module.exports = {
  apps: [{
    name: "reclamation-core-bot",
    script: "./bot_main.js",
    instances: 1,
    exec_mode: "fork",
    node_args: "--expose-gc",
    max_memory_restart: "700M",
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: "production"
    }
  }]
};
