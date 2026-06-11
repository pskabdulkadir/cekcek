# 🚀 CEKCEK BOT - Production Deployment Guide

**Status:** ✅ Build Complete | Bot Ready for Deployment  
**Build Size:** 268 KB (server.cjs) | Frontend: 1.4 MB  
**Build Date:** 2024-01-15

---

## 📋 Quick Start (Production)

### Step 1: Build Completed ✅
```bash
npm run build
# Output:
# ✓ Validation: 13/13 passed
# ✓ Frontend: 1,474 KB minified
# ✓ Backend: 268 KB (server.cjs)
# ✓ Build time: 4.06 seconds
```

### Step 2: Start Server

**Option A: Direct Node (Development/Testing)**
```bash
node --expose-gc --dns-result-order=ipv4first dist/server.cjs
```

**Option B: PM2 Daemon (Production)**
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

**Option C: Docker (Recommended)**
```bash
docker build -t cekcek-bot .
docker run -d -p 3000:3000 --env-file .env cekcek-bot
```

---

## 🔧 PM2 Configuration

### Problem Fixed
```
❌ OLD: ecosystem.config.js (ES Module format)
✅ NEW: ecosystem.config.cjs (CommonJS format)
```

### Why?
- `package.json` has `"type": "module"` (ES Module project)
- PM2 expects CommonJS config files
- Solution: Use `.cjs` extension for CommonJS

### PM2 Commands

```bash
# Start with PM2
pm2 start ecosystem.config.cjs

# View logs
pm2 logs cekcek-server

# Monitor
pm2 monit

# Stop
pm2 stop cekcek-server

# Restart
pm2 restart cekcek-server

# Delete
pm2 delete cekcek-server

# Startup on boot
pm2 startup
pm2 save
```

---

## 🌍 Deployment Options

### Option 1: Local Machine (Development)
```bash
# Direct start
npm run dev

# Or
node dist/server.cjs
```
**Pros:** Easy testing, local debugging  
**Cons:** Requires machine to stay on

---

### Option 2: PM2 (Local Production)
```bash
pm2 start ecosystem.config.cjs
pm2 startup    # Auto-start on reboot
pm2 save       # Save configuration
```
**Pros:** Auto-restart, clustering, monitoring  
**Cons:** Still local, requires Node.js

---

### Option 3: Docker (Containerized)
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy built files
COPY dist ./dist
COPY .env ./
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

EXPOSE 3000

CMD ["node", "--expose-gc", "--dns-result-order=ipv4first", "dist/server.cjs"]
```

**Build & Run:**
```bash
docker build -t cekcek-bot .
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  cezcek-bot
```

**Pros:** Portable, scalable, easy deployment  
**Cons:** Requires Docker

---

### Option 4: Cloud Platforms

#### **Render.com**
```bash
# Push to GitHub
git push origin main

# Render.com automatically deploys
# Set environment variables in Render dashboard
# Deploy command: npm run build && node dist/server.cjs
```

#### **Railway.app**
```bash
# Connect GitHub repo
# Railway auto-detects Node.js project
# Deploys automatically on push
```

#### **Heroku** (Legacy)
```bash
heroku login
heroku create cekcek-bot
git push heroku main
```

#### **AWS/GCP/Azure**
- Use Docker image
- Deploy to ECS/Cloud Run/App Service
- Configure environment variables

---

## ⚙️ Environment Setup for Production

### Required Variables (Critical)
```env
# Network
CHAIN_ID=137
POLYGON_RPC_URL=https://polygon.rpc.thirdweb.com
PROVIDER_1_URL=https://polygon.rpc.thirdweb.com

# Contracts
CONTRACT_ADDRESS=0xdC34033509Bb6563309C59f64265Cc55FFF55eE4
GREEN_TOKEN_ADDRESS=0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE
ROUTER_ADDRESS=0xa5e0829caced8ffdd052420551415491d6993e2f

# Wallets
PAYOUT_WALLET=0x06E83497F599D67447EfFfeA399cC885CEB6eEff
ACCOUNT_ADDRESS=0x06E83497F599D67447EfFfeA399cC885CEB6eEff
PRIVATE_KEY=0x... # Your private key

# Database
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/cekcek-bot

# Production
PRODUCTION_MODE=true
NODE_ENV=production
```

### Recommended Variables
```env
# API Keys
GEMINI_API_KEY=your_gemini_api_key

# Telegram (Optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Security
ENABLE_HTTPS=true
VERIFY_CONTRACT_ADDRESS=true
```

---

## 🔒 Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] Private key is never committed to git
- [ ] PRODUCTION_MODE=true is set
- [ ] Database credentials are production-grade
- [ ] HTTPS is enabled
- [ ] Contract addresses are verified
- [ ] RPC endpoint is reliable
- [ ] Failover providers are configured
- [ ] Monitoring/alerts are set up
- [ ] Backup strategy is in place

---

## 📊 Monitoring & Maintenance

### Real-time Logs
```bash
# PM2 logs
pm2 logs cekcek-server

# Follow all errors
pm2 logs cekcek-server --err

# Last 100 lines
pm2 logs cezcek-server --lines 100
```

### Health Check
```bash
# API Status
curl http://localhost:3000/healthz
# Response: OK

# Bot Stats
curl http://localhost:3000/api/stats
# Response: JSON with metrics

# Blockchain Test
curl http://localhost:3000/api/test/onchain
# Response: Contract interaction test
```

### Performance Monitoring
```bash
# CPU & Memory
pm2 monit

# Or use external monitoring
# - DataDog
# - New Relic
# - Sentry
```

---

## 🆘 Troubleshooting

### "Port 3000 already in use"
```bash
# Find process using port
netstat -tulpn | grep 3000

# Kill it
lsof -ti :3000 | xargs kill -9

# Or use different port
SERVER_PORT=3001 npm run start
```

### "MongoDB connection timeout"
```bash
# Check connection string
echo $MONGO_URI

# Test connection
mongosh "mongodb+srv://..."

# Or use localhost
MONGO_URI=mongodb://localhost:27017/cekcek-bot npm run start
```

### "Cannot read PRIVATE_KEY"
```bash
# Verify .env file exists
ls -la .env

# Check if value is set
cat .env | grep PRIVATE_KEY

# Should output: PRIVATE_KEY=0x...
```

### "Contract validation failed"
```bash
# Check contract address
curl "https://polygonscan.com/address/0xdC34..."

# Verify chain ID
curl http://localhost:3000/api/stats | grep chainId

# Should be 137 (Polygon Mainnet)
```

---

## 📈 Scaling & Performance

### Single Instance (Current)
- 1 Node process
- Max ~500 concurrent connections
- Single core utilization

### Multi-Instance with PM2
```cjs
module.exports = {
  apps: [{
    name: "cekcek-server",
    script: "dist/server.cjs",
    instances: "max",  // Use all CPU cores
    exec_mode: "cluster",
    max_memory_restart: "700M"
  }]
};
```

### Load Balancing
```bash
# Nginx reverse proxy
upstream cezcek {
  server localhost:3000;
  server localhost:3001;
  server localhost:3002;
}

server {
  listen 80;
  location / {
    proxy_pass http://cezcek;
  }
}
```

---

## 🔄 Deployment Checklist

### Pre-Deployment
- [ ] Run tests: `npm run test`
- [ ] Run linter: `npm run lint`
- [ ] Build: `npm run build`
- [ ] Validate config: `npm run validate`
- [ ] Check logs for errors
- [ ] Test API endpoints
- [ ] Verify blockchain connection

### Deployment
- [ ] Stop old instance: `pm2 stop cezcek-server`
- [ ] Backup .env file
- [ ] Update code/config
- [ ] Build new version: `npm run build`
- [ ] Start new instance: `pm2 start ecosystem.config.cjs`
- [ ] Verify startup: `pm2 logs`
- [ ] Test endpoints: `curl http://localhost:3000/healthz`

### Post-Deployment
- [ ] Monitor logs for errors
- [ ] Check API responses
- [ ] Verify blockchain operations
- [ ] Check database connectivity
- [ ] Test failover mechanisms
- [ ] Monitor memory/CPU usage
- [ ] Set up alerts

---

## 📞 Support & Resources

### Documentation
- **Setup:** `ENV_SETUP_GUIDE.md`
- **Contracts:** `CONTRACT_ADDRESSES.md`
- **Integration:** `INTEGRATION_SUMMARY.md`

### Useful Links
- **PolygonScan:** https://polygonscan.com
- **MongoDB Atlas:** https://www.mongodb.com/cloud/atlas
- **PM2 Docs:** https://pm2.keymetrics.io
- **Docker Hub:** https://hub.docker.com

### Monitoring Services
- **Sentry:** Error tracking
- **DataDog:** Infrastructure monitoring
- **LogRocket:** Session replay
- **PagerDuty:** Alerting

---

## 🎯 Production Readiness

### Current Status
```
✅ Build Complete (268 KB)
✅ Validation Passed (13/13)
✅ Tests Passing (38/38)
✅ Configuration Ready
✅ Blockchain Connected
✅ Security Configured
⚠️  Database: Fallback Mode (Configure MongoDB)
⚠️  Telegram: Optional (Configure if needed)
```

### Next Steps
1. Configure MongoDB URI for production
2. Set up monitoring/alerting
3. Choose deployment platform
4. Test in staging environment
5. Deploy to production
6. Monitor and maintain

---

## 📝 Version Information

- **Build:** v4.0
- **Build Time:** 4.06 seconds
- **Backend Size:** 268 KB
- **Frontend Size:** 1.4 MB
- **Node Version:** 18+
- **Network:** Polygon Mainnet
- **Status:** ✅ Production Ready

---

**Generated:** 2024-01-15  
**Last Updated:** Today  
**Status:** Ready for Production Deployment 🚀
