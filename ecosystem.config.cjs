module.exports = {
  apps: [{
    name: "cekcek-server", // PM2'de uygulamanızın adı
    script: "server.ts", // Çalıştırılacak TypeScript dosyası
    interpreter: "ts-node", // TypeScript dosyalarını çalıştırmak için ts-node kullanın
    // args: ["--force-publish-all"], // Bu argüman artık server.ts içindeki FORCE_PUBLISH bayrağı ile yönetiliyor.
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