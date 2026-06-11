# ⚡ CEKCEK BOT - Quick Commands Reference

## 🚀 Start Commands

```bash
# Development Mode
npm run dev

# Production Build
npm run build

# Production Start (Direct)
node dist/server.cjs

# Production Start (PM2)
pm2 start ecosystem.config.cjs
pm2 logs cezcek-server

# Validate Configuration
npm run validate

# Run Tests
npm run test

# Type Check
npm run lint
```

---

## 📊 API Endpoints

```bash
# Health Check
curl http://localhost:3000/healthz

# Bot Statistics
curl http://localhost:3000/api/stats

# Optimize URL
curl -X POST http://localhost:3000/api/optimize-url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Blockchain Test
curl http://localhost:3000/api/test/onchain

# Stream Logs
curl http://localhost:3000/api/stream-logs
```

---

## 🔧 Configuration

```bash
# Edit Configuration
cat .env

# Validate Configuration
npm run validate

# View Setup Guide
cat ENV_SETUP_GUIDE.md

# View Contract Addresses
cat CONTRACT_ADDRESSES.md
```

---

## 📈 Monitoring

```bash
# View Live Logs
npm run dev 2>&1 | tee bot.log

# PM2 Logs
pm2 logs cezcek-server

# PM2 Monitor
pm2 monit

# View Error Logs Only
tail -f logs/error.log

# Watch All Logs
tail -f logs/*.log
```

---

## 🔒 Security

```bash
# Verify Private Key is Safe
grep PRIVATE_KEY .env | head -c 20

# Check Git Ignores .env
cat .gitignore | grep env

# Verify No Secrets in Code
grep -r "0x[a-fA-F0-9]\{40\}" src/ --exclude-dir=node_modules

# Validate Contract Addresses
npm run validate
```

---

## 📦 Build & Deploy

```bash
# Clean Build
npm run clean && npm run build

# Quick Deploy
npm run build && pm2 start ecosystem.config.cjs

# Docker Build
docker build -t cezcek-bot .

# Docker Run
docker run -d -p 3000:3000 --env-file .env cezcek-bot

# Check Build Size
du -sh dist/
```

---

## 🐛 Debugging

```bash
# Enable Debug Mode
DEBUG=true npm run dev

# Verbose Logging
VERBOSE_LOGGING=true npm run dev

# Specific Log Level
LOG_LEVEL=debug npm run dev

# Check Port Usage
netstat -an | grep 3000

# Find Process ID
lsof -ti :3000

# Kill Process
kill -9 <PID>
```

---

## 🧪 Testing

```bash
# Run All Tests
npm run test

# Run Tests with UI
npm run test:ui

# Run Tests with Coverage
npm run test:coverage

# Run Specific Test
npm run test -- optimizer.test.ts

# Watch Mode
npm run test -- --watch
```

---

## 📝 Database

```bash
# MongoDB Connection
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/db

# Local MongoDB
MONGO_URI=mongodb://localhost:27017/cezcek-bot

# Docker MongoDB
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Test Connection
mongosh "mongodb+srv://user:password@cluster/db"
```

---

## 🌍 Network

```bash
# Polygon Mainnet RPC
https://polygon.rpc.thirdweb.com

# Ethereum Mainnet RPC
https://ethereum.publicnode.com

# Test RPC Connection
curl -X POST https://polygon.rpc.thirdweb.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

---

## 💰 Blockchain

```bash
# Get POL Balance (via curl)
curl http://localhost:3000/api/wallet-balance

# Check Contract (PolygonScan)
https://polygonscan.com/address/0xdC34033509Bb6563309C59f64265Cc55FFF55eE4

# Get Test POL
https://faucet.polygon.technology/

# Send Transaction
curl -X POST http://localhost:3000/api/test/onchain \
  -H "Content-Type: application/json"
```

---

## 📞 Troubleshooting

```bash
# View Last 50 Lines of Logs
tail -50 logs/combined.log

# Check Disk Space
df -h

# Check Memory Usage
free -h

# View Running Processes
pm2 status

# Restart Bot
pm2 restart cezcek-server

# Stop Bot
pm2 stop cezcek-server

# Delete Bot from PM2
pm2 delete cezcek-server
```

---

## 🔄 Git Operations

```bash
# Commit Changes
git add .
git commit -m "Update configuration"
git push origin main

# View Changes
git status
git diff

# Revert Changes
git checkout .

# View Logs
git log --oneline -10
```

---

## 🎯 Common Workflows

### Quick Development
```bash
npm install
npm run dev
# Visit: http://localhost:3000
```

### Test & Validate
```bash
npm run validate
npm run test
npm run lint
```

### Production Deploy
```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 logs cezcek-server
```

### Troubleshoot Issue
```bash
npm run validate
tail -f logs/*.log
curl http://localhost:3000/healthz
curl http://localhost:3000/api/stats
```

### Update Configuration
```bash
# Edit .env file
nano .env

# Validate
npm run validate

# Restart
pm2 restart cezcek-server

# Check Logs
pm2 logs cezcek-server
```

---

## 🚨 Emergency Commands

```bash
# Emergency Stop
pm2 kill

# Emergency Restart
pm2 start ecosystem.config.cjs --force-publish-all

# View All Processes
pm2 list

# Clear PM2 Cache
pm2 delete all

# System Status
pm2 status

# Env List
pm2 env
```

---

## 📊 Quick Stats

```bash
# Check Current Configuration
echo "Database: $MONGO_URI"
echo "Contract: $CONTRACT_ADDRESS"
echo "Network: $CHAIN_NAME ($CHAIN_ID)"

# Check Bot Status
curl -s http://localhost:3000/api/stats | jq '.isCrawling, .totalCo2SavedGrams'

# Check Build Info
ls -lh dist/server.cjs
```

---

## 📚 Documentation Quick Links

```
ENV_SETUP_GUIDE.md         - Setup instructions
CONTRACT_ADDRESSES.md      - Contract reference
INTEGRATION_SUMMARY.md     - Configuration details
DEPLOYMENT_GUIDE.md        - Production deployment
FIX_SUMMARY.md            - Earlier fixes applied
QUICK_COMMANDS.md         - This file
```

---

**Last Updated:** 2024-01-15  
**Version:** v4.0  
**Status:** ✅ Ready to Use
