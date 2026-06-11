# 🔧 CEKCEK BOT - Environment Configuration Setup Guide

## 📋 Hızlı Başlangıç

### 1️⃣ **Step 1: .env Dosyasını Oluştur**

```bash
cp .env.example .env
```

### 2️⃣ **Step 2: Kritik Değerleri Güncelle**

Aşağıdaki değerleri `.env` dosyasında kendi verilerinle değiştirin:

```env
# 🔐 PRIVATE KEY - Wallet private key (başında 0x olmadan)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# 👤 ACCOUNT ADDRESS - Wallet address
ACCOUNT_ADDRESS=0xYOUR_WALLET_ADDRESS

# 🗄️ DATABASE - MongoDB connection
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/cekcek-bot

# 📱 TELEGRAM (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 3️⃣ **Step 3: Production Mode Aç**

Sadece gerçek işlemler için:

```env
PRODUCTION_MODE=true
```

---

## 🌐 Network Konfigürasyonu

### Polygon Mainnet (Önerilen)
```env
CHAIN_ID=137
CHAIN_NAME=Polygon
POLYGON_RPC_URL=https://polygon.rpc.thirdweb.com
CONTRACT_ADDRESS=0xdC34033509Bb6563309C59f64265Cc55FFF55eE4
```

### Multi-Chain Support
Bot aynı anda birden fazla ağı destekler:

```env
# Ethereum
ETH_WS_URL=https://ethereum.publicnode.com

# BSC
BSC_WS_URL=https://bsc.publicnode.com

# Arbitrum
ARB_WS_URL=https://arbitrum.publicnode.com

# Base
BASE_WS_URL=https://base.publicnode.com

# Avalanche
AVAX_WS_URL=https://avalanche.publicnode.com
```

---

## 🏪 Smart Contract Adresler

### Polygon Mainnet Contracts

| Kontrat | Adres | Açıklama |
|---------|-------|----------|
| **Smart Gate** | `0xdC34033509Bb6563309C59f64265Cc55FFF55eE4` | Ana ticaret kontratı |
| **Green Token** | `0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE` | KECO token kontratı |
| **Router** | `0xa5e0829caced8ffdd052420551415491d6993e2f` | DEX Router (QuickSwap) |
| **Payout Wallet** | `0x06E83497F599D67447EfFfeA399cC885CEB6eEff` | Kazanç cüzdanı |
| **Commission Wallet** | `0x71C7656EC7ab88b098defB751B7401B5f6d8976F` | Komisyon alıcısı |

---

## ⚙️ Bot Ayarları

### Scan & Trading
```env
# Tarama aralığı (ms) - 2000 = 2 saniye
SCAN_INTERVAL=2000

# Günlük işlem limiti
DAILY_TRADE_LIMIT=50

# Minimum likidite (USDC, 6 decimals)
MIN_LIQUIDITY=50000000000

# Minimum kâr eşiği (%0.5)
MIN_PROFIT_THRESHOLD=0.005

# Slippage toleransı (%)
SLIPPAGE_TOLERANCE=5
```

### Gas Configuration
```env
# Gas limiti
GAS_LIMIT=500000

# Maksimum gas fiyatı (Gwei)
MAX_GAS_PRICE=300

# Gas fiyat eşiği
GAS_PRICE_THRESHOLD=200

# Max priority fee (35 Gwei)
MAX_PRIORITY_FEE=35000000000
```

### Portfolio Management
```env
# Toplam portföy değeri (USDC, 6 decimals)
PORTFOLIO_CAPITAL=1000000000

# Ticaret başına maksimum risk (%)
MAX_RISK_PER_TRADE=5

# Minimum yeniden yatırım eşiği (USDT)
MIN_REINVEST_THRESHOLD=5
```

---

## 🔗 API & Service Endpoints

### DEX Aggregators (Liquidity)
```env
# 1inch - Best rates
ONEINCH_API=https://api.1inch.io/v6.0

# ParaSwap - Multi-route swaps
PARASWAP_API=https://api.paraswap.io/v2

# OpenOcean - Alternative routing
OPENOCEAN_API=https://api.openocean.finance/v3
```

### Ocean Protocol (Data Markets)
```env
AQUARIUS_URL=https://subgraph.mainnet.oceanprotocol.com/subgraphs/name/oceanprotocol/ocean-subgraph
```

### MEV & Flashbots
```env
FLASHBOTS_RELAY=https://relay.flashbots.net
MEV_SHARE_RELAY=https://mev-share.flashbots.net
FLASHBOTS_ENABLED=true
```

---

## ⚡ Flash Loan Configuration

```env
# Flash Loan Aktif
FLASH_LOAN_ENABLED=true

# Kaldıraç Oranı (10x = 10,000 USDC çıkış, 1,000 giriş ile)
FLASH_LOAN_LEVERAGE=10

# Protokol (aave veya uniswapv3)
FLASH_LOAN_PROTOCOL=aave

# Ödünç alınan miktar (USDC, 6 decimals)
FLASH_LOAN_AMOUNT=10000000000
```

---

## 🛡️ Güvenlik Ayarları

### Dark Forest Defense
```env
# Obfuscation seviyesi
OBFUSCATION_LEVEL=high

# Sahte işlem sayısı (MEV koruması)
DECOY_TRANSACTIONS=2

# Router Randomizasyonu
ROUTER_RANDOMIZATION=true

# Timing Randomizasyonu
TIMING_RANDOMIZATION=true
```

### Validation
```env
# HTTPS zorunlu
ENABLE_HTTPS=true

# Kontrat adresi doğrulama
VERIFY_CONTRACT_ADDRESS=true

# İşlem verisi doğrulama
VALIDATE_TRANSACTION_DATA=true
```

---

## 📊 Monitoring & Logging

```env
# Log seviyesi (info, debug, error)
LOG_LEVEL=info

# Log dizini
LOG_DIR=./logs

# İstatistik dosyası
STATS_FILE=./bot-stats-pro.json

# İstatistik kontrol aralığı (ms)
STATS_INTERVAL=60000

# Watchdog monitoring
WATCHDOG_ENABLED=true
WATCHDOG_CHECK_INTERVAL=10000
```

### Failover Providers
```env
# Primary RPC
PROVIDER_1_URL=https://polygon.rpc.thirdweb.com

# Secondary RPC
PROVIDER_2_URL=https://polygon.publicnode.com

# Tertiary RPC
PROVIDER_3_URL=https://1rpc.io/matic

# Max failover denemesi
MAX_FAILOVER_ATTEMPTS=10
```

---

## 🚀 Başlatma Komutları

### Development Mode
```bash
npm run dev
# Bot testnet ayarları ile çalışır, gerçek işlem yapmaz
```

### Production Mode
```bash
npm run build
npm run start
# PRODUCTION_MODE=true olmalı!
```

### PM2 Daemon (Always On)
```bash
pm2 start ecosystem.config.js
pm2 logs cekcek-server
```

---

## ⚠️ Güvenlik Checklist

- [ ] `.env` dosyası `.gitignore`'da var mı?
- [ ] PRIVATE_KEY sadece lokal `.env` dosyasında mı?
- [ ] MONGO_URI production database'i işaret ediyor mu?
- [ ] PRODUCTION_MODE=true sadece mainnet için mi?
- [ ] Testnet'te test ettikten sonra mainnet'e geçtim mi?
- [ ] İlk işlemleri küçük miktarla yapıyorum mu?
- [ ] Cüzdan suficient POL/ETH var mı?

---

## 🔍 Troubleshooting

### "Cannot find RPC URL" Hatası
```
Çözüm: POLYGON_RPC_URL veya PROVIDER_1_URL kontrol et
```

### "Insufficient funds" Hatası
```
Çözüm: Cüzdanda yeterli POL (gas) var mı kontrol et
```

### "Invalid private key" Hatası
```
Çözüm: PRIVATE_KEY başında 0x var mı kontrol et
```

### "Contract not found" Hatası
```
Çözüm: CONTRACT_ADDRESS doğru blockchain'de mi var kontrol et
```

---

## 📞 Support

Konfigürasyon sorunları için:
1. `.env.example` ile `.env` karşılaştır
2. Contract adreslerini blockchain explorer'da kontrol et
3. RPC endpoint'inin çalışıp çalışmadığını test et

---

**Generated:** 2024-01-15  
**Bot Version:** v4.0  
**Last Updated:** Today
