# 📋 CEKCEK BOT - Smart Contract Adresleri ve Konfigürasyon

## 🌍 Polygon Mainnet Contracts

### Primary Contracts

| Kontrat | Adres | Amaç | Status |
|---------|-------|------|--------|
| **Smart Gate / Data NFT Factory** | `0xdC34033509Bb6563309C59f64265Cc55FFF55eE4` | Ana ticaret ve veri erişim kontratı | ✅ Aktif |
| **Green Token (KECO)** | `0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE` | Karbon ve veri özyakıt tokeni | ✅ Aktif |
| **Router (QuickSwap)** | `0xa5e0829caced8ffdd052420551415491d6993e2f` | Likidite swap router | ✅ Aktif |

### Wallet Addresses

| Cüzdan | Adres | Amaç |
|--------|-------|------|
| **Payout Wallet** | `0x06E83497F599D67447EfFfeA399cC885CEB6eEff` | Kazanç çıkışı |
| **Commission Wallet** | `0x71C7656EC7ab88b098defB751B7401B5f6d8976F` | Komisyon alıcısı |

---

## 🔗 Standart Token Adresleri

### Polygon Mainnet ERC-20 Tokens

| Token | Adres | Decimals | Açıklama |
|-------|-------|----------|----------|
| **USDT** | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 | Stablecoin |
| **USDC** | `0x2791Bca1f2de4661ED88A30C99A7a9B1W3330145` | 6 | Stablecoin |
| **WMATIC** | `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270` | 18 | Wrapped MATIC |
| **DAI** | `0x8f3Cf7ad23Cd3CaDbD9735AFf958023D60d76ee6` | 18 | Stablecoin |

---

## 🔐 Environment Variables (.env)

### Gerekli Değişkenler

```env
# ============ Network ============
CHAIN_ID=137
CHAIN_NAME=Polygon
POLYGON_RPC_URL=https://polygon.rpc.thirdweb.com
POLYGON_WS_URL=https://polygon.rpc.thirdweb.com

# ============ Contracts ============
CONTRACT_ADDRESS=0xdC34033509Bb6563309C59f64265Cc55FFF55eE4
GREEN_TOKEN_ADDRESS=0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE
ROUTER_ADDRESS=0xa5e0829caced8ffdd052420551415491d6993e2f

# ============ Wallets ============
PAYOUT_WALLET=0x06E83497F599D67447EfFfeA399cC885CEB6eEff
ACCOUNT_ADDRESS=0x06E83497F599D67447EfFfeA399cC885CEB6eEff
COMMISSION_WALLET=0x71C7656EC7ab88b098defB751B7401B5f6d8976F

# ============ Private Key ============
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# ============ Database ============
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/cekcek-bot
```

---

## 📊 Contract ABIs

### Smart Gate (Data NFT Factory)

```solidity
interface ISmartGate {
    // Veri kaydetme
    function registerDataAsset(uint256 amount, string memory proof) external returns (bool);
    
    // Veri satın alma
    function buyAsset(string memory id, uint256 price, bytes memory signature) external payable returns (bool);
    
    // Token minting
    function mint(address to, uint256 amount) external;
    
    // Bakiye sorgulama
    function balanceOf(address owner) external view returns (uint256);
}
```

### Green Token (ERC-20)

```solidity
interface IERC20 {
    // Standart ERC-20 fonksiyonları
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
```

---

## 🔄 Multi-Chain Support

### Desteklenen Ağlar

```env
# Ethereum
ETH_WS_URL=https://ethereum.publicnode.com

# Binance Smart Chain
BSC_WS_URL=https://bsc.publicnode.com

# Arbitrum
ARB_WS_URL=https://arbitrum.publicnode.com

# Base
BASE_WS_URL=https://base.publicnode.com

# Avalanche
AVAX_WS_URL=https://avalanche.publicnode.com
```

### Cross-Chain Router Configuration

Bot her ağda eşit havuz taraması yapabilir:

1. **Polygon Mainnet** (Primary) - En düşük işlem ücretleri
2. **Arbitrum** - Yüksek likidite
3. **Base** - Coinbase tarafından desteklenen
4. **BSC** - Binance ekosistemi
5. **Ethereum** - En büyük likidite

---

## 🛡️ Güvenlik & Validation

### Contract Doğrulama

Bot aşağıdaki kontrolleri yapar:

```typescript
// 1. Adres formatı doğrulama
if (!isValidEthereumAddress(contractAddress)) {
    throw new Error('Invalid contract address format');
}

// 2. Kontrat kodu varlığı doğrulama
const code = await provider.getCode(contractAddress);
if (code === '0x') {
    throw new Error('No contract code at address');
}

// 3. Ağ kontrol
const currentChainId = await provider.getNetwork();
if (currentChainId !== expectedChainId) {
    throw new Error('Wrong network');
}
```

---

## 🧪 Test & Validation

### Environment Validasyonu

```bash
# Tüm env değişkenlerini doğrula
npm run validate

# Output örneği:
# ✅ CONTRACT_ADDRESS: 0xdC34...
# ✅ GREEN_TOKEN_ADDRESS: 0x88AB...
# ✅ PRIVATE_KEY: (hidden)
# ✅ All validations passed!
```

### Contract Interaction Test

```bash
# Server başlat (validation ile)
npm run dev

# Logs:
# [STARTUP] CEKCEK SUPER BOT v4.0 başlatılıyor...
# [CONFIG] Blockchain Config yüklendi:
#   - Network: Polygon (ID: 137)
#   - Contract: 0xdC34...
#   - Payout: 0x06E8...
#   - RPC: https://polygon.rpc...
```

---

## 📈 Monitörleme & Debugging

### Contract Status Check

```bash
# API endpoint ile kontrat durumu kontrol et
curl http://localhost:3000/api/stats

# Response örneği:
{
  "contractAddress": "0xdC34033509Bb6563309C59f64265Cc55FFF55eE4",
  "isCrawling": true,
  "dataAssetRegistrations": 150,
  "totalCo2SavedGrams": 5250,
  "totalAccessFeesCollected": 2500
}
```

### BlockExplorer Links

- **PolygonScan:** https://polygonscan.com/
- **Smart Gate:** https://polygonscan.com/address/0xdC34033509Bb6563309C59f64265Cc55FFF55eE4
- **Green Token:** https://polygonscan.com/address/0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE
- **Router:** https://polygonscan.com/address/0xa5e0829caced8ffdd052420551415491d6993e2f

---

## ⚡ Flash Loan Integration

### Desteklenen Protokoller

```env
# Aave Flash Loan
FLASH_LOAN_PROTOCOL=aave
FLASH_LOAN_LEVERAGE=10
FLASH_LOAN_AMOUNT=10000000000  # 10,000 USDC

# UniswapV3 Flash Loan
FLASH_LOAN_PROTOCOL=uniswapv3
FLASH_LOAN_LEVERAGE=5
```

### Flash Loan Akışı

```
1. Bot arbitraj fırsat tespit eder
2. Aave'den USDC ödünç alır (leverage)
3. Multiple DEX'te swap yapar
4. Kar sağlanırsa ödünç alınan tutarı geri öder
5. Kalanı payout cüzdanına gönderir
```

---

## 🔔 Event Monitoring

### Smart Gate Events

```solidity
event DataAssetRegistered(uint256 amount, string proof);
event AssetSold(string id, address buyer, uint256 price);
event BulkRegistered(uint256 count);
```

Bot bu event'leri dinler ve:
- Yeni veri kaydını işler
- Satış doğrularını loglar
- Toplu işlemleri hazırlar

---

## 🚨 Troubleshooting

### "Contract not found" Hatası
```
✓ Kontrat adresini PolygonScan'de doğrula
✓ Ağın Polygon Mainnet (Chain ID: 137) olduğunu kontrol et
✓ RPC endpoint'inin erişilebilir olduğunu kontrol et
```

### "Invalid private key" Hatası
```
✓ PRIVATE_KEY format: 0x + 64 hex karakteri
✓ PRODUCTION_MODE=true ise PRIVATE_KEY zorunlu
✓ Private key'i asla share etme
```

### "Insufficient funds" Hatası
```
✓ Cüzdanında yeterli POL var mı kontrol et
✓ Gas fee hesaplamasını kontrol et
✓ Minimum likidite eşiğini kontrol et
```

---

## 📞 Support & Resources

- **Documentation:** `ENV_SETUP_GUIDE.md`
- **Configuration:** `.env.example`
- **Contracts:** Smart Gate + Green Token
- **Network:** Polygon Mainnet

---

**Generated:** 2024-01-15  
**Version:** CEKCEK SUPER BOT v4.0  
**Network:** Polygon Mainnet  
**Status:** ✅ Production Ready
