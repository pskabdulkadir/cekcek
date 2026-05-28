/**
 * @file config.ts
 * @description Central configuration handler for blockchain and database settings.
 */

import * as dotenv from "dotenv";

// .env dosyasını açıkça yükle
const envResult = dotenv.config();
if (envResult.error && !process.env.PRIVATE_KEY) {
  console.warn("⚠️  .env dosyası bulunamadı, varsayılan değerler kullanılıyor.");
}

// Debug: Ortam değişkenlerini kontrol et
console.log("DEBUG: PRIVATE_KEY kontrolü:", process.env.PRIVATE_KEY ? "YÜKLÜ" : "BOŞ!");
console.log("DEBUG: MONGO_URI kontrolü:", process.env.MONGO_URI ? "YÜKLÜ" : "BOŞ (varsayılan kullanılacak)");

// GÜVENLİK KRİTİK: Üretim modunda gizli değişkenler zorunludur
if (process.env.NODE_ENV === 'production') {
    if (!process.env.MONGO_URI) throw new Error("FATAL: MONGO_URI is missing in production!");
    if (!process.env.PRIVATE_KEY) throw new Error("FATAL: PRIVATE_KEY is missing in production!");
}

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dev_db';

export const blockchainConfig = {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    appUrl: process.env.APP_URL || '',
    contractAddress: process.env.CONTRACT_ADDRESS || process.env.SMART_GATE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000', // Data NFT Factory veya Veri Erişim Kontratı
    payoutWallet: process.env.CHANNEL_ROUTING_WALLET || process.env.PAYOUT_WALLET || '',
    commissionWallet: process.env.COMMISSION_WALLET || '', // Aracı firma cüzdanı (Örn: Smart Gate)
    commissionRate: parseFloat(process.env.COMMISSION_RATE || '0.10'), // %10 Komisyon oranı
    rpcUrl: process.env.RPC_URL || 'https://polygon-rpc.com', // Varsayılan olarak Polygon Mainnet RPC
    privateKey: process.env.PRIVATE_KEY || process.env.INCOME_DISTRIBUTION_WALLET || '',
    zeroGasActive: false,
    networkMode: process.env.NETWORK_MODE || 'mainnet',
    useAiAnalysis: process.env.USE_AI_ANALYSIS === 'true',
    sharedPoolEnabled: process.env.SHARED_DISTRIBUTION_POOL_ENABLED === 'true',
    batchMining: process.env.BATCH_MINING !== 'false', // Varsayılan olarak true, .env'den false gelirse false olur
    marketplaceApiUrl: process.env.MARKETPLACE_API_URL || '', // Geçersiz domain temizlendi
    oceanProtocolUrl: process.env.OCEAN_API_URL || 'https://ocean.api/v1/data-assets', // Ocean Protocol veri varlığı API adresi
    middlewareWebhookUrl: process.env.MIDDLEWARE_URL || 'https://hook.make.com/your-webhook-id',
    openSeaApiUrl: process.env.OPENSEA_API_URL || 'https://api.opensea.io/v1/asset/create',
    googleSheetsUrl: process.env.GOOGLE_SHEETS_URL || 'https://script.google.com/macros/s/AKfycbxmke0-Fu1FuY0_W6dliNvjm7eH9tOlW2tfOzxJgkEZr2uLY7FIPZ4iDKmn1ZSoV8vo/exec',
    batchTradeThresholdMB: parseFloat(process.env.BATCH_TRADE_THRESHOLD_MB || '500'),
    dailyGoalUSD: parseFloat(process.env.DAILY_GOAL_USD || '3000'),
    // marketOrderTicker: process.env.MARKET_ORDER_TICKER || 'BTC/USDT', // Binance bağımlılığı kaldırıldı, bu satır artık gerekli değil
    liquidityPoolAddress: process.env.LIQUIDITY_POOL_ADDRESS || '0x0000000000000000000000000000000000000000',
    greenTokenAddress: process.env.GREEN_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000'
};

export const dbConfig = {
    uri: mongoUri,
    dbName: process.env.CRAWLER_DB_NAME || 'geridonüşüm',
};
