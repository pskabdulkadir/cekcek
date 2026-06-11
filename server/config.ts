/**
 * @file config.ts
 * @description Central configuration handler for blockchain and database settings.
 */

import * as dotenv from "dotenv";

// .env dosyasını açıkça yükle
const envResult = dotenv.config();

// Geliştirici ve Render Ortamı Proxy Temizleyici
const cleanProxyEnvs = () => {
  const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
  for (const k of proxyKeys) {
    const val = process.env[k];
    if (val) {
      if (
        val.includes("proxy.server.com") || 
        val.includes("your-proxy") || 
        val.includes("example.com") || 
        val.includes(":port") || 
        val.trim() === ""
      ) {
        console.log(`[PROXY_CLEANUP] Geçersiz/Taslak proxy ortam değişkeni temizlendi: ${k}=${val}`);
        delete process.env[k];
      }
    }
  }
};
cleanProxyEnvs();

if (envResult.error && !process.env.PRIVATE_KEY) {
  console.warn("⚠️  .env dosyası bulunamadı, varsayılan değerler kullanılıyor.");
}

// Debug: Ortam değişkenlerini kontrol et
console.log("DEBUG: PRIVATE_KEY kontrolü:", process.env.PRIVATE_KEY ? "YÜKLÜ" : "BOŞ!");
console.log("DEBUG: MONGO_URI kontrolü:", process.env.MONGO_URI ? "YÜKLÜ" : "BOŞ (varsayılan kullanılacak)");
console.log("DEBUG: CONFIG_OVERRIDE kontrolü:", process.env.CONFIG_OVERRIDE ? "TRUE" : "FALSE (varsayılan kullanılacak)");
console.log("DEBUG: GREEN_TOKEN_ADDRESS:", process.env.GREEN_TOKEN_ADDRESS || "BOŞ (varsayılan: 0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE)");
console.log("DEBUG: SMART_GATE_CONTRACT_ADDRESS / CONTRACT_ADDRESS:", process.env.CONTRACT_ADDRESS || process.env.SMART_GATE_CONTRACT_ADDRESS || "BOŞ (varsayılan: 0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE)");
console.log("DEBUG: AQUARIUS_URL:", 'https://aquarius.oceanprotocol.com'); // Ana ağ geçidi

// GÜVENLİK KRİTİK: Üretim modunda gizli değişkenler zorunludur
if (process.env.NODE_ENV === 'production') {
    if (!process.env.MONGO_URI) throw new Error("FATAL: MONGO_URI is missing in production!");
    if (!process.env.PRIVATE_KEY) throw new Error("FATAL: PRIVATE_KEY is missing in production!");
}

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dev_db';

const OLD_ADDRESS = "0x4C304a6a923C3Fb92a87583dbABCcbE1dDeb6886";
const NEW_ADDRESS = "0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE";

const sanitizeAddress = (addr: string | undefined): string => {
  if (!addr) return NEW_ADDRESS;
  if (addr.toLowerCase() === OLD_ADDRESS.toLowerCase()) {
    console.log(`[REWRITE_ADDRESS] Eski kontrat adresi (${addr}) tespit edildi, yeni adres ile güncelleniyor: ${NEW_ADDRESS}`);
    return NEW_ADDRESS;
  }
  return addr;
};

const contractAddressEnv = sanitizeAddress(process.env.CONTRACT_ADDRESS || process.env.SMART_GATE_CONTRACT_ADDRESS);
const greenTokenAddressEnv = sanitizeAddress(process.env.GREEN_TOKEN_ADDRESS);

export const blockchainConfig = {
    // ============ BASIC CONFIGURATION ============
    vitePublicBuilderKey: process.env.VITE_PUBLIC_BUILDER_KEY || '690dc81201dd442691c0fbf0269adbab',
    geminiApiKey: process.env.GEMINI_API_KEY || 'KULLANILMIYOR',
    oceanApiKey: process.env.OCEAN_API_KEY || 'DUMMY_KEY',
    appUrl: process.env.APP_URL || '',
    configOverride: process.env.CONFIG_OVERRIDE === 'true',

    // ============ NETWORK & RPC CONFIGURATION ============
    chainId: parseInt(process.env.CHAIN_ID || '137'), // Polygon Mainnet
    chainName: process.env.CHAIN_NAME || 'Polygon',
    polygonRpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon.rpc.thirdweb.com',
    polygonWsUrl: process.env.POLYGON_WS_URL || 'https://polygon.rpc.thirdweb.com',
    rpcUrl: process.env.POLYGON_RPC_URL || process.env.RPC_URL || 'https://polygon.rpc.thirdweb.com',
    rpcTimeout: parseInt(process.env.RPC_TIMEOUT || '60000'),

    // ============ MULTI-CHAIN RPC ENDPOINTS ============
    ethRpcUrl: process.env.ETH_WS_URL || 'https://ethereum.publicnode.com',
    bscRpcUrl: process.env.BSC_WS_URL || 'https://bsc.publicnode.com',
    avaxRpcUrl: process.env.AVAX_WS_URL || 'https://avalanche.publicnode.com',
    arbRpcUrl: process.env.ARB_WS_URL || 'https://arbitrum.publicnode.com',
    baseRpcUrl: process.env.BASE_WS_URL || 'https://base.publicnode.com',

    // ============ FAILOVER PROVIDERS ============
    provider1Url: process.env.PROVIDER_1_URL || 'https://polygon.rpc.thirdweb.com',
    provider2Url: process.env.PROVIDER_2_URL || 'https://polygon.publicnode.com',
    provider3Url: process.env.PROVIDER_3_URL || 'https://1rpc.io/matic',
    maxFailoverAttempts: parseInt(process.env.MAX_FAILOVER_ATTEMPTS || '10'),

    // ============ CONTRACT ADDRESSES (MAIN) ============
    contractAddress: process.env.CONTRACT_ADDRESS || '0xdC34033509Bb6563309C59f64265Cc55FFF55eE4',
    greenTokenAddress: process.env.GREEN_TOKEN_ADDRESS || '0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE',
    routerAddress: process.env.ROUTER_ADDRESS || '0xa5e0829caced8ffdd052420551415491d6993e2f',

    // ============ WALLET ADDRESSES ============
    payoutWallet: process.env.PAYOUT_WALLET || process.env.ACCOUNT_ADDRESS || '0x06E83497F599D67447EfFfeA399cC885CEB6eEff',
    commissionWallet: process.env.COMMISSION_WALLET || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    accountAddress: process.env.ACCOUNT_ADDRESS || '0x06E83497F599D67447EfFfeA399cC885CEB6eEff',
    commissionRate: parseFloat(process.env.COMMISSION_RATE || '0.10'),

    // ============ PRIVATE KEY & SECURITY ============
    privateKey: process.env.PRIVATE_KEY || '',
    productionMode: process.env.PRODUCTION_MODE === 'true',

    // ============ PROTOCOL SETTINGS ============
    networkMode: 'mainnet',
    zeroGasActive: false,
    useAiAnalysis: process.env.USE_AI_ANALYSIS === 'true',
    sharedPoolEnabled: process.env.SHARED_DISTRIBUTION_POOL_ENABLED === 'true',
    batchMining: process.env.BATCH_MINING !== 'false',
    autoReinvest: process.env.AUTO_REINVEST === 'true',

    // ============ GAS & TRANSACTION SETTINGS ============
    maxPriorityFee: process.env.MAX_PRIORITY_FEE || '30000000000', // 30 Gwei
    gasPriceLimit: process.env.GAS_PRICE_LIMIT || '80000000000', // 80 Gwei
    gasLimit: parseInt(process.env.GAS_LIMIT || '500000'),
    gasThreshold: parseInt(process.env.GAS_PRICE_THRESHOLD || '200'),

    // ============ TRADING & LIQUIDITY SETTINGS ============
    minReinvestThreshold: parseFloat(process.env.MIN_REINVEST_THRESHOLD || '5'),
    minLiquidityThreshold: parseInt(process.env.MIN_LIQUIDITY || '50000000000'),
    minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD || '0.005'),
    slippageTolerance: parseFloat(process.env.SLIPPAGE_TOLERANCE || '5'),
    batchTradeThresholdMB: parseFloat(process.env.BATCH_TRADE_THRESHOLD_MB || '500'),
    publishBatchSize: parseInt(process.env.PUBLISH_BATCH_SIZE || '10'),

    // ============ BOT CONFIGURATION ============
    scanInterval: parseInt(process.env.SCAN_INTERVAL || '2000'),
    dailyTradeLimit: parseInt(process.env.DAILY_TRADE_LIMIT || '50'),
    maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE || '5'),
    portfolioCapital: parseInt(process.env.PORTFOLIO_CAPITAL || '1000000000'),

    // ============ MONITORING & WATCHDOG ============
    watchdogEnabled: process.env.WATCHDOG_ENABLED !== 'false',
    watchdogCheckInterval: parseInt(process.env.WATCHDOG_CHECK_INTERVAL || '10000'),
    maxConsecutiveErrors: parseInt(process.env.MAX_CONSECUTIVE_ERRORS || '5'),
    reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '5000'),

    // ============ API ENDPOINTS & SERVICES ============
    oceanProtocolUrl: process.env.AQUARIUS_URL || 'https://subgraph.mainnet.oceanprotocol.com/subgraphs/name/oceanprotocol/ocean-subgraph',
    oneInchApi: process.env.ONEINCH_API || 'https://api.1inch.io/v6.0',
    paraswapApi: process.env.PARASWAP_API || 'https://api.paraswap.io/v2',
    openOceanApi: process.env.OPENOCEAN_API || 'https://api.openocean.finance/v3',
    flashbotsRelay: process.env.FLASHBOTS_RELAY || 'https://relay.flashbots.net',
    mevShareRelay: process.env.MEV_SHARE_RELAY || 'https://mev-share.flashbots.net',

    // ============ FLASH LOAN SETTINGS ============
    flashLoanEnabled: process.env.FLASH_LOAN_ENABLED === 'true',
    flashLoanLeverage: parseInt(process.env.FLASH_LOAN_LEVERAGE || '10'),
    flashLoanProtocol: process.env.FLASH_LOAN_PROTOCOL || 'aave',
    flashLoanAmount: parseInt(process.env.FLASH_LOAN_AMOUNT || '10000000000'),

    // ============ FLASHBOTS & MEV ============
    flashbotsEnabled: process.env.FLASHBOTS_ENABLED === 'true',

    // ============ OBFUSCATION & SECURITY ============
    obfuscationLevel: process.env.OBFUSCATION_LEVEL || 'high',
    decoyTransactions: parseInt(process.env.DECOY_TRANSACTIONS || '2'),
    routerRandomization: process.env.ROUTER_RANDOMIZATION === 'true',
    timingRandomization: process.env.TIMING_RANDOMIZATION === 'true',

    // ============ THIRD-PARTY SERVICES ============
    marketplaceApiUrl: process.env.MARKETPLACE_API_URL || '',
    middlewareWebhookUrl: process.env.MIDDLEWARE_URL || 'https://hook.make.com/your-webhook-id',
    openSeaApiUrl: process.env.OPENSEA_API_URL || 'https://api.opensea.io/v1/asset/create',
    googleSheetsUrl: process.env.GOOGLE_SHEETS_URL || '',

    // ============ LOGGING & STATISTICS ============
    logLevel: process.env.LOG_LEVEL || 'info',
    logDir: process.env.LOG_DIR || './logs',
    statsFile: process.env.STATS_FILE || './bot-stats-pro.json',
    statsInterval: parseInt(process.env.STATS_INTERVAL || '60000'),

    // ============ DEBUG SETTINGS ============
    debug: process.env.DEBUG === 'true',
    verboseLogging: process.env.VERBOSE_LOGGING === 'true',

    // ============ SECURITY SETTINGS ============
    enableHttps: process.env.ENABLE_HTTPS === 'true',
    verifyContractAddress: process.env.VERIFY_CONTRACT_ADDRESS === 'true',
    validateTransactionData: process.env.VALIDATE_TRANSACTION_DATA === 'true',
    dailyGoalUSD: parseFloat(process.env.DAILY_GOAL_USD || '3000'),
    bridgeActive: process.env.BRIDGE_ACTIVE !== 'false',
    liquidityPoolAddress: process.env.LIQUIDITY_POOL_ADDRESS || '0x7a69621865726e61746976655f47415445574159', // DEX Likidite Adresi
    bridgeApiUrl: process.env.BRIDGE_API_URL || '', // Opsiyonel: Dış borsalara veri çıkışı için Gateway URL
    bridgeAuthToken: process.env.BRIDGE_AUTH_TOKEN || '', // Ticari Köprü Yetkilendirme Tokenı
    proxySettlementUrl: '', // Geçersiz DNS adresi temizlendi
    gasRefillEnabled: process.env.GAS_REFILL_ENABLED !== 'false', // Otomatik yakıt doldurma aktif mi?
    gasRefillThreshold: parseFloat(process.env.GAS_REFILL_THRESHOLD || '0.5'), // 0.5 POL altına düşerse işlem yapma/doldur
    gasRefillUsdtAmount: parseFloat(process.env.GAS_REFILL_USDT_AMOUNT || '5.0'), // 5 USDT'lik yakıt al
    crawlMode: process.env.CRAWL_MODE || 'DATA_RECLAMATION' // DATA_RECLAMATION veya WEB_CRAWLER modu
};

export const dbConfig = {
    uri: mongoUri,
    dbName: process.env.CRAWLER_DB_NAME || 'geridonüşüm',
};
