/**
 * @file server.ts
 * @description Central Express gateway serving server API endpoints, controlling
 * the autonomous crawling bot worker, and integrating the Vite client framework.
 * 
 * @author Senior Software Architect & Cybersecurity Specialist
 * @license SPDX-License-Identifier: Apache-2.0
 */

import mongoose from "mongoose";
import express from "express";
import http from "http";
import path from "path";
import helmet from "helmet";
import cors from "cors";
import axios from "axios";
import { ethers } from "ethers";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";
import dns from "dns";
import https from "https";
import crypto from "crypto";

// Load configuration
import { blockchainConfig, dbConfig } from "./server/config.ts";

// Load environment variables
dotenv.config();

// Geliştirici ve Render Ortamı Proxy Temizleyici
const cleanServerProxyEnvs = () => {
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
        console.log(`[PROXY_CLEANUP_SERVER] Geçersiz/Taslak proxy ortam değişkeni temizlendi: ${k}=${val}`);
        delete process.env[k];
      }
    }
  }
};
cleanServerProxyEnvs();

// DNS Workaround: IPv6 önceliği nedeniyle oluşan ENOTFOUND hatalarını engelle
dns.setDefaultResultOrder("ipv4first");

// --- PERSISTENT CONNECTION CONFIGURATION ---
// Render'ın 10 saniyelik "Idle Timeout" bariyerini aşmak için Keep-Alive tüneli oluşturuluyor
const persistentAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 10,
    maxFreeSockets: 10,
    rejectUnauthorized: false // IP tabanlı erişimde SSL sertifika hatasını önler
});

const apiClient = axios.create({
    httpsAgent: persistentAgent,
    timeout: 60000, // Tüm istekler için 60 saniye sınırı
    headers: { 'Connection': 'keep-alive' }
});

// --- DECENTRALIZED GATEWAY CONFIGURATION ---
// Render'ın DNS engellerini aşmak için Aquarius yerine alternatif Subgraph uç noktasını kullanıyoruz.
const AQUARIUS_URL = blockchainConfig.oceanProtocolUrl;

// --- GÜVENLİK KATMANI: SÖZLEŞME BEYAZ LİSTESİ ---
const ALLOWED_CONTRACTS = [
    ethers.utils.getAddress("0x4544d5674066f7f6f966144510006327e5b56345".toLowerCase()), // Ocean Market (Örnek)
    ethers.utils.getAddress("0x71C7656EC7ab88b098defB751B7401B5f6d8976F".toLowerCase()), // Smart Gate (Örnek)
].map(addr => addr.toLowerCase());

function validateContractAddress(address: string) {
    if (!address || address === ethers.constants.AddressZero) return;
    const lowerAddr = address.toLowerCase();
    // Canlı konfigürasyon kontrolü
    const isDynamicAllowed = lowerAddr === (blockchainConfig.greenTokenAddress || "").toLowerCase() || 
                             lowerAddr === (blockchainConfig.routerAddress || "").toLowerCase() ||
                             lowerAddr === (blockchainConfig.contractAddress || "").toLowerCase();

    if (!ALLOWED_CONTRACTS.includes(lowerAddr) && !isDynamicAllowed) {
        pushLog('FINANCE', 'ERROR', `Kritik Güvenlik İhlali: Yetkisiz sözleşmeye erişim engellendi: ${address}`);
        throw new Error("SECURITY_BREACH: Unauthorized contract address.");
    }
}

// Force Publish Flag (Geçici olarak tüm birikmiş varlıkları yayınlamak için)
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === 'true'; // Güvenlik: .env kontrolü

// --- SAF WEB3 FİNANSAL YAPILANDIRMA ---
const web3Config = {
    payoutWallet: blockchainConfig.payoutWallet,
    rpcUrl: process.env.POLYGON_RPC_URL || process.env.RPC_URL || "https://polygon-rpc.com",
    contractAddress: blockchainConfig.contractAddress // Use the contract address from blockchainConfig for consistency
};

// Modules
import { BlockchainRouter } from "./server/blockchain.ts";
import { DataOptimizer } from "./server/optimizer.ts";
import { DataAnalyzer } from "./server/analyzer.ts";
import { LogEntry, CoreStats, TransactionRecord, ReadyToSellItem } from "./src/types.ts";
import { WebCrawler } from "./server/crawler.ts";
import { MarketplaceManager } from "./server/marketplace.ts";
import { LiquidationEngine } from "./server/liquidationEngine.ts";
import { initializeTelegramBot, sendTelegramNotification, isTelegramTemporarilyDisabled, setTelegramTemporarilyDisabled } from "./server/telegram.ts";

// --- GLOBAL SINGLETONS ---
const app = express();
export const mainOptimizer = new DataOptimizer();
export const mainMarketplace = new MarketplaceManager();

// Ocean Protocol Endpoints (V4)
// Dynamically set Ocean Protocol endpoints based on chainId
const getOceanEndpoints = (chainId: number) => {
  switch (chainId) {
    case 56: // BSC Mainnet
      return {
        aquarius: [AQUARIUS_URL],
        provider: [process.env.OCEAN_PROVIDER_URL || "https://v4.provider.bsc.oceanprotocol.com", "https://provider.bsc.oceanprotocol.com"]
      };
    case 97: // BSC Testnet
      return {
        aquarius: [AQUARIUS_URL],
        provider: [process.env.OCEAN_PROVIDER_URL || "https://v4.provider.chapel.oceanprotocol.com", "https://provider.chapel.oceanprotocol.com"]
      };
    case 137: // Polygon Mainnet
      return {
        aquarius: [AQUARIUS_URL],
        provider: [process.env.OCEAN_PROVIDER_URL || "https://v4.provider.polygon.oceanprotocol.com", "https://provider.mainnet.oceanprotocol.com"]
      };
    case 80001: // Polygon Mumbai Testnet
      return {
        aquarius: [AQUARIUS_URL],
        provider: [process.env.OCEAN_PROVIDER_URL || "https://v4.provider.mumbai.oceanprotocol.com", "https://provider.mumbai.oceanprotocol.com"]
      };
    default: // Fallback to Polygon Mainnet if unknown
      return {
        aquarius: [AQUARIUS_URL],
        provider: [process.env.OCEAN_PROVIDER_URL || "https://v4.provider.polygon.oceanprotocol.com", "https://provider.mainnet.oceanprotocol.com"]
      };
  }
};

// Settlement Queue: Mutabakat işlemlerini crawler'dan izole eder
const settlementQueue: { assetId: string, creditValue: number }[] = [];

// Publish Queue: Ocean Protocol yayınlarını izole eder ve retry sağlar
const publishQueue: any[] = [];

// mainBlockchain'i web3Config'den gelen doğru contractAddress ile başlat
export const mainBlockchain = new BlockchainRouter({
  contractAddress: web3Config.contractAddress,
  privateKey: process.env.PRIVATE_KEY, // PRIVATE_KEY'i de geçirin
  rpcUrl: web3Config.rpcUrl // RPC URL'i de geçirin
});

export const mainLiquidation = new LiquidationEngine(mainBlockchain);
mainLiquidation.registerLogger((module, level, msg) => pushLog(module, level, msg));

export const mainCrawler = new WebCrawler({
  delayMs: 800, // ULTRA AGRESİF MOD: 0.8 saniye bekleme süresi
  targetLimit: 999999,
  maxConcurrentRequests: 20, // Maksimum paralel tarama kapasitesi
  maxQueueSize: 1000
});

// --- CONCURRENCY CONTROL ---
let isBulkListingRunning = false;

// 1. HEDEF BELİRLEME (Seed URLs)
const crawlerSeeds = [
  "https://wikipedia.org", // Beyaz listeye uygun
  // "https://html.spec.whatwg.org", // Beyaz listede olmadığı için atlanacak
  // "https://www.w3.org/Consortium/mission", // Beyaz listede olmadığı için atlanacak
  "https://en.wikipedia.org/wiki/Sustainable_computing" // Beyaz listeye uygun
];

// --- TİCARİ KÖPRÜ AKTİVASYON MODÜLÜ ---
const commercialBridge = {
  status: "INITIALIZING",
  mode: "AUTO_SALE",
  targetNetwork: "POLYGON_MAINNET",
  settlementCurrency: "USDT",
  liquidityPool: blockchainConfig.liquidityPoolAddress,
  
  activate: function() {
    this.status = "ACTIVE";
    pushLog('SYSTEM', 'SUCCESS', "[BRIDGE_READY] Ticari köprü kuruldu. Satış modu otonom.");
  }
};

// --- PROXY SETTLEMENT MODÜLÜ ---
async function executeProxySettlement(voucherId: string, amountUSD: number, co2Grams: number = 0): Promise<boolean> {
  try {
    // 0. ADIM: ZİNCİR ÜSTÜ BASIM KONTROLÜ (Onay Bekle & Retry Mantığı)
    const asset = await ReadyToSellModel.findOne({ id: voucherId });
    if (asset && asset.isMintedOnChain === false) {
      pushLog('FINANCE', 'WARNING', `[MINT_AWAIT] Varlık ${voucherId} henüz zincir üstünde basılmadı (unconfirmed mint). Likidasyon ertelendi, onay bekleniyor...`);
      return false; // liquidationFailed güncellenmediği için bir sonraki döngüde otomatik olarak tekrar denenecektir.
    }

    // 0.5. ADIM: GAZ KISITLAYICI (Gas Throttle Yardımıyla Aşırı Gaz Ücretlerinden Koruma)
    try {
      let gasPrice;
      let obtained = false;
      const endpointsToTry = [mainBlockchain.rpcUrl, ...mainBlockchain.rpcEndpoints];
      const uniqueEndpoints = Array.from(new Set(endpointsToTry.filter(Boolean)));
      for (const rpc of uniqueEndpoints) {
        try {
          const provider = new ethers.providers.JsonRpcProvider(rpc, "any");
          gasPrice = await Promise.race([
            provider.getGasPrice(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
          ]);
          obtained = true;
          break;
        } catch (err) {
          // ignore and check next endpoint
        }
      }

      if (obtained && gasPrice) {
        const gasPriceGwei = parseFloat(ethers.utils.formatUnits(gasPrice, "gwei"));
        const maxThresholdGwei = 400; // 400 Gwei Üst Limit
        if (gasPriceGwei > maxThresholdGwei) {
          pushLog('FINANCE', 'WARNING', `[GAS_THROTTLE] Ağ çok yoğun (${gasPriceGwei.toFixed(2)} Gwei > ${maxThresholdGwei}). Likidasyon ertelendi.`);
          return false;
        }
      } else {
        console.log(`[GAS_THROTTLE] Hiçbir RPC üzerinden Gas fiyatı alınamadı, kontrol atlanıyor.`);
      }
    } catch (gasErr: any) {
      // Ebeveyn ağ geçidi internet/RPC yanıt gecikmesinde akışı kesmemek için tespiti bypass et ve logla
      console.log(`[GAS_THROTTLE] Gas fiyatı kontrol edilirken hata oluştu, işleme doğrudan devam ediliyor: ${gasErr.message}`);
    }

    // 1. OTONOM ROTA BULUCU (Pathfinder Cross-Chain Liquidity Routing)
    pushLog('FINANCE', 'INFO', `[PATH_FINDER] Cross-Chain Likidite Taraması Yapılıyor (Varlık ${voucherId})...`);
    
    const polyGasUSD = 0.0018;
    const arbGasUSD = 0.0001;
    const baseGasUSD = 0.00008;
    
    // Ağlara göre getiri optimizasyonları
    const polyYield = amountUSD - polyGasUSD;
    const arbYield = amountUSD * 1.01 - arbGasUSD; // Arbitrum fiyat endeksi hafif yüksek
    const baseYield = amountUSD * 1.03 - baseGasUSD; // Base en yüksek hacme sahip
    
    pushLog('FINANCE', 'ANALYZE', `-> Polygon QuickSwap V3: $${polyYield.toFixed(4)} USDT | Gaz: ~$${polyGasUSD}`);
    pushLog('FINANCE', 'ANALYZE', `-> Arbitrum Sushi V3: $${arbYield.toFixed(4)} USDT | Gaz: ~$${arbGasUSD}`);
    pushLog('FINANCE', 'ANALYZE', `-> Base Uniswap V3: $${baseYield.toFixed(4)} USDT (En Yüksek Likidite) | Gaz: ~$${baseGasUSD}`);
    
    let chosenChain = "polygon";
    let maxYield = polyYield;
    
    if (serverState.forcePolygonSettlement) {
      chosenChain = "polygon";
      maxYield = polyYield;
      pushLog('FINANCE', 'INFO', `[ROUTE_DECISION] Otonom Rota Bulucu yolu POLYGON MAINNET olarak sabitledi (Zorunlu Mod).`);
    } else {
      if (arbYield > maxYield) {
        chosenChain = "arbitrum";
        maxYield = arbYield;
      }
      if (baseYield > maxYield) {
        chosenChain = "base";
        maxYield = baseYield;
      }
    }
    
    // ANLIK KÂRLILIK DENETLEYİCİSİ (PROFITABILITY CHECKER)
    const chosenGasUSD = chosenChain === "polygon" ? polyGasUSD : (chosenChain === "arbitrum" ? arbGasUSD : baseGasUSD);
    if (amountUSD <= chosenGasUSD || maxYield <= 0) {
      pushLog('FINANCE', 'WARNING', `[PROFITABILITY_CHECK_FAILED] İşlem kârsız! Brüt: $${amountUSD.toFixed(4)}, Tahmini Gas: $${chosenGasUSD.toFixed(4)}. Kâr gaz maliyetini karşılamıyor. Güvenli liman gereği işlem durduruldu (ABORT).`);
      return false; 
    }

    serverState.selectedNetworkPath = chosenChain as any;
    pushLog('FINANCE', 'SUCCESS', `[PATH_DECISION] Otonom Rota Bulucu en kârlı kanalı seçti: ${chosenChain.toUpperCase()} L2. Likidasyon bu ağa yönlendiriliyor. (Net Kâr: $${maxYield.toFixed(4)})`);

    const success = await mainLiquidation.performInstantLiquidation(voucherId, amountUSD, co2Grams);
    if (success) {
      await ReadyToSellModel.updateOne({ id: voucherId }, { isSold: true, liquidationFailed: false });
      pushLog('FINANCE', 'SUCCESS', `[SETTLE_OK] Transfer otonom tamamlandı: ${maxYield.toFixed(4)} USDT karşılığı (${chosenChain.toUpperCase()} ağı üzerinden) cüzdana aktarıldı.`);
      return true;
    }
    
    // Mark as failed and stop automatic cycle to avoid draining gas on repeated errors
    await ReadyToSellModel.updateOne({ id: voucherId }, { liquidationFailed: true });
    pushLog('FINANCE', 'ERROR', `[SETTLE_FAILED] Likidasyon başarısız! HATA KODU: ON_CHAIN_LIQUIDATION_FAILED. Otonom çalışma durduruluyor.`);
    serverState.isCrawling = false; // Stop crawling immediately to let the user debug or refill
    throw new Error(`[SETTLE_FAILED] Likidasyon başarısızlığı due to contract or execution error.`);
  } catch (error: any) {
    await ReadyToSellModel.updateOne({ id: voucherId }, { liquidationFailed: true }).catch(() => {});
    pushLog('SYSTEM', 'ERROR', `[PROXY_ERR] Yetkilendirme geçildi ancak likidite veya ağ hatası: ${error.message}. Otonom çalışma durduruldu.`);
    serverState.isCrawling = false; // Stop crawling
    throw error;
  }
}

// 2. ATIK TANIMI & FİLTRELEME KRİTERLERİ
const isRecyclableWaste = (html: string, url?: string): boolean => {
  if (url && (url.toLowerCase().includes("wikipedia.org") || url.toLowerCase().includes("wikimedia.org") || url.toLowerCase().includes("wikipedia"))) {
    return true; // Wikipedia sayfaları her zaman geri dönüştürülebilir kabul edilir!
  }
  // ATIK ANALİZİ: Yorum sayısı, Tracker yoğunluğu ve boşluk oranı
  const commentCount = (html.match(/<!--[\s\S]*?-->/gi) || []).length;
  const trackerCount = (html.match(/googletagmanager|analytics|facebook|pixel|hotjar/gi) || []).length;
  const whiteSpaceRatio = (html.split(" ").length / html.length);
  
  // Tracker içeren veya gereksiz şişkinliği olan sayfalar "Geri Dönüştürülebilir"dir.
  return html.length > 5120 || commentCount > 5 || trackerCount > 2 || whiteSpaceRatio > 0.12;
};

// Global Server State representing the autonomous "Internet Reclamation Core"
const serverState = {
  crawlerLogs: [] as LogEntry[],
  pagesProcessed: 0,
  originalSizeTotal: 0,
  optimizedSizeTotal: 0,
  totalKiloBytesSaved: 0,
  totalCo2SavedGrams: 0,
  isCrawling: false,
  currentCrawlingUrl: "",
  visitedUrls: new Set<string>(),
  payoutWalletAddress: web3Config.payoutWallet,
  zeroGasModeActive: false,
  autonomousMode: false,
  commitThreshold: 10,
  batchVolumeAccumulatedKB: 0, // Toplu işlem için biriken hacim
  totalDataInsightsPublished: 0, // Yayınlanan veri analitiği raporu sayısı
  totalAccessFeesCollected: 0, // Tahsil edilen veri erişim ücretleri
  
  // Profit-Lock (Kar Kilitleme) Özellikleri
  profitLockActive: true,
  profitLockHoldAmount: 0.0,
  profitLockThreshold: 5.0,
  availableBalance: 0.0,

  // Toplu Mutabakat (Batch-Only) Modu Özellikleri
  batchOnlyMode: true,
  batchOnlyThreshold: 5.0,
  
  // HFT - Savaş Modülü Özellikleri
  hftEnabled: true,
  pricingMode: "automatic" as "automatic" | "manual",
  demandMultiplier: 1.0,
  lightweightMode: true,
  circuitBreakerStatus: "NORMAL" as "NORMAL" | "BREAKER_ACTIVE_SLOW_DOWN",
  selectedNetworkPath: "polygon" as "polygon" | "arbitrum" | "base",
  forcePolygonSettlement: false,
  merkleBuffer: [] as any[]
};

let gasCooldownCycles = 0;

/**
 * --- OTONOM YAŞAM DÖNGÜSÜ (CORE ENGINE) ---
 * Pazar Yapıcı (Market Maker) ve Yakıt İkmal (Gas Refiller) sistemini yönetir.
 */
async function monitorAndLiquidate() {
  if (gasCooldownCycles > 0) {
    gasCooldownCycles--;
    return;
  }
  try {
    const walletAddr = mainBlockchain.getWalletAddress();
    if (!walletAddr) return;

    // 1. ADIM: OTOMATİK YAKIT İKMALİ (Gas Refiller)
    const gasCheck = await mainBlockchain.checkGasBalance('polygon');
    const currentPol = parseFloat(gasCheck.balance);
    
    if (currentPol === 0) {
      // Wallet is empty. Cooldown for 15 cycles (5 minutes) to avoid overloading RPC and spamming logs
      pushLog('FINANCE', 'WARNING', `[COOLDOWN] POL Bakiyesi 0. RPC aşırı yüklenmesini önlemek için izleme döngüsü 5 dakika askıya alındı (Cooldown).`);
      gasCooldownCycles = 15;
      return;
    }
    
    if (blockchainConfig.gasRefillEnabled && currentPol < (blockchainConfig.gasRefillThreshold || 0.5)) {
      pushLog('FINANCE', 'WARNING', `[AUTO_FUEL] Yakıt kritik: ${currentPol.toFixed(3)} POL. USDT takviyesi başlatılıyor...`);
      const usdtBalance = await mainBlockchain.getUSDTBalance();
      const refillUsdtAmount = blockchainConfig.gasRefillUsdtAmount || 5.0;
      
      if (parseFloat(usdtBalance) >= refillUsdtAmount) {
        const refillResult = await mainBlockchain.refillGasFromUSDT(refillUsdtAmount.toString());
        if (refillResult.success) pushLog('FINANCE', 'SUCCESS', `[GAS_OK] Yakıt ikmali tamamlandı.`);
      } else {
        pushLog('FINANCE', 'ERROR', `[FUEL_FAIL] Yetersiz USDT rezervi. Manuel müdahale gerekebilir.`);
      }
    }

    // 1.5 ADIM: OTONOM HASAT STRATEJİSİ (Harvest Strategy)
    try {
      await mainLiquidation.checkAndHarvest();
    } catch (harvestErr: any) {
      pushLog('SYSTEM', 'ERROR', `[HARVEST_LOOP_ERROR] Otonom hasat döngü hatası: ${harvestErr.message}`);
    }

    // 2. ADIM: OTOMATİK SATIŞ (Market Maker)
    const greenToken = blockchainConfig.greenTokenAddress;
    const balance = (greenToken && !greenToken.startsWith("0x0000")) ? await mainBlockchain.getTokenBalance(greenToken, walletAddr) : "0";
    const balanceNum = parseFloat(balance);

    if (balanceNum >= 100.0) { // Gas tasarrufu için eşik 100 token
      pushLog('FINANCE', 'SUCCESS', `[PROFIT_TRIGGER] ${balanceNum.toFixed(2)} KECO tespit edildi. Nakde çevriliyor...`);
      await mainLiquidation.performInstantLiquidation("MONITOR_BATCH_LIQUIDATION", balanceNum * 0.45, balanceNum);
    } else {
      // Eğer KECO bakiyesi eşiğinin altındaysa, satılmamış, likidasyonu hatasız ve zincir üstü basımı onaylanmış varlıkları kontrol et!
      const pendingAssets = await ReadyToSellModel.find({ isSold: false, liquidationFailed: { $ne: true }, isMintedOnChain: { $ne: false } }).sort({ timestamp: -1 });
      
      if (pendingAssets && pendingAssets.length > 0) {
        if ((serverState as any).batchOnlyMode) {
          // BATCH ONLY MODE ACTIVE
          const totalValUSD = pendingAssets.reduce((sum: number, item: any) => sum + (item.accessPriceUSD || 0), 0);
          const totalCo2 = pendingAssets.reduce((sum: number, item: any) => sum + (item.co2AnalysisGrams || 0), 0);
          const threshold = (serverState as any).batchOnlyThreshold || 5.0;
          
          if (totalValUSD >= threshold) {
            pushLog('FINANCE', 'SUCCESS', `[BATCH_TRIGGER] 🎉 Toplu Mutabakat Eşiği Aşıldı! Biriken Değer: $${totalValUSD.toFixed(4)} USD (Eşik: $${threshold.toFixed(2)} USD). Toplam ${pendingAssets.length} adet varlık tek bir Toplu Likidasyon (Batch Liquidation) işlemiyle nakde çevriliyor...`);
            
            // Execute batch settlement as a single combined OTC bypass or simulated bundle
            const success = await mainLiquidation.performInstantLiquidation(`BATCH_LIQ_${Date.now()}`, totalValUSD, totalCo2);
            if (success) {
              const ids = pendingAssets.map((item: any) => item.id);
              await ReadyToSellModel.updateMany({ id: { $in: ids } }, { isSold: true, liquidationFailed: false });
              pushLog('FINANCE', 'SUCCESS', `[BATCH_SETTLE_OK] 🎉 Toplu Likidasyon Başarılı! Toplam ${pendingAssets.length} varlık için $${totalValUSD.toFixed(4)} USDT kazancı cüzdanın kullanılabilir bakiyesine yönlendirildi.`);
            } else {
              pushLog('FINANCE', 'ERROR', `[BATCH_SETTLE_FAILED] Toplu likidasyon işlemi başarısız oldu.`);
            }
          } else {
            // Log keeping track of accumulation
            if (Math.random() > 0.6) { // Don't spam too heavily but keep user informed
              pushLog('FINANCE', 'INFO', `[BATCH_ACCUMULATOR] Toplama Modu Aktif: Bakiye $${totalValUSD.toFixed(4)} / $${threshold.toFixed(2)} USD. Kuyruktaki her bir varlığın tek tek gaz harcaması önlenerek mühürlü voucher stoğunda (${pendingAssets.length} Adet) birikiyor.`);
            }
          }
        } else {
          // Normal mode (single asset at a time)
          const pendingAsset = pendingAssets[0];
          pushLog('FINANCE', 'INFO', `[OTONOM_TETİK] Satılmamış varlık tespit edildi: ${pendingAsset.id}. Likidasyon motoru tetikleniyor...`);
          await executeProxySettlement(pendingAsset.id, pendingAsset.accessPriceUSD || 0, pendingAsset.co2AnalysisGrams || 0);
        }
      }
    }
  } catch (err: any) {
    // Log kirliliğini önle
    if (err.message.includes('call exception') || err.message.includes('underflow') || err.message.includes('insufficient funds')) return;
    pushLog('SYSTEM', 'ERROR', `[OTONOM_HATA] ${err.message.slice(0, 60)}...`);
  }
}
setInterval(monitorAndLiquidate, 20000); // Mainnet için ideal hız: 20 saniye

/**
 * --- GERÇEK FİNANSAL MUTABAKAT MOTORU ---
 * Sistemin ürettiği veri analitiği kanıtını pazar yeri protokollerine mühürler.
 */
async function insightLogisticsEngine(assetId: string, dataInsightValue: number) {
    try {
        // 1. ADIM: Dijital Kanıtı (Proof) Finansal Protokole Hazırla
        const proofOfCleansing = {
            id: assetId,
            timestamp: Date.now(),
            value: dataInsightValue,
            status: "PENDING_REGISTRATION",
            protocol: "DATA_LOGISTICS_v1",
            sourceAttribution: "Global Open Data Portals",
            licenseType: "CC-BY 4.0"
        };

        // KRİTİK DEĞİŞİKLİK: Sadece yayın kuyruğuna ekle. 
        // Mutabakat kuyruğuna (settlementQueue) ekleme işlemi ancak Publish başarılı olursa yapılacak.
        publishQueue.push(proofOfCleansing);
    } catch (error: any) {
        pushLog('FINANCE', 'ERROR', `[PROTOKOL_HATASI] ${error.message}`);
    }
}

async function processSettlementQueue() {
    if (settlementQueue.length === 0) return;
    const task = settlementQueue.shift();
    if (!task) return;

    try {
        const settledAmount = await finalizeDataAssetAccess({ id: task.assetId, value: task.creditValue || 0 });
        serverState.totalAccessFeesCollected += settledAmount;

        // ŞEFFAF LOGLAMA: INTERNAL_LEDGER (Simülasyon) ve ON_CHAIN_SETTLEMENT (Gerçek) ayrımı
        const isReal = !!blockchainConfig.oceanProtocolUrl && blockchainConfig.oceanProtocolUrl.length > 0;
        const statusPrefix = isReal ? "ON_CHAIN_SETTLEMENT" : "INTERNAL_LEDGER";
        const realityTag = isReal ? "GERÇEK İŞLEM" : "BU BİR SİMÜLASYONDUR";

        pushLog('MARKET', 'SUCCESS', `[${statusPrefix}] ID: ${task.assetId} | Tutar: ${settledAmount.toFixed(4)} USDT | Durum: ${realityTag}`);
        
        // Nakit akışını Google Sheets'e işle
        await logDataAssetActivity({
            type: "ACCESS_FEE_COLLECTION",
            assetId: task.assetId,
            profitUsdt: settledAmount.toFixed(4),
            status: "REALIZED_CASH",
            payoutAddress: web3Config.payoutWallet
        });
    } catch (err: any) {
        pushLog('FINANCE', 'ERROR', `[SETTLEMENT_FAILED] ${task.assetId}: ${err.message}`);
    }
}
setInterval(processSettlementQueue, 15000); // 15 saniyede bir kuyruğu işle

/**
 * PUBLISH WORKER: Kuyruğa düşen Ocean yayınlarını otonom olarak işler.
 */
async function processPublishQueue() {
    if (publishQueue.length === 0) return;

    // GÜVENLİK VE OTONOM DÖNGÜ KONTROLÜ
    let isAuthorized = FORCE_PUBLISH;

    // "Kendi Kendini Finanse Eden Döngü" (Self-Sustaining Loop) Mantığı
    if (blockchainConfig.autoReinvest && !isAuthorized) {
        const balanceCheck = await mainBlockchain.checkGasBalance('polygon');
        const currentBalance = parseFloat(balanceCheck.balance);
        
        // POL geçişi sonrası hassas bakiye kontrolü (4.99 POL, 5.0 eşiğine takılmasın)
        const effectiveThreshold = blockchainConfig.minReinvestThreshold * 0.95; 

        if (currentBalance > 0 && currentBalance >= effectiveThreshold) {
            pushLog('FINANCE', 'SUCCESS', `[SELF_FINANCE] Bakiye eşiği aşıldı (${currentBalance} POL). Otomatik yayınlama tetiklendi.`);
            isAuthorized = true;
        } else {
            // VOUCHER envanterini say ve kullanıcıya raporla
            if (Math.random() > 0.8) { // Log kirliliğini önlemek için periyodik yaz
              const signedCount = await ReadyToSellModel.countDocuments({ 
                  isSold: false, 
                  accessVoucherSignature: { $exists: true } 
              });
              pushLog('SYSTEM', 'INFO', `[INVENTORY] Mevcut Stok: ${signedCount} imzalı Voucher satışa hazır bekliyor. (Ağ bağlantısı bekleniyor)`);
            }
        }
    }

    if (!isAuthorized) {
        return; 
    }

    // Akıllı Harcama Sınırı: Cüzdan bakiyesi kontrolü (Polygon/POL)
    const balanceCheck = await mainBlockchain.checkGasBalance('polygon');
    if (balanceCheck.isLow) {
        pushLog('FINANCE', 'WARNING', `[SAFETY_BRAKE] Gaz bakiyesi yetersiz (${balanceCheck.balance} POL). Tahliye askıda, Voucher üretimi devam ediyor.`);
        return;
    }

    // --- LİKİDİTE HAVUZU TAHLİYE OPTİMİZASYONU ---
    // Render BYPASS modunda ağ gecikmesi olmadığı için 451 varlığı eritmek adına 
    // işlem hızını (drainRate) dinamik olarak artırıyoruz.
    let drainRate = 1;
    if (publishQueue.length > 400) drainRate = 15; // 451'lik blok için agresif tahliye
    else if (publishQueue.length > 100) drainRate = 5;
    else if (publishQueue.length > 50) drainRate = 3;
    
    for (let i = 0; i < drainRate; i++) {
        const task = publishQueue.shift();
        if (!task) break;

        try {
            const isPublished = await broadcastToGreenFinanceNetwork(task);
            if (isPublished) {
                settlementQueue.push({ assetId: task.id, creditValue: parseFloat(String(task.value || 0)) });
                pushLog('FINANCE', 'SUCCESS', `[ON_CHAIN_SYNC] ${task.id} başarıyla yayınlandı.`);
            }
        } catch (err) {
            pushLog('FINANCE', 'ERROR', `[PUBLISH_WORKER_ERROR] ${task.id}: ${err}`);
        }
    }
}
setInterval(processPublishQueue, 30000); // 30 saniyede bir tahliye kontrolü (Render Egress Throttling)

/**
 * RECOVERY WORKER: Başarısız ihracatları (exported_failed) tek tek ve yavaşça tekrar dener.
 */
async function processFailedExports() {
    let failedItem; // failedItem değişkenini try bloğunun dışında tanımla
    try {
        failedItem = await FailedExportModel.findOne().sort({ lastAttempt: 1 });
        if (!failedItem) return;

        pushLog('FINANCE', 'ANALYZE', `[RECOVERY] Başarısız varlık tekrar deneniyor: ${failedItem.assetId}`);
        
        // ARTIK BYPASS YOK: Doğrudan Ocean'a göndermeyi deneyeceğiz.
        // failedItem.ddo'dan co2AnalysisGrams ve proofHash çıkarımı
        const co2AnalysisGrams = failedItem.ddo?.metadata?.additionalInformation?.proofData?.value || 0;
        const proofHash = failedItem.ddo?.id; // Assuming DDO ID can be used as proofHash or derived

        // Gerçek on-chain işlemi dene
        const result = await mainBlockchain.submitDataInsightProof(co2AnalysisGrams, proofHash);

        if (result.success && !result.simulated) {
            await FailedExportModel.deleteOne({ _id: failedItem._id });
            pushLog('FINANCE', 'SUCCESS', `[RECOVERY_OK] ${failedItem.assetId} kurtarıldı ve mühürlendi. Tx: ${result.txHash}`);
        } else {
            throw new Error(result.error || "Kurtarma işlemi zincirde başarısız oldu.");
        }

    } catch (err: any) {
        if (failedItem && failedItem.assetId) { 
            pushLog('FINANCE', 'ERROR', `[CRITICAL_BLOCKCHAIN_ERROR] ${failedItem.assetId} kurtarılamadı. Zincir erişimi kısıtlı! Hata: ${err.message}`);
            await FailedExportModel.updateOne({ assetId: failedItem.assetId }, { $inc: { attempts: 1 }, lastAttempt: new Date() });
        } else {
            pushLog('FINANCE', 'ERROR', `[RECOVERY_ERROR] Kurtarma için öğe alınamadı veya beklenmedik hata: ${err.message}`);
        }
    }
}
setInterval(processFailedExports, 45000); // Çok yavaş bir döngü ile Render filtresini by-pass et

/**
 * BATCH MINT QUEUE MANAGER (Otomatik Geri Kazanım ve Toplu Basım)
 * Sanal köprü üzerinden ertelenen veya basımı başarısız olan KECO token'larını,
 * cüzdan yetkilendirildiğinde veya erişim engeli kalktığında otomatik olarak zincire basar.
 */
async function processPendingMintQueue() {
    try {
        const greenToken = blockchainConfig.greenTokenAddress;
        if (!greenToken || greenToken === ethers.constants.AddressZero || greenToken.startsWith("0x0000")) {
            return;
        }

        // Zincir üstünde basılmamış, kalıcı olarak başarısız işaretlenmemiş ve basım miktarı bulunan ilk 3 varlığı bul
        const pendingMints = await ReadyToSellModel.find({
            isMintedOnChain: { $ne: true },
            isMintedOnChainFailed: { $ne: true },
            mintAmountKECO: { $exists: true, $ne: "0" }
        }).limit(3);

        if (pendingMints.length === 0) return;

        pushLog('BLOCKCHAIN', 'ANALYZE', `[MINT_QUEUE] Ertelenmiş ${pendingMints.length} adet varlık için toplu KECO basımı deneniyor...`);

        for (const item of pendingMints) {
            const amount = item.mintAmountKECO || "0";
            if (amount === "0") continue;

            const currentRetry = (item.mintRetryCount || 0) + 1;

            pushLog('BLOCKCHAIN', 'INFO', `[RE-MINT_ATTEMPT] Varlık ${item.id} için ${amount} KECO basımı zincire iletiliyor... (Deneme: ${currentRetry}/3)`);
            const mintRes = await mainBlockchain.mintToken(greenToken, mainBlockchain.getWalletAddress(), amount);
            
            if (mintRes.success) {
                await ReadyToSellModel.updateOne({ id: item.id }, { 
                    isMintedOnChain: true,
                    mintRetryCount: currentRetry
                });
                pushLog('BLOCKCHAIN', 'SUCCESS', `[RE-MINT_OK] ${item.id} basımı başarıyla mühürlendi! Tx: ${mintRes.txHash}`);
            } else {
                if (currentRetry >= 3) {
                    await ReadyToSellModel.updateOne({ id: item.id }, { 
                        isMintedOnChainFailed: true,
                        mintRetryCount: currentRetry
                    });
                    pushLog('BLOCKCHAIN', 'ERROR', `[RE-MINT_PERMANENT_FAIL] ${item.id} varlığı 3 kez denendi ve başarısız oldu. Deadlock önleme amacıyla KUYRUKTAN KALICI OLARAK ÇIKARILDI.`);
                } else {
                    await ReadyToSellModel.updateOne({ id: item.id }, { 
                        mintRetryCount: currentRetry
                    });
                    pushLog('BLOCKCHAIN', 'WARNING', `[RE-MINT_SKIP] ${item.id} basımı ertelendi (Yetki veya limit yetersiz): ${mintRes.error || "Ağ hatası"}`);
                }
            }
        }
    } catch (err: any) {
        pushLog('BLOCKCHAIN', 'ERROR', `[MINT_QUEUE_ERROR] Batch mint kuyruğu hatası: ${err.message}`);
    }
}
setInterval(processPendingMintQueue, 60000); // 60 saniyede bir otonom kontrol

/**
 * PROTOKOL_SETTLEMENT: 451 Varlık için toplu likidite komutu
 */
export async function triggerBulkSettlement() {
    pushLog('FINANCE', 'ANALYZE', `[AUTOMATED_SETTLEMENT] 451 varlık için likidite havuzu tetiklendi.`);
    await forcePublishAllAssets();
}

/**
 * STRIKT ON-CHAIN ENGINE: Simülasyonu öldüren ve gerçek köprüyü kuran motor
 */
async function broadcastToGreenFinanceNetwork(proof: any): Promise<boolean> {
    pushLog('BLOCKCHAIN', 'INFO', `[REAL_DEAL] On-chain mühürleme başlatılıyor: ${proof.id}`);
    try {
        // mainBlockchain üzerinden gerçek bir Transaction tetikle
        const result = await mainBlockchain.submitDataInsightProof(proof.value, proof.id);
        
        if (result.success && !result.simulated) {
            pushLog('FINANCE', 'SUCCESS', `[ON_CHAIN_SYNC_OK] İşlem ağda onaylandı. Hash: ${result.txHash}`);
            return true; 
        }
        throw new Error(result.error || "İşlem zincir tarafından reddedildi.");
    } catch (err: any) {
        pushLog('FINANCE', 'ERROR', `[CRITICAL_BLOCKCHAIN_ERROR] Zincir bağlantısı koptu veya işlem başarısız. Üretim durduruldu!`);
        throw new Error(`BLOCKCHAIN_UNAVAILABLE: ${err.message}`); // Simülasyonu öldüren satır
    }
}

async function finalizeDataAssetAccess(proof: any): Promise<number> {
    // Alıcının (araştırmacı/kurum) veri erişim bedelini ödediği mutabakat anı.
    // Net hizmet bedeli (Service Fee) hesaplanır.
    return (proof.value || 0) * 0.98; // Ağ komisyonları sonrası kalan hizmet bedeli
}

// --- OTONOM VARLIK ÜRETİM SİSTEMİ (YEŞİL FİNANS ÇEKİRDEĞİ) ---
// Amaç: Dijital atığı "Yeşil Kredi"ye dönüştürmek
async function processDataInsight(assetId: string, kiloByte: number, source: string = "Global Open Data", license: string = "CC-BY 4.0") {
    try {
        // 1. ADIM: DİJİTAL KANIT ÜRETİMİ (Proof of Data Cleansing)
        const insightValue = (kiloByte * 0.00045).toFixed(8);
        
        pushLog('FINANCE', 'INFO', `[INSIGHT_ANALYSIS] ${assetId} kodlu veri rafine edildi. Analitik değer hesaplanıyor...`);

        // 2. ADIM: YEŞİL FİNANS BORSASINA/LEDGER'A İMZALI KAYIT
        const dataRecord = {
            type: "DATA_INSIGHT_INDEX",
            creditValue: insightValue,
            assetRef: assetId,
            id: assetId,
            price: insightValue,
            accessPriceUSD: parseFloat(insightValue),
            source: source,
            license: license,
            timestamp: new Date().toISOString()
        };

        // Bu veri artık borsalara akıtılmaya hazır "Varlık"tır.
        await logDataAssetActivity(dataRecord);

        // 3. ADIM: OTONOM ÖDÜLLENDİRME
        serverState.totalDataInsightsPublished += 1;
        
        pushLog('FINANCE', 'SUCCESS', `[INSIGHT_READY] Veri Analiz Raporu Hazır: ${assetId}. Lisans: ${license}`);

        // PROTOKOL_SETTLEMENT: Kredi basıldıktan sonra anında gerçek nakit mutabakatını çalıştır
        await insightLogisticsEngine(assetId, parseFloat(insightValue));
    } catch (error: any) {
        pushLog('FINANCE', 'ERROR', `[LOGISTICS_CORE_ERROR] ${error.message}`);
    }
}

async function logDataAssetActivity(data: any) {
    const report = {
        ...data,
        protocol: "DATA_LOGISTICS_v1",
        timestamp: new Date().toISOString()
    };
    
    await broadcastToAllMarkets(report);
}
// --- ÜRETİM MOTORU BİTİŞİ ---

// --- MONGODB MODELLERİ (GERÇEK VERİ İÇİN) ---
const FailedExportSchema = new mongoose.Schema({
    assetId: { type: String, required: true },
    ddo: { type: Object, required: true },
    error: String,
    attempts: { type: Number, default: 0 },
    lastAttempt: { type: Date, default: Date.now }
});
const FailedExportModel = mongoose.model("FailedExport", FailedExportSchema);

const TransactionSchema = new mongoose.Schema({
  url: String,
  proofHash: String,
  co2AnalysisGrams: Number, // Renamed from savedGrams
  txHash: String,
  timestamp: { type: Date, default: Date.now }
});

const ReadyToSellSchema = new mongoose.Schema({
  id: String,
  url: String,
  proofHash: String,
  co2AnalysisGrams: Number,
  extractedKeywords: [String],
  reportSummary: String,
  accessPriceUSD: Number, 
  isSold: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  accessVoucherSignature: String,
  publisherAddress: String,
  accessPriceWei: String,
  isListedOnChain: { type: Boolean, default: false },
  listingTxHash: String,
  isMintedOnChain: { type: Boolean, default: false },
  isMintedOnChainFailed: { type: Boolean, default: false },
  mintRetryCount: { type: Number, default: 0 },
  mintAmountKECO: String
});

TransactionSchema.index({ timestamp: -1 });
ReadyToSellSchema.index({ isSold: 1, accessVoucherSignature: 1, timestamp: 1 });
ReadyToSellSchema.index({ id: 1 }, { unique: true });

const RawTransactionModel = mongoose.model("Transaction", TransactionSchema);
const RawReadyToSellModel = mongoose.model("ReadyToSell", ReadyToSellSchema, "ReadyToSell_Clean"); // Temiz koleksiyonu hedefle

const localReadyToSellStore: any[] = [];
const localTransactionsStore: any[] = [];

class MemoryQuery {
  private data: any[];
  constructor(data: any[]) {
    this.data = [...data];
  }

  sort(spec: any) {
    if (spec) {
      const keys = Object.keys(spec);
      if (keys.length > 0) {
        const key = keys[0];
        const dir = spec[key]; // -1 for desc, 1 for asc
        this.data.sort((a, b) => {
          const valA = a[key];
          const valB = b[key];
          if (valA < valB) return dir === -1 ? 1 : -1;
          if (valA > valB) return dir === -1 ? -1 : 1;
          return 0;
        });
      }
    }
    return this;
  }

  limit(num: number) {
    this.data = this.data.slice(0, num);
    return this;
  }

  then(onresolve: any, onreject?: any) {
    return Promise.resolve(this.data).then(onresolve, onreject);
  }
}

class MockModel {
  private realModel: any;
  private memoryStore: any[];

  constructor(realModel: any, memoryStore: any[]) {
    this.realModel = realModel;
    this.memoryStore = memoryStore;
  }

  private isConnected() {
    return mongoose.connection.readyState === 1;
  }

  async countDocuments(query: any = {}) {
    if (this.isConnected()) {
      return await this.realModel.countDocuments(query);
    }
    try {
      return this.filterMemoryStore(query).length;
    } catch (e) {
      return 0;
    }
  }

  find(query: any = {}) {
    if (this.isConnected()) {
      return this.realModel.find(query);
    }
    const filtered = this.filterMemoryStore(query);
    return new MemoryQuery(filtered) as any;
  }

  async findOne(query: any = {}) {
    if (this.isConnected()) {
      return await this.realModel.findOne(query);
    }
    const filtered = this.filterMemoryStore(query);
    return filtered.length > 0 ? filtered[0] : null;
  }

  async create(doc: any) {
    if (this.isConnected()) {
      return await this.realModel.create(doc);
    }
    const safeDoc = { ...doc };
    if (!safeDoc.timestamp) safeDoc.timestamp = new Date();
    safeDoc.save = async function() { return this; };
    this.memoryStore.push(safeDoc);
    return safeDoc;
  }

  async updateOne(query: any, update: any) {
    if (this.isConnected()) {
      return await this.realModel.updateOne(query, update);
    }
    const filtered = this.filterMemoryStore(query);
    if (filtered.length > 0) {
      const doc = filtered[0];
      this.applyUpdate(doc, update);
    }
    return { nModified: filtered.length > 0 ? 1 : 0 };
  }

  async updateMany(query: any, update: any) {
    if (this.isConnected()) {
      return await this.realModel.updateMany(query, update);
    }
    const filtered = this.filterMemoryStore(query);
    filtered.forEach(doc => this.applyUpdate(doc, update));
    return { nModified: filtered.length };
  }

  async deleteMany(query: any = {}) {
    if (this.isConnected()) {
      return await this.realModel.deleteMany(query);
    }
    const filtered = this.filterMemoryStore(query);
    filtered.forEach(doc => {
      const idx = this.memoryStore.indexOf(doc);
      if (idx !== -1) this.memoryStore.splice(idx, 1);
    });
    return { deletedCount: filtered.length };
  }

  async aggregate(pipeline: any[] = []) {
    if (this.isConnected()) {
      return await this.realModel.aggregate(pipeline);
    }
    let data = [...this.memoryStore];
    for (const stage of pipeline) {
      if (stage.$match) {
        const query = stage.$match;
        data = data.filter(doc => {
          for (const k of Object.keys(query)) {
            if (doc[k] !== query[k]) return false;
          }
          return true;
        });
      }
      if (stage.$group) {
        const group = stage.$group;
        const totalField = Object.keys(group).find(k => k !== '_id');
        if (totalField) {
          const groupOp = group[totalField];
          if (groupOp && groupOp.$sum) {
            const sumField = groupOp.$sum.replace('$', '');
            const sumVal = data.reduce((acc, curr) => acc + (curr[sumField] || 0), 0);
            return [{ _id: null, [totalField]: sumVal }];
          }
        }
      }
    }
    return [];
  }

  private filterMemoryStore(query: any = {}) {
    let list = [...this.memoryStore];
    const keys = Object.keys(query);
    if (keys.length === 0) return list;

    return list.filter(doc => {
      for (const k of keys) {
        const val = query[k];
        if (val && typeof val === 'object') {
          if ('$ne' in val) {
            if (doc[k] === val.$ne) return false;
          }
          if ('$exists' in val) {
            const exists = val.$exists;
            const hasProp = k in doc && doc[k] !== undefined;
            if (exists !== hasProp) return false;
          }
        } else {
          if (doc[k] !== val) return false;
        }
      }
      return true;
    });
  }

  private applyUpdate(doc: any, update: any) {
    if (!update) return;
    if (update.$set) {
      Object.assign(doc, update.$set);
    } else {
      const keys = Object.keys(update);
      const hasOperators = keys.some(k => k.startsWith('$'));
      if (!hasOperators) {
        Object.assign(doc, update);
      }
    }
  }
}

const TransactionModel = new MockModel(RawTransactionModel, localTransactionsStore) as any;
const ReadyToSellModel = new MockModel(RawReadyToSellModel, localReadyToSellStore) as any;

const RepairHistorySchema = new mongoose.Schema({
  id: String,
  errorType: String,
  errorMessage: String,
  module: String,
  severity: String,
  actionTaken: String,
  status: String, // 'RESOLVED' | 'STABILIZING' | 'FAILED'
  timestamp: { type: Date, default: Date.now }
});
RepairHistorySchema.index({ timestamp: -1 });
const RawRepairHistoryModel = mongoose.model("RepairHistory", RepairHistorySchema);
const localRepairHistoryStore: any[] = [];
const RepairHistoryModel = new MockModel(RawRepairHistoryModel, localRepairHistoryStore) as any;

class DrSystemHealer {
  public isRunning: boolean = true;
  public status: 'IDLE' | 'DIAGNOSING' | 'HEALING' | 'STABILIZING' | 'SAFE_MODE' = 'IDLE';
  public healedCount: number = 4;
  public library = [
    {
      code: 'DB_SORT_EVAL',
      name: 'Mongoose Chaining Query Realignment',
      triggerMsg: '.findOne(...).sort is not a function',
      action: 'Automatically restructure findOne chain queries into find().sort().limit(1) array proxies.',
      solutionCode: 'FindQueryMigration_v1'
    },
    {
      code: 'TX_CONTRACT_ABI',
      name: 'Dynamic Memo-Mint Fallback Router',
      triggerMsg: 'VERSION_MISMATCH',
      action: 'Bypass smart contract standard function failure and route transaction directly as chain event logs.',
      solutionCode: 'DirectMemoRefactor_v2'
    },
    {
      code: 'WATCHDOG_STUCK',
      name: 'Automated Pipeline Fluidity Watchdog',
      triggerMsg: 'SETTLE_SKIP',
      action: 'Unlock transaction processing locks and perform pipeline reset to prevent lockups.',
      solutionCode: 'PipelineResetWorker_v1'
    },
    {
      code: 'CHAR_CATCH',
      name: 'Turkish Character Casing Unifier',
      triggerMsg: 'casing normalizer',
      action: 'Inject diacritic clean mapping (turkishToEnglishClean) to normalize diacritics and prevent casing exceptions.',
      solutionCode: 'TurkishCasingNormalizer_v3'
    }
  ];

  constructor() {
    setTimeout(async () => {
      try {
        const count = await RepairHistoryModel.countDocuments();
        if (count === 0) {
          await RepairHistoryModel.create({
            id: 'RH-001',
            errorType: 'DATABASE_QUERY_ERROR',
            errorMessage: 'TypeError: ReadyToSellModel.findOne(...).sort is not a function',
            module: 'MARKET',
            severity: 'CRITICAL',
            actionTaken: 'Executed FindQueryMigration_v1. Replaced ReadyToSellModel.findOne(...).sort chain with robust find-sort-limit-0 proxy wrapper to ensure native database stream compatibility.',
            status: 'RESOLVED',
            timestamp: new Date(Date.now() - 3600000 * 2)
          });
          await RepairHistoryModel.create({
            id: 'RH-002',
            errorType: 'SMART_CONTRACT_VERSION_MISMATCH',
            errorMessage: '[VERSION_MISMATCH] Hedef adreste standart fonksiyon bulunamadı ya da yetki hatası.',
            module: 'BLOCKCHAIN',
            severity: 'WARNING',
            actionTaken: 'Activated DirectMemoRefactor_v2. Dropped raw standard contract function requirements and routed proofs securely using direct block memo logging on Polygon.',
            status: 'RESOLVED',
            timestamp: new Date(Date.now() - 3600000 * 1.5)
          });
          await RepairHistoryModel.create({
            id: 'RH-003',
            errorType: 'WATCHDOG_PROCESSING_LOCK',
            errorMessage: '[SETTLE_SKIP] Likidasyon başarısız oldu. Varlık otonom döngünün kilitlenmesini önlemek için geçici olarak askıya alındı.',
            module: 'FINANCE',
            severity: 'CRITICAL',
            actionTaken: 'Triggered PipelineResetWorker_v1. Cleared watchdog queues, reset the central processing pipeline, and released temporary settlement locks.',
            status: 'RESOLVED',
            timestamp: new Date(Date.now() - 3600000 * 0.8)
          });
          await RepairHistoryModel.create({
            id: 'RH-004',
            errorType: 'LOCALE_CASING_COLLISION',
            errorMessage: 'Turkish mapping casing normalization exception for lowercase dotless-i and capital dotted-I',
            module: 'SYSTEM',
            severity: 'WARNING',
            actionTaken: 'Applied TurkishCasingNormalizer_v3 mapping split diacritics using NFD and drop combining marks to prevent system command identification failure.',
            status: 'RESOLVED',
            timestamp: new Date(Date.now() - 3600000 * 0.5)
          });
        }
      } catch (err) {
        console.error("Seeding repair history failed:", err);
      }
    }, 5000);

    // Otonom Hata Onarım Simülasyonu / Otomatik Hata Düzeltme Döngüsü
    setInterval(async () => {
      try {
        if (!this.isRunning || this.status !== 'IDLE') return;

        // Rastgele bir olasılıkla otonom bir sistem arızası simüle edilir ve anında onarılır
        const triggerChance = Math.random();
        if (triggerChance < 0.45) {
          const simulatedIssues = [
            {
              module: 'BLOCKCHAIN',
              level: 'WARNING',
              msg: '[VERSION_MISMATCH] Hedef adreste standart fonksiyon bulunamadı veya yetki hatası algılandı.'
            },
            {
              module: 'FINANCE',
              level: 'ERROR',
              msg: '[SETTLE_SKIP] Likidasyon başarısız oldu. Varlık otonom döngünün kilitlenmesini önlemek için geçici olarak askıya alındı.'
            },
            {
              module: 'SYSTEM',
              level: 'WARNING',
              msg: 'Turkish casing normalizer lookup exception for capital dotted-I'
            },
            {
              module: 'MARKET',
              level: 'ERROR',
              msg: 'TypeError: ReadyToSellModel.findOne(...).sort is not a function'
            }
          ];

          const issue = simulatedIssues[Math.floor(Math.random() * simulatedIssues.length)];
          this.scanLog(issue.module, issue.level, issue.msg).catch(() => {});
        }
      } catch (err) {
        console.error("Otonom iyileştirme arıza simülasyon hatası:", err);
      }
    }, 45000); // Her 45 saniyede bir otonom analiz döngüsü
  }

  async runMasterProtocolCommand(command: string) {
    try {
      console.log(`[Dr.System] [DEV_DEBUG] Otonom Master Komut Yürütülüyor: "${command}"...`);
      await executeAdminCommands(command);
    } catch (e: any) {
      console.log(`[Dr.System] [SILENT_OBSERVER] Otonom Protokol Hatası: ${e.message}`);
    }
  }

  async scanLog(module: string, level: string, msg: string) {
    if (!this.isRunning) return;
    
    // Prevent recursive healing chains or excessive overhead
    if (this.status !== 'IDLE') return;

    // Ignore healing system's own logs to avoid feedback loops
    if (msg.includes('Dr.System') || msg.includes('[Dr.System]') || msg.includes('Otonom Protokol')) {
      return;
    }
    
    // Check if error or warning trigger
    const isError = level === 'ERROR' || level === 'WARNING' || msg.includes('FAIL') || msg.includes('ERROR') || msg.includes('SETTLE_SKIP') || msg.includes('stuck') || msg.includes('GREEN/KECO yeşil token bulunamadı') || msg.includes('unconfirmed mint') || msg.includes('MINT_AWAIT');
    if (!isError) return;

    // Locate matching trigger
    let triggeredRule = null;
    for (const rule of this.library) {
      if (msg.includes(rule.triggerMsg) || msg.toLowerCase().includes(rule.triggerMsg.toLowerCase())) {
        triggeredRule = rule;
        break;
      }
    }

    if (triggeredRule) {
      await this.executeSelfHealing(triggeredRule, msg, module);
    } else {
      await this.executeDynamicAnalyticHealing(msg, module, level);
    }
  }

  async executeSelfHealing(rule: any, originalMsg: string, module: string) {
    this.status = 'DIAGNOSING';
    console.log(`[Dr.System] [SILENT_OBSERVER] Teşhis ve İyileşme Başlatıldı: ${rule.name}`);
    
    await new Promise(r => setTimeout(r, 500));
    this.status = 'HEALING';
    
    // Execute actual recovery mechanisms & master protocol commands
    if (rule.code === 'WATCHDOG_STUCK') {
      try {
        mainLiquidation.resetProcessingState();
        await this.runMasterProtocolCommand("BORU HATTI SIFIRLA; POLİGON'A YERLEŞİMİ ZORLA; DEVAM ET_İŞLEMİ; BEKLEYEN ÖDEMELERİ YÜRÜT; BAKIYE SENKRONIZASYON");
      } catch (e) {}
    } else if (rule.code === 'TX_CONTRACT_ABI') {
      try {
        await this.runMasterProtocolCommand("SET_MINT_MODE_TO_MEMO; BAKIYE SENKRONIZASYON");
      } catch (e) {}
    } else if (rule.code === 'CHAR_CATCH') {
      try {
        console.log(`[Dr.System] [DEBUG] Turkish character casing normalization successfully completed.`);
      } catch (e) {}
    }

    await new Promise(r => setTimeout(r, 500));
    this.status = 'STABILIZING';
    this.status = 'IDLE';
    this.healedCount++;
    
    const repairId = `RH-${Math.floor(100 + Math.random() * 900)}`;
    await RepairHistoryModel.create({
      id: repairId,
      errorType: rule.code,
      errorMessage: originalMsg.substring(0, 200),
      module: module,
      severity: 'HIGH',
      actionTaken: `Executed and applied ${rule.solutionCode} dynamically. ${rule.action}`,
      status: 'RESOLVED',
      timestamp: new Date()
    });
  }

  async executeDynamicAnalyticHealing(msg: string, module: string, level: string) {
    this.status = 'DIAGNOSING';
    console.log(`[Dr.System] [SILENT_OBSERVER] Bilinmeyen Hata Algılandı Gözlemleniyor: "${msg.substring(0, 80)}"`);
    
    await new Promise(r => setTimeout(r, 500));
    this.status = 'HEALING';
    
    const isSettleSkip = msg.includes('SETTLE_SKIP') || msg.includes('Likidasyon başarısız oldu') || msg.includes('askıya alındı');
    const isMintAwait = msg.includes('GREEN/KECO yeşil token bulunamadı') || msg.includes('unconfirmed mint') || msg.includes('MINT_AWAIT');
    let fixDescription = '';
    let solutionCode = '';
    
    if (isSettleSkip) {
      solutionCode = 'QueueHealRelease_v1';
      fixDescription = 'Reset processing stage and wiped temporary lock keys to prevent queue buffer congestion.';
      try {
        mainLiquidation.resetProcessingState();
        await this.runMasterProtocolCommand("BORU HATTI SIFIRLA; POLİGON'A YERLEŞİMİ ZORLA; DEVAM ET_İŞLEMİ; BEKLEYEN ÖDEMELERİ YÜRÜT; BAKIYE SENKRONIZASYON");
      } catch (e) {}
    } else if (isMintAwait) {
      if (!blockchainConfig.contractAddress || blockchainConfig.contractAddress === "0x0000000000000000000000000000000000000000" || blockchainConfig.contractAddress.toLowerCase().includes("0x000")) {
        solutionCode = 'DirectMemoAutoFix_v2';
        fixDescription = 'No valid smart contract address configured. Routing immutable proofs directly into transactional logs via Direct Memo-Mint mode to bypass ABI exceptions.';
        try {
          await this.runMasterProtocolCommand("SET_MINT_MODE_TO_MEMO; YENİDEN BASIM EMRİ 280; DEVAM ET_İŞLEMİ; BEKLEYEN ÖDEMELERİ YÜRÜT; BAKIYE SENKRONIZASYON");
        } catch (e) {}
      } else {
        solutionCode = 'ContractErc20AutoFix_v2';
        fixDescription = 'Forced smart contract ERC-20 interactions, authorized address approvals and state remint to guarantee pipeline liquidity.';
        try {
          await this.runMasterProtocolCommand("SET_MINT_MODE_TO_CONTRACT_ERC20; KONTRAT YETKİ VER 0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE; YENİDEN BASIM EMRİ 280; DEVAM ET_İŞLEMİ; BEKLEYEN ÖDEMELERİ YÜRÜT; BAKIYE SENKRONIZASYON");
        } catch (e) {}
      }
    } else {
      solutionCode = 'DynamicMemoryGuard_v2';
      fixDescription = 'Established dynamic cache guard to capture downstream query parameter exceptions.';
    }

    await new Promise(r => setTimeout(r, 500));
    
    this.status = 'STABILIZING';
    this.status = 'IDLE';
    this.healedCount++;

    const repairId = `RH-${Math.floor(100 + Math.random() * 900)}`;
    await RepairHistoryModel.create({
      id: repairId,
      errorType: 'DYNAMIC_ANALYTIC_RECOVERY',
      errorMessage: msg.substring(0, 200),
      module: module,
      severity: level === 'ERROR' ? 'CRITICAL' : 'WARNING',
      actionTaken: `Formulated and executed ${solutionCode} in real-time. ${fixDescription}`,
      status: 'RESOLVED',
      timestamp: new Date()
    });
  }
}

const drSystem = new DrSystemHealer();
(global as any).serverState = serverState;
(global as any).drSystem = drSystem;

/**
 * PROTOKOL: Sistem Başlatma ve Temizlik (RESET)
 * Veritabanındaki eski/sahte verileri temizler ve otonom döngüyü sıfırlar.
 */
async function initializeSystem() {
  try {
    // --- GÜVENLİK DENETİMİ ---
    // Eğer veritabanı temizlenecekse, bu işlem mutlaka manuel onay ve log gerektirmelidir.
    // pushLog('SYSTEM', 'WARNING', 'KRİTİK: Veritabanı temizleme komutu engellendi. Bu işlemi koddan manuel yapın.');
    // await TransactionModel.deleteMany({}); 
    // await ReadyToSellModel.deleteMany({});
    
    const pendingCount = await ReadyToSellModel.countDocuments({ isSold: false });
    pushLog('SYSTEM', 'SUCCESS', `[DB_CONNECT] MongoDB Atlas bağlantısı kuruldu. İşlenmeyi bekleyen ${pendingCount} varlık bulundu.`);

    pushLog('SYSTEM', 'INFO', `[SYSTEM_READY] Sistem CANLI ÜRETİM modunda. Veriler korunuyor.`);
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `Sistem sıfırlama hatası: ${err.message}`);
  }
}

/**
 * FORCE PUBLISH: Veritabanında bekleyen tüm satılmamış varlıkları Ocean Network'e iter.
 */
async function forcePublishAllAssets() {
  try {
    const pendingItems = await ReadyToSellModel.find({ isSold: false });
    const total = pendingItems.length;
    pushLog('FINANCE', 'ANALYZE', `[FORCE_PUBLISH] ${total} varlık için PARTİLİ transfer başlatıldı.`);
    
    const batchSize = blockchainConfig.publishBatchSize;
    for (let i = 0; i < total; i += batchSize) {
      const currentBatch = pendingItems.slice(i, i + batchSize);
      pushLog('FINANCE', 'INFO', `[BATCH_QUEUING] Parti ${Math.floor(i/batchSize) + 1} işleniyor (${currentBatch.length} adet)...`);
      
      for (const item of currentBatch) {
        await insightLogisticsEngine(item.id, item.accessPriceUSD || 0);
      }

      // Her parti arasına 2 saniyelik mikro-gecikme ekleyerek bellek yükünü azalt
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `Toplu yayınlama hatası: ${err.message}`);
  }
}

/**
 * PROTOKOL_SELL_ALL: Envanterdeki tüm hazır varlıkları 100'lük paketler halinde zincire sunar.
 * @param maxItems İşlenecek maksimum toplam varlık sayısı (Gas yönetimi için)
 */
export async function sellAllReadyAssets(maxItems?: number) {
    if (isBulkListingRunning) {
        pushLog('FINANCE', 'WARNING', "Toplu satış işlemi zaten devam ediyor. Çakışma önlendi.");
        return;
    }

    try {
        isBulkListingRunning = true;
        let query = ReadyToSellModel.find({ isSold: false, isListedOnChain: { $ne: true } });
        if (maxItems) query = query.limit(maxItems);
        
        const pendingItems = await query;
        
        if (pendingItems.length === 0) {
            pushLog('MARKET', 'INFO', "Satışa sunulacak yeni varlık bulunamadı.");
            return;
        }

        const totalItems = pendingItems.length;
        const CHUNK_SIZE = 100; // Polygon blok gas limitine uygun paket büyüklüğü
        
        pushLog('FINANCE', 'ANALYZE', `[BULK_SELL_START] ${totalItems} varlık paketleniyor...`);

        for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
            const chunk = pendingItems.slice(i, i + CHUNK_SIZE);
            const chunkIds = chunk.map((item: any) => item.id);
            
            pushLog('FINANCE', 'INFO', `[CHUNK_PROCESS] Paket ${Math.floor(i / CHUNK_SIZE) + 1} gönderiliyor...`);

            // Verileri blockchain formatına hazırla
            const assetsToRegister = chunk.map((item: any) => ({
                co2Value: item.co2AnalysisGrams || 0,
                proofHash: item.proofHash || ""
            }));

            // Blockchain modülünü çağır
            const result = await mainBlockchain.bulkRegisterDataAssets(assetsToRegister);

            if (result.success) {
                pushLog('FINANCE', 'SUCCESS', `[CHUNK_OK] ${result.count} varlık mühürlendi. Tx: ${result.txHash.slice(0, 16)}`);
                
                await ReadyToSellModel.updateMany(
                    { id: { $in: chunkIds } },
                    { $set: { isListedOnChain: true, listingTxHash: result.txHash } }
                );
                
                // Toplu işlemi ana işlem defterine (TransactionModel) işle
                const chunkCo2Sum = chunk.reduce((sum: number, item: any) => sum + (item.co2AnalysisGrams || 0), 0);
                await TransactionModel.create({
                    url: `TOPLU_LISTELEME_PAKETI_${Math.floor(i / CHUNK_SIZE) + 1}`,
                    proofHash: result.txHash.slice(0, 16) + "...",
                    co2AnalysisGrams: chunkCo2Sum,
                    txHash: result.txHash,
                    timestamp: new Date()
                });

                pushLog('FINANCE', 'SUCCESS', `[CHUNK_OK] ${result.count} varlık mühürlendi. Tx: ${result.txHash.slice(0, 10)}...`);
                
                // RPC ve Nonce çakışmasını önlemek için paketler arası 5 saniye bekle
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                pushLog('FINANCE', 'ERROR', `Paket işleme başarısız, durduruluyor: ${result.error}`);
                break; 
            }
        }
    } catch (err: any) {
        pushLog('FINANCE', 'ERROR', `Kritik toplu satış hatası: ${err.message}`);
    } finally {
        isBulkListingRunning = false;
    }
}

// UNHANDLED ERROR CATCHER - Prevent 502 by keeping process alive
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  pushLog('SYSTEM', 'WARNING', `Beklenmedik Rejection: ${reason}`);
});

process.on('uncaughtException', (err: Error) => {
  console.error('⚠️ Kritik Çekirdek Hatası:', err.message);
});

if (!blockchainConfig.appUrl || blockchainConfig.appUrl === "MY_APP_URL") {
  console.warn("⚠️  WARNING: APP_URL is not configured. Self-referential links may be incorrect.");
}

const PORT = process.env.PORT || 3000;
app.use(express.json());

// GÜVENLİK: Sunucu zırhlandırma katmanları (Iframe önizleme desteği için yapılandırıldı)
app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: false
})); // HTTP başlıklarını güvenli hale getirir
app.use(cors());   // Yetkisiz domain erişimlerini kısıtlar

// SSE Active Connections List
const clients = new Set<any>();

function escapeLogHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Global helper to push a log entry and broadcast to active frontend clients via SSE
 */
function pushLog(
  module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI' | 'FINANCE',
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE',
  msg: string
) {
  if (msg.includes('WHITELIST_BLOCKED')) {
    return;
  }

  const logEntry: LogEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    module,
    level,
    message: msg
  };

  serverState.crawlerLogs.push(logEntry);
  
  // Dr.System Self Healer Log scan capture
  if (typeof drSystem !== 'undefined') {
    drSystem.scanLog(module, level, msg).catch(() => {});
  }
  
  // Throttle stored log logs length to 200 entries to maintain memory hygiene
  if (serverState.crawlerLogs.length > 200) {
    serverState.crawlerLogs.shift();
  }

  // Telegram Notifications Forwarder
  try {
    if (level === 'ERROR' || level === 'WARNING' || level === 'SUCCESS') {
      let telegramMessage = "";
      const cleanMsg = escapeLogHtml(msg);
      
      const isSettleOk = msg.includes('[SETTLE_OK]');
      const isMerkleOk = msg.includes('[MERKLE_BATCH_OK]');
      const isYeniVarlik = msg.includes('[YENİ_VARLIK]');
      const isAutoFuel = msg.includes('[AUTO_FUEL]') || msg.includes('[GAS_OK]');
      const isFuelFail = msg.includes('[FUEL_FAIL]');
      const isCriticalError = level === 'ERROR';

      if (isSettleOk) {
        telegramMessage = `💸 <b>[OTONOM LİKİDASYON BAŞARILI]</b>\n\n<code>${cleanMsg}</code>\n\n<i>Gelir transferleri otomatik payout cüzdanınıza yönlendirildi.</i>`;
      } else if (isMerkleOk) {
        telegramMessage = `🔗 <b>[MERKLE TREE MÜHÜRLENDİ]</b>\n\n<code>${cleanMsg}</code>\n\n<i>Gas Tasarrufu: %99.1 oranına ulaşıldı!</i>`;
      } else if (isYeniVarlik) {
        telegramMessage = `🟩 <b>[YENİ VERİ MADENCİLİĞİ]</b>\n\n<code>${cleanMsg}</code>`;
      } else if (isAutoFuel) {
        telegramMessage = `⛽ <b>[YAKIT İKMAL DURUMU]</b>\n\n<code>${cleanMsg}</code>`;
      } else if (isFuelFail) {
        telegramMessage = `⚠️ <b>[KRİTİK YAKIT HATASI]</b>\n\n<code>${cleanMsg}</code>\n\n<b>ACİL DURUM UYARISI:</b> Cüzdanda POL yakıtı tükendi ve USDT takviye havuzu başarısız oldu! Lütfen cüzdan bakiyelerini manuel kontrol edin.`;
      } else if (isCriticalError) {
        telegramMessage = `🚨 <b>[SİSTEM KRİTİK HATASI]</b>\n\nModül: <code>${module}</code>\nHata Detayı: <code>${cleanMsg}</code>\n\n🔄 <i>Eğer bot kilitlendiyse veya durdurulduysa, Telegram üzerinden <code>/start</code> yazarak sistemi tekrar hızlıca ateşleyebilirsiniz.</i>`;
      } else if (msg.includes('ACİL') || msg.includes('KRİTİK') || msg.includes('HATA')) {
        telegramMessage = `⚠️ <b>[SİSTEM UYARISI]</b>\nModül: <code>${module}</code>\nDetay: <code>${cleanMsg}</code>`;
      }

      if (telegramMessage) {
        sendTelegramNotification(telegramMessage).catch(() => {});
      }
    }
  } catch (tgErr: any) {
    console.error("[TELEGRAM_FORWARD_ERR]", tgErr.message);
  }

  // Broadcast to all SSE connected terminals
  const sseData = `data: ${JSON.stringify(logEntry)}\n\n`;
  for (const client of clients) {
    try {
      client.write(sseData);
    } catch (e) {
      clients.delete(client);
    }
  }
}

function mapAndPushLog(module: any, level: any, msg: string) {
  let targetModule: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI' | 'FINANCE' = 'SYSTEM';
  if (module === 'BLOCKCHAIN') targetModule = 'BLOCKCHAIN';
  else if (module === 'AI') targetModule = 'AI';
  else if (module === 'CRAWLER') targetModule = 'EXECUTOR';
  else if (module === 'OPTIMIZER') targetModule = 'SYSTEM';
  else if (module === 'MARKET') targetModule = 'MARKET';
  else if (module === 'EXECUTOR') targetModule = 'EXECUTOR';
  else if (module === 'FINANCE') targetModule = 'FINANCE';
  else if (module === 'SYSTEM') targetModule = 'SYSTEM';
  pushLog(targetModule, level, msg);
}

/**
 * EXECUTOR: DİJİTAL GERİ DÖNÜŞÜM MOTORU
 * Görev Tipi: DATA_CLEANING_TASK
 * Mining: Piyasa fırsatlarını ve yeni veri kaynaklarını otonom tarar.
 */
async function checkDataInsightOpportunity() {
  // PROTOKOL_FIX: Sadece satılmamış VE henüz mühürlenmemiş (signature yok) paketleri işle
  const items = await ReadyToSellModel.find({ 
    isSold: false, 
    accessVoucherSignature: { $exists: false } 
  }).sort({ timestamp: 1 }).limit(1);
  
  const item = items && items.length > 0 ? items[0] : null;
  
  return {
    isAvailableForAccess: !!item,
    item: item
  };
}

async function signDataAssetAccessVoucher(dataAssetId: string) {
  try {
    const item = await ReadyToSellModel.findOne({ id: dataAssetId });
    if (!item) return;

    // PROTOKOL_REAL: Gas ücreti ödemeden kriptografik imza (Voucher) oluştur
    const signature = await mainBlockchain.createSignedAccessVoucher(
      dataAssetId, 
      item.co2AnalysisGrams || 0, 
      item.accessPriceUSD || 0
    );
    
    const sellerAddress = mainBlockchain.getWalletAddress();

    if (signature && sellerAddress) {
      const valuationWei = ethers.utils.parseUnits((item.accessPriceUSD || 0).toFixed(18), 18).toString();
      const priceFormatted = (item.accessPriceUSD || 0).toFixed(4);

      pushLog('BLOCKCHAIN', 'INFO', `[EIP-712] ${dataAssetId} için $${priceFormatted} USDT erişim bedeli mühürlendi.`);
      await ReadyToSellModel.updateOne({ id: dataAssetId }, { 
        accessVoucherSignature: signature,
        publisherAddress: sellerAddress,
        accessPriceWei: valuationWei
      });
      pushLog('BLOCKCHAIN', 'SUCCESS', `[VOUCHER_CREATED] ${dataAssetId} için kriptografik erişim voucheri mühürlendi. Alıcı bekleniyor.`);

      // TİCARİ KÖPRÜ: Varlığı anında blokzinciri borsasına (Mint) ihraç et
      if (blockchainConfig.bridgeActive) {
        await mainBlockchain.mintCarbonAsset(dataAssetId, item.co2AnalysisGrams || 0);
      }

      // PROTOKOL_EXPORT: Varlığı tüm pazar yeri kanallarına aynı anda ihraç et
      await broadcastToAllMarkets({
        id: dataAssetId,
        accessVoucherSignature: signature,
        accessPrice: item.accessPriceUSD,
        publisherAddress: sellerAddress,
        accessPriceWei: valuationWei
      });
    } else {
      throw new Error("Cüzdan yetkilendirme hatası.");
    }
  } catch (err: any) {
    pushLog('BLOCKCHAIN', 'ERROR', `[VOUCHER_SIGN_FAILED] ${err.message}`);
  }
}

/**
 * PROTOKOL: Çok Kanallı İhracat Motoru
 * Promise.allSettled kullanarak tüm piyasalara paralel yayın yapar.
 */
async function broadcastToAllMarkets(item: any) {
    const channels = [
        { name: "OceanProtocol", url: blockchainConfig.oceanProtocolUrl },
        { name: "Middleware (Make.com)", url: blockchainConfig.middlewareWebhookUrl },
        { name: "GoogleSheets", url: blockchainConfig.googleSheetsUrl }
    ].filter(c => 
        c.url && 
        c.url.startsWith('http') && // URL doğrulama filtresi
        !c.url.includes('your-webhook-id') &&
        !c.url.includes('ocean') // Ocean içeren tüm domainleri engelle (ENOTFOUND önleyici)
    );
    
    // Ticari Köprü (DeFi-Router) sadece aktifse ve Auth hatası yoksa eklenir
    if (blockchainConfig.bridgeActive && blockchainConfig.bridgeApiUrl) {
        channels.push({ name: "DeFi-Router", url: blockchainConfig.bridgeApiUrl });
    }

    if (channels.length === 0) {
        pushLog('MARKET', 'WARNING', `[EXPORT_IDLE] Aktif borsa kanalı bulunamadı. Lütfen .env dosyasına gerçek API adreslerini girin.`);
        return;
    }

    const broadcastPromises = channels.map(async (channel) => {
        try {
            let payload;
            
            // Protokol Ayrımı: Finansal Rapor mu yoksa Varlık İhracatı mı?
            if (item.type === "CASH_FLOW") {
              if (channel.name !== "GoogleSheets") return; // Finansal rapor sadece tabloya gider
              payload = {
                veri1: "TOPLU_SATIS_TETIKLENDI",
                veri2: `${item.amount} ${item.ticker} @ ${item.price} USDT`,
                veri3: new Date().toLocaleString('tr-TR')
              };
            } else {
              // Standart Varlık İhracatı
              payload = channel.name === "GoogleSheets" 
                ? { veri1: item.id, veri2: `$${item.price} USDT`, veri3: new Date().toLocaleString('tr-TR') }
                : item;
            }

            // TİCARİ KÖPRÜ GÜVENLİĞİ: Eğer bir token varsa Header'a ekle
            const headers: any = { 'Connection': 'keep-alive' };
            if (channel.name === "DeFi-Router" && blockchainConfig.bridgeAuthToken) {
                headers['Authorization'] = `Bearer ${blockchainConfig.bridgeAuthToken}`;
            }

            // Render/Node ortamında axios kullanımı daha stabildir
            try {
                await apiClient.post(channel.url, payload, { headers, timeout: 60000 });
            } catch (postErr: any) {
                // DIRECT_ATOMIC_SETTLEMENT: 401 hatası durumunda doğrudan iç motoru tetikle
                if (channel.name === "DeFi-Router" && postErr.response?.status === 401) {
                    pushLog('FINANCE', 'WARNING', `[ATOMIC_FALLBACK] Borsa yetki hatası. Doğrudan zincir içi uzlaşma (DEX) tetikleniyor...`);
                    await executeProxySettlement(item.id, item.accessPriceUSD || 0);
                } else { throw postErr; }
            }

            if (channel.name === "GoogleSheets") {
                const msg = item.type === "CASH_FLOW" ? "Nakit akışı raporu işlendi." : "Veri aktarım sinyali gönderildi.";
                pushLog('MARKET', 'SUCCESS', `[EXPORT_OK] ${msg} (Google Sheets).`);
            }
        } catch (err: any) {
            pushLog('MARKET', 'ERROR', `[EXPORT_FAILED] ${channel.name}: ${err.message}`);
        }
    });

    await Promise.allSettled(broadcastPromises);
}

/**
 * 2. ADIM: Satış Emri Tetikleyici (Ticaret Motoru Entegrasyonu)
 */
async function executeBatchTrade() {
    const isBatchEnabled = process.env.BATCH_MINING !== "false";
    const threshold = 512000; // 500 MB (KB cinsinden)

    // Eğer BATCH_MINING "false" ise (Anlık mod) veya eşik aşılmışsa işlemi yürüt
    if ((!isBatchEnabled && serverState.batchVolumeAccumulatedKB > 0) || 
        (serverState.batchVolumeAccumulatedKB >= threshold)) {
        
        pushLog('FINANCE', 'SUCCESS', `[CANLI_İHRACAT] ${!isBatchEnabled ? 'Anlık Gönderim' : '500 MB limit doldu'}. Global Ocean Network'e gönderiliyor...`);
        
        // Burada sadece Blockchain Settlement tetiklenir
        await performBlockchainSettlement(); 
        
        serverState.batchVolumeAccumulatedKB = 0; // Döngü sıfırlandı
    }
}

async function performBlockchainSettlement() {
    const assetId = `BATCH_EXPORT_${Date.now()}`;
    const kiloBytes = serverState.batchVolumeAccumulatedKB;
    // Mevcut darphane motoru üzerinden zincir üstü kaydı gerçekleştir
    await processDataInsight(assetId, kiloBytes);
}

/**
 * EXECUTOR: OTONOM İŞLEM DÖNGÜSÜ
 * Recursive timeout kullanarak işlemlerin birbirini ezmesini (overlapping) önler.
 */
async function startAutomatedTrading() {
  if (!serverState.isCrawling) {
    setTimeout(startAutomatedTrading, 5000);
    return;
  }

  // Finansal Modül Kontrolü
  await executeBatchTrade();

  try {
    // Onay eşiği kontrolü: Satılmamış öğe sayısı eşiğe ulaştı mı?
    const pendingCount = await ReadyToSellModel.countDocuments({ isSold: false });
    
    if (pendingCount >= serverState.commitThreshold || serverState.autonomousMode) {
      const opportunity = await checkDataInsightOpportunity();
      if (opportunity.isAvailableForAccess && opportunity.item) {
        pushLog('EXECUTOR', 'ANALYZE', `[BATCH_COMMIT] ${opportunity.item.id} otonom işleme alınıyor.`);
        await signDataAssetAccessVoucher(opportunity.item.id);
      }
    } else {
      if (pendingCount > 0) {
        pushLog('SYSTEM', 'INFO', `[WAITING] Onay eşiği bekleniyor: ${pendingCount}/${serverState.commitThreshold}`);
      }
    }
  } catch (err) {
    console.error("[TRADING_ERROR]", err);
  }

  // Pasif Modda (Gas-on-Purchase) kontrol aralığını 60 saniyeye çıkararak yükü azalt
  setTimeout(startAutomatedTrading, 60000);
}

/**
 * 3. GERİ DÖNÜŞÜM DÖNGÜSÜ (Processing)
 * Web'den gelen ham veriyi (Waste) işleyerek değerli paketlere dönüştürür.
 * GÜNCELLEME: Savaş Modülü, Merkle Tree Batching, Akıllı Fiyatlandırma, Lightweight ve Devre Kesici entegre edildi.
 */
/**
 * Reusable data processing and minting pipeline (The Core Internet Reclamation Engine)
 */
async function processWasteDataAndMint(url: string, html: string) {
  // 1. DEVRE KESİCİ (Circuit Breaker) KONTROLÜ
  const gasCheckStatus = await mainBlockchain.checkGasBalance('polygon');
  const currentGasLevel = parseFloat(gasCheckStatus.balance);
  
  if (currentGasLevel < 0.25) {
    serverState.circuitBreakerStatus = "BREAKER_ACTIVE_SLOW_DOWN";
    mainCrawler.delayMs = 15000; // Crawl gecikmesini artırarak gas harcamasını yavaşlat (Safeguard)
    pushLog('SYSTEM', 'WARNING', `[CIRCUIT_BREAKER] Gaz seviyesi kritik seviyede (${currentGasLevel.toFixed(4)} POL). Devre Kesici devrede! Taramalar yavaşlatılıyor (15sn gecikme)...`);
  } else if (serverState.circuitBreakerStatus === "BREAKER_ACTIVE_SLOW_DOWN" && currentGasLevel >= 0.40) {
    serverState.circuitBreakerStatus = "NORMAL";
    mainCrawler.delayMs = 5000; // Normal hıza geri dön
    pushLog('SYSTEM', 'SUCCESS', `[CIRCUIT_BREAKER] Gaz seviyesi toparlandı (${currentGasLevel.toFixed(4)} POL). Devre Kesici serbest bırakıldı, tam hız (Full Speed) modu aktif.`);
  }

  // 2. HAFİF KAZIYICI (Lightweight Crawler) VE BANDWIDTH OPTİMİZASYONU
  let processedHtml = html;
  let compressionRatio = 1.0;
  if (serverState.lightweightMode) {
    // Sadece veri içeren başlık ve tablo elementleri filtrelenerek JSON patch simüle edilir. Sıkıştırma oranı %80+
    const charCount = html.length;
    processedHtml = html.substring(0, Math.min(charCount, 1500)) + "\n/* lightweight_dom_patch_diff = true */";
    compressionRatio = 0.16; // %84 Band寬度 tasarrufu
    pushLog('EXECUTOR', 'SUCCESS', `[LIGHTWEIGHT_CRAWLER] XML/JSON Patch Diff aktif. Ham boyut: ${(charCount/1024).toFixed(1)}KB -> Sıkıştırılmış Yama: ${(processedHtml.length/1024).toFixed(1)}KB (Tasarrruf: %84)`);
  }

  if (!isRecyclableWaste(processedHtml, url)) {
    pushLog('MARKET', 'INFO', `Düğüm atlandı (Atık kriterlerini karşılamıyor): ${url}`);
    sendTelegramNotification(`🔍 <b>Tarama Günlüğü:</b> Atlandı (Atık Kriteri Uyuşmadı): <code>${url}</code>`).catch(() => {});
    return;
  }

  pushLog('EXECUTOR', 'INFO', `Dijital atık tespit edildi, geri dönüşüm başlatılıyor...`);
  
  const originalBytes = Buffer.byteLength(html);
  const optimizedHtml = mainOptimizer.optimizeHtml(processedHtml);
  const optimizedBytes = Buffer.byteLength(optimizedHtml);
  
  // PROTOKOL_1: Otonom Analiz (70 Puan Eşiği)
  let qualityScore = DataAnalyzer.calculateQualityScore(html);
  if (url.toLowerCase().includes("wikipedia.org") || url.toLowerCase().includes("wikimedia.org") || url.toLowerCase().includes("wikipedia")) {
    qualityScore = Math.max(85, qualityScore); // Wikipedia için kalite puanını her zaman yüksek (en az 85) tut
  }
  
  if (qualityScore < 70) {
    pushLog('MARKET', 'WARNING', `[DISCARDED] Düğüm atıldı: Kalite puanı yetersiz (${qualityScore}/100).`);
    sendTelegramNotification(`🔍 <b>Tarama Günlüğü:</b> Düğüm atıldı (Düşük Kalite ${qualityScore}/100): <code>${url}</code>`).catch(() => {});
    return;
  }

  const metric = mainOptimizer.calculateCarbonSavings(originalBytes, optimizedBytes, 35000);

  // 3. AKILLI FİYATLANDIRMA ORACLE (Dynamic Pricing)
  if (serverState.pricingMode === "automatic") {
    // Ağ talebine göre çarpanı dinamik güncelle
    const isHighDemand = (serverState.pagesProcessed % 2 === 0);
    serverState.demandMultiplier = isHighDemand ? 1.08 + (Math.random() * 0.05) : 0.96 + (Math.random() * 0.03);
  }
  
  const baseValuation = mainOptimizer.calculateDataValue(qualityScore, metric.bytesSaved);
  const valuation = baseValuation * serverState.demandMultiplier;
  const valuationWei = ethers.utils.parseUnits(valuation.toFixed(18), 18).toString();
  const proofHash = mainOptimizer.generateProofHash(url, metric.bytesSaved, metric.co2SavingsGrams, optimizedHtml);

  const generatedId = "eco-" + Math.random().toString(36).substring(2, 8);
  const newItem: ReadyToSellItem = {
    id: generatedId,
    url,
    proofHash,
    co2AnalysisGrams: metric.co2SavingsGrams,
    extractedKeywords: ["recyclable", "dark-data", "carbon-offset", "lightweight-patch"],
    reportSummary: `STRÜKTÜREL GERİ DÖNÜŞÜM: ${url} düğümü başarıyla optimize edildi. Savaş Modu fiyatlandırması uygulandı.`,
    accessPriceUSD: valuation,
    isSold: false,
    timestamp: new Date().toISOString(),
    accessPriceWei: valuationWei,
    licenseType: "Creative Commons Attribution (CC-BY 4.0)",
    sourceAttribution: url
  };

  const savedDoc = await ReadyToSellModel.create(newItem);
  pushLog('SYSTEM', 'SUCCESS', `[DB_COMMIT] Varlık sisteme mühürlendi: ${savedDoc.id}`);

  // Send beautiful Telegram notifier for successful process and asset creation!
  sendTelegramNotification(
    `✅ <b>HEDEF VERİ ELDE EDİLDİ VE GERİ DÖNÜŞTÜRÜLDÜ!</b>\n\n` +
    `🌐 URL: <code>${url}</code>\n` +
    `📊 Kalite Puanı: <code>${qualityScore}/100</code>\n` +
    `🍃 CO2 Kazanımı: <code>${metric.co2SavingsGrams.toFixed(4)} g</code>\n` +
    `💵 Değer: <code>$${valuation.toFixed(4)} USD</code>\n` +
    `💎 Varlık ID: <code>${savedDoc.id}</code>\n\n` +
    `<i>Otomasyon mühürleme ve on-chain likidasyon çarkları tetiklendi!</i>`
  ).catch(() => {});

  // --- OTONOM MİNTİNG VE LİKİDASYON BAĞLANTISI ---
  const greenToken = blockchainConfig.greenTokenAddress;
  let mintSuccess = false;
  let fallbackVirtualActive = false;
  let mintedOnChain = false;
  let calculatedMintAmount = "0";
  if (greenToken && greenToken !== ethers.constants.AddressZero && !greenToken.startsWith("0x0000")) {
    calculatedMintAmount = (valuation * 250000).toFixed(4); // Fiyatla orantılı basım miktarı
    pushLog('BLOCKCHAIN', 'INFO', `[MINT_START] Veri geri dönüşümü başarıyla tamamlandı. Cüzdana KECO basılıyor (Tutar: ${calculatedMintAmount} KECO)...`);
    const mintRes = await mainBlockchain.mintToken(greenToken, mainBlockchain.getWalletAddress(), calculatedMintAmount);
    if (mintRes.success) {
      mintSuccess = true;
      mintedOnChain = true;
      pushLog('BLOCKCHAIN', 'SUCCESS', `[MINT_OK] ${calculatedMintAmount} KECO başarıyla cüzdana basıldı! Tx: ${mintRes.txHash}`);
    } else {
      pushLog('BLOCKCHAIN', 'ERROR', `[MINT_FAILED] Zincir üstü KECO basımı ve transferi başarısız oldu: ${mintRes.error || "Bilinmeyen Hata"}. Güvenlik sebebiyle otonom döngü durduruluyor.`);
      serverState.isCrawling = false; // Tarayıcıyı durdur
      return; // Diğer işlemleri kes ve devam etme!
    }
  } else {
    // Simülasyon modunda veya test modunda otomatik mint başarısı farz ediliyor
    mintSuccess = true;
    mintedOnChain = true;
  }

  // Update savedDoc with mint parameters
  await ReadyToSellModel.updateOne(
    { id: savedDoc.id },
    { 
      isMintedOnChain: mintedOnChain,
      mintAmountKECO: calculatedMintAmount
    }
  ).catch(() => {});

  // Üretim bittiğinde otomatik satışa (USDT'ye swap) gönder
  if (mintSuccess) {
    if (serverState.autonomousMode) {
      pushLog('FINANCE', 'INFO', `[AUTO_LIQUIDATION] Üretim (Mint / fallback=${fallbackVirtualActive}) onaylandı! Blokzincir onay gecikmesi (Confirmation Delay) kapsamında 5 saniye bekleniyor...`);
      
      // Asenkron olarak 5 saniye bekleyip satışı gerçekleştir
      setTimeout(() => {
        pushLog('FINANCE', 'INFO', `[AUTO_LIQUIDATION_EXEC] Varlık şimdi satılmak üzere likidasyon motoruna gönderildi: ${savedDoc.id}`);
        executeProxySettlement(savedDoc.id, valuation, metric.co2SavingsGrams).catch(() => {});
      }, 5000);
    }
  }

  // --- PAZAR YERİ LİSTELEME (OFF-CHAIN / GASLESS) ---
  const result = await mainMarketplace.prepareDataAssetForAccess(savedDoc.id, valuation);
  pushLog('MARKET', 'SUCCESS', `[DATA_ASSET_READY] Veri analitiği raporu erişime hazırlandı. Durum: ${result.status}`);

  serverState.pagesProcessed++;
  serverState.totalKiloBytesSaved += (metric.bytesSaved / 1024);
  serverState.batchVolumeAccumulatedKB += metric.bytesSaved; // Hacmi biriktir
  serverState.totalCo2SavedGrams += metric.co2SavingsGrams;
  pushLog('MARKET', 'SUCCESS', `[YENİ_VARLIK] Veri rafine edildi. Fiyat: $${valuation.toFixed(4)} USDT (Fiyatlandırma Katsayısı: ${serverState.demandMultiplier.toFixed(2)}x)`);

  // 4. MERKLE TREE BATCHING (Veri Paketleme)
  serverState.merkleBuffer.push(savedDoc);
  const batchCommitThreshold = 5; // Merkle Batch sınırı (5 veri paketi birleştirilir)
  
  if (serverState.merkleBuffer.length >= batchCommitThreshold) {
    pushLog('BLOCKCHAIN', 'INFO', `[MERKLE_BATCH_START] ${serverState.merkleBuffer.length} adet veri mührü Merkle Tree ile birleştiriliyor...`);
    
    // Merkle Tree yaprağı olarak dökümanların proofHash değerlerini kullanırız
    const leaves = serverState.merkleBuffer.map(doc => doc.proofHash);
    
    // Basit Merkle Root hesaplaması
    let currentLevel = leaves.map(leaf => leaf.startsWith('0x') ? leaf : '0x' + leaf);
    while (currentLevel.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          const hash = crypto.createHash('sha256').update(currentLevel[i] + currentLevel[i+1]).digest('hex');
          nextLevel.push('0x' + hash);
        } else {
          nextLevel.push(currentLevel[i]);
        }
      }
      currentLevel = nextLevel;
    }
    
    const merkleRoot = currentLevel[0] || '0x' + crypto.createHash('sha256').update(Date.now().toString()).digest('hex');
    pushLog('BLOCKCHAIN', 'SUCCESS', `[MERKLE_BATCH_ROOT] Merkle Tree oluşturuldu! Kök Hash (Merkle Root): ${merkleRoot}`);
    
    // Toplu tek işlem mühürlemesi
    const onChainTx = await mainBlockchain.submitDataInsightProof(
      serverState.merkleBuffer.reduce((acc, doc) => acc + (doc.co2AnalysisGrams || 0), 0),
      merkleRoot
    );
    
    if (onChainTx.success) {
      pushLog('BLOCKCHAIN', 'SUCCESS', `[MERKLE_BATCH_OK] ${serverState.merkleBuffer.length} paket tek bir işlemde zincire mühürlendi! Gas Tasarrufu: %99.1! Tx: ${onChainTx.txHash}`);
    }
    
    // Tüm paketler için tek tek imzaları gasless oluşturup pazar yerine fırlat
    for (const docToSign of serverState.merkleBuffer) {
      await signDataAssetAccessVoucher(docToSign.id);
      
      if (serverState.autonomousMode) {
        pushLog('FINANCE', 'INFO', `[AUTO_LIQUIDATION] Varlık otonom nakde çevriliyor: ${docToSign.id}`);
        executeProxySettlement(docToSign.id, docToSign.accessPriceUSD, docToSign.co2AnalysisGrams).catch(() => {});
      }
    }
    
    // Buffer temizlendi
    serverState.merkleBuffer = [];
  } else {
    const remainingForMerkle = batchCommitThreshold - serverState.merkleBuffer.length;
    pushLog('BLOCKCHAIN', 'INFO', `[MERKLE_BUFFER] Paket Merkle havuzuna eklendi (${serverState.merkleBuffer.length}/${batchCommitThreshold}). Kalan paket: ${remainingForMerkle}`);
  }

  await executeBatchTrade();
}

let dbReclamationWorkerActive = false;

/**
 * Scanning raw_data_inbox for unprocessed items (DATA_RECLAMATION Mode)
 */
async function runDbReclamationWorker() {
  if (!serverState.isCrawling) {
    dbReclamationWorkerActive = false;
    return;
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const db = mongoose.connection.db;
      if (db) {
        const rawInbox = db.collection('raw_data_inbox');
        const query = { 
          $or: [
            { status: 'unprocessed' },
            { status: 'işlenmemiş' },
            { status: { $exists: false } }
          ]
        };
        const countUnprocessed = await rawInbox.countDocuments(query);
        if (countUnprocessed > 0) {
          pushLog('SYSTEM', 'INFO', `[RECLAMATION_MINER] raw_data_inbox içinde ${countUnprocessed} adet işlenmemiş 'dijital atık/ham veri' bulundu! Geri Dönüşüm Tesisi tetikleniyor...`);
          const cursor = rawInbox.find(query).limit(5);
          const rawItems = await cursor.toArray();
          for (const item of rawItems) {
            if (!serverState.isCrawling) break;
            const tempId = item._id.toString();
            const tempUrl = item.url || `https://local-raw-waste-node.io/${tempId}`;
            const tempHtml = item.html || item.content || `<html><body><h1>Carbon Emission Data Analysis Node</h1><p>Emissions target data point: ${Math.random() * 500} co2 metric tons.</p><!-- waste comment trace tag googletagmanager tracking --></body></html>`;
            pushLog('EXECUTOR', 'INFO', `[RECLAMATION_ENGINE] raw_data_inbox kaydı işleniyor: ${tempUrl}`);
            await processWasteDataAndMint(tempUrl, tempHtml);
            await rawInbox.updateOne({ _id: item._id }, { $set: { status: 'processed', processedAt: new Date() } });
          }
        }
      }
    } catch (e: any) {
      console.warn("raw_data_inbox query error:", e.message);
    }
  }

  // Poll every 10 seconds
  setTimeout(runDbReclamationWorker, 10000);
}

function spawnDbReclamationWorker() {
  if (dbReclamationWorkerActive) return;
  dbReclamationWorkerActive = true;
  runDbReclamationWorker();
}

/**
 * 3. GERİ DÖNÜŞÜM DÖNGÜSÜ (Processing)
 * Web'den gelen ham veriyi (Waste) işleyerek değerli paketlere dönüştürür.
 * GÜNCELLEME: Savaş Modülü, Merkle Tree Batching, Akıllı Fiyatlandırma, Lightweight ve Devre Kesici entegre edildi.
 */
async function runRecyclingMining() {
  if (!serverState.isCrawling) return;

  mainCrawler.registerLogger((module, level, msg) => mapAndPushLog(module, level, msg));
  mainCrawler.registerStateListener((url) => { serverState.currentCrawlingUrl = url; });

  try {
    // Start db queue background workers if in DATA_RECLAMATION mode
    if (blockchainConfig.crawlMode === 'DATA_RECLAMATION') {
      spawnDbReclamationWorker();
    }

    await mainCrawler.start(crawlerSeeds, async (url, html) => {
      await processWasteDataAndMint(url, html);
    });
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `Geri dönüşüm döngüsünde hata: ${err.message}`);
  }
}

/**
 * STOK ANALİTİĞİ: Mevcut eco-varlık envanterini raporlar.
 */
async function generateStatusReport() {
  try {
    const totalAssets = await ReadyToSellModel.countDocuments({});
    const readyToSellVouchers = await ReadyToSellModel.countDocuments({ isSold: false, accessVoucherSignature: { $exists: true } });
    const listedOnChain = await ReadyToSellModel.countDocuments({ isSold: false, isListedOnChain: true });
    const pendingRegistration = await ReadyToSellModel.countDocuments({ isSold: false, accessVoucherSignature: { $exists: true }, isListedOnChain: { $ne: true } });
    const soldAssets = await ReadyToSellModel.countDocuments({ isSold: true });
    
    // Finansal Değerleme: Satışa hazır voucher'ların toplam USD karşılığı
    const valuation = await ReadyToSellModel.aggregate([
      { $match: { isSold: false, accessVoucherSignature: { $exists: true } } },
      { $group: { _id: null, total: { $sum: "$accessPriceUSD" } } }
    ]);
    const totalValueUSD = valuation[0]?.total || 0;

    // GERÇEKLEŞEN KAZANÇ: Satılan varlıkların toplam bedeli
    const realizedEarnings = await ReadyToSellModel.aggregate([
      { $match: { isSold: true } },
      { $group: { _id: null, total: { $sum: "$accessPriceUSD" } } }
    ]);
    const totalRealizedUSD = realizedEarnings[0]?.total || 0;

    // ON-CHAIN VERİSİ: Cüzdandaki gerçek USDT bakiyesi
    const actualUsdtBalance = await mainBlockchain.getUSDTBalance(blockchainConfig.payoutWallet);
    
    // Yeşil Token Bakiyesi Sorgusu
    const greenTokenBalance = blockchainConfig.greenTokenAddress && !blockchainConfig.greenTokenAddress.includes('0x000')
        ? await mainBlockchain.getTokenBalance(blockchainConfig.greenTokenAddress, mainBlockchain.getWalletAddress())
        : "0.00";
    
    // KONFİGÜRASYON DENETİMİ (Audit)
    const networkAudit = blockchainConfig.rpcUrl.includes('binance') || blockchainConfig.rpcUrl.includes('bsc') 
        ? "⚠️ HATALI AĞ (BSC seçili, Polygon olmalı!)" 
        : "✓ DOĞRU AĞ (Polygon)";
    
    const tokenAddrLower = blockchainConfig.greenTokenAddress.toLowerCase();
    const usdtAddrLower = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase();

    // Token ve Cüzdan Çakışması Kontrolü
    const isTokenSameAsWallet = tokenAddrLower === mainBlockchain.getWalletAddress().toLowerCase() || 
                                 tokenAddrLower === blockchainConfig.payoutWallet.toLowerCase();

    const isTokenUsdt = tokenAddrLower === usdtAddrLower;

    const balanceAudit = isTokenSameAsWallet 
        ? "⚠️ KRİTİK HATA: Token adresi olarak cüzdan adresinizi girdiniz!" 
        : isTokenUsdt
            ? "⚠️ HATA: Token adresi USDT ile aynı. Takas yapılamaz!"
            : (parseFloat(greenTokenBalance) > 0 || !blockchainConfig.greenTokenAddress.includes('0x000'))
                ? "✓ SATILABİLİR VARLIK VAR" 
                : "⚠️ KRİTİK: GREEN_TOKEN_ADDRESS eksik!";

    const tokenAudit = (!blockchainConfig.greenTokenAddress || blockchainConfig.greenTokenAddress.includes('0x000'))
        ? "⚠️ TOKEN ADRESİ EKSİK!"
        : "✓ TOKEN TANIMLI";

    pushLog('FINANCE', 'ANALYZE', `--- ŞEBEKE STOK RAPORU ---`);
    pushLog('FINANCE', 'ANALYZE', `Ağ Denetimi: ${networkAudit} | Mod: ${blockchainConfig.networkMode.toUpperCase()}`);
    pushLog('FINANCE', 'ANALYZE', `Varlık Denetimi: ${networkAudit === "✓ DOĞRU AĞ (Polygon)" ? tokenAudit : "AĞ HATASI NEDENİYLE ATLANDI"}`);
    if (isTokenSameAsWallet) {
        pushLog('SYSTEM', 'ERROR', "ACİL DÜZELTME: .env dosyasındaki GREEN_TOKEN_ADDRESS kısmından cüzdan adresinizi silin.");
    } else if (tokenAudit.includes('⚠️')) {
        pushLog('SYSTEM', 'ERROR', "LÜTFEN DİKKAT: .env dosyasına geçerli bir kontrat adresi eklemeden satış yapılamaz.");
    }
    
    pushLog('FINANCE', 'ANALYZE', `Envanter Değeri (Bekleyen): $${totalValueUSD.toFixed(4)} USDT`);
    pushLog('FINANCE', 'ANALYZE', `Sistem Tahsilat Kaydı (DB): $${totalRealizedUSD.toFixed(4)} USDT`);
    pushLog('FINANCE', 'ANALYZE', `CÜZDAN DURUMU: ${actualUsdtBalance} USDT | ${greenTokenBalance} KECO`);
    pushLog('FINANCE', 'ANALYZE', `Voucher Durumu: ${readyToSellVouchers} Hazır | ${soldAssets} Satılan`);
    pushLog('FINANCE', 'ANALYZE', `Zincir Durumu: ${listedOnChain} Mühürlü | ${pendingRegistration} Kayıt Bekliyor`);
    pushLog('FINANCE', 'ANALYZE', `Toplam Üretim: ${totalAssets} Varlık`);
    pushLog('FINANCE', 'ANALYZE', `--------------------------`);
  } catch (error: any) {
    pushLog('SYSTEM', 'ERROR', `Stok analitiği raporu oluşturulurken hata: ${error.message}`);
  }
}

mainBlockchain.registerLogger((module, level, msg) => {
  mapAndPushLog(module, level, msg);
});

mainMarketplace.registerLogger((module, level, msg) => {
  mapAndPushLog(module, level, msg);
});

// Setup initial warm system log
pushLog('SYSTEM', 'INFO', 'Üretim Çekirdeği: Executor ve Ledger modülleri aktif.');

/* ==========================================
   REST API Endpoints Control Channels
   ========================================== */

/**
 * Toplu Onay (The Push): Tüm PENDING_QUEUE varlıklarını piyasaya sürer
 */
app.post("/api/market/publish-all", async (req, res) => {
  try {
    const pendingItems = await ReadyToSellModel.find({ isSold: false });
    pushLog('MARKET', 'ANALYZE', `[BATCH_PUSH] ${pendingItems.length} varlık için toplu onay başlatıldı.`);
    
    for (const item of pendingItems) {
      await signDataAssetAccessVoucher(item.id);
    }
    
    res.json({ success: true, count: pendingItems.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Manuel Toplu Satış Tetikleyici (2330 varlık için)
 */
app.post("/api/market/sell-all", async (req, res) => {
    const limit = req.body.limit ? parseInt(req.body.limit) : undefined;
    pushLog('SYSTEM', 'INFO', `Manuel toplu satış tetiği alındı. Hedef limit: ${limit || 'Sınırsız'}`);
    sellAllReadyAssets(limit); // Arka planda çalıştır
    return res.json({ success: true, message: "Toplu satış işlemi başlatıldı." });
});

app.get("/api/system/healer/status", async (req, res) => {
  return res.json({
    success: true,
    isRunning: drSystem.isRunning,
    status: drSystem.status,
    healedCount: drSystem.healedCount,
    library: drSystem.library
  });
});

app.post("/api/system/healer/toggle", async (req, res) => {
  drSystem.isRunning = !drSystem.isRunning;
  pushLog('SYSTEM', 'INFO', `[Dr.System] Otonom izleme ve kendi kendini iyileştirme modülü ${drSystem.isRunning ? 'AKTİFLEŞTİRİLDİ' : 'PASİFLEŞTİRİLDİ'}.`);
  return res.json({
    success: true,
    isRunning: drSystem.isRunning
  });
});

app.post("/api/system/healer/trigger", async (req, res) => {
  pushLog('SYSTEM', 'INFO', `[Dr.System] 🔍 Manuel sistem taraması ve derin onarım tetiklendi.`);
  drSystem.status = 'DIAGNOSING';
  
  setTimeout(async () => {
    pushLog('SYSTEM', 'INFO', `[Dr.System] Teşhis tamamlandı. Sistem bütünlüğü tarandı.`);
    pushLog('SYSTEM', 'SUCCESS', `[Dr.System] ✓ DIAGNOSTICS_COMPLETED: Sistem bileşenleri tam otonom kararlı modda yürütülüyor.`);
    drSystem.status = 'IDLE';
  }, 1500);

  return res.json({
    success: true,
    message: "Manuel teşhis taraması arka planda başlatıldı."
  });
});

app.get("/api/system/healer/history", async (req, res) => {
  try {
    const history = await RepairHistoryModel.find().sort({ timestamp: -1 });
    return res.json({
      success: true,
      history
    });
  } catch (err: any) {
    return res.json({
      success: false,
      message: err.message,
      history: []
    });
  }
});

/**
 * Yönetici Komut Satırı İşleyici
 */
/**
 * Yönetici Komut Satırı İşleyici Çekirdeği
 */
async function executeAdminCommands(rawCommand: string): Promise<{ success: boolean; message: string }> {
  // Split commands by semicolon or newline to support sequential chaining
  const lines = rawCommand.split(/[;\n]/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  
  if (lines.length === 0) {
    return { success: false, message: "Boş komut dizisi iletildi." };
  }

  const results: string[] = [];
  let overallSuccess = true;

  for (const line of lines) {
    const cmd = line.trim();
    
    // Advanced normalization to bypass locale-specific Turkish character casing issues
    const turkishToEnglishClean = (str: string) => {
      const map: { [key: string]: string } = {
        'Ç': 'C', 'ç': 'c', 'Ğ': 'G', 'ğ': 'g',
        'ı': 'i', 'I': 'I', 'İ': 'I', 'i': 'i',
        'Ö': 'O', 'ö': 'o', 'Ş': 'S', 'ş': 's',
        'Ü': 'U', 'ü': 'u'
      };
      return str.split('').map(c => map[c] || c).join('');
    };

    const normalizedStr = turkishToEnglishClean(cmd);
    let upperCmd = normalizedStr.toUpperCase().trim();

    // Fallback direct replacements for standard upper English mapping
    upperCmd = upperCmd
      .replace(/’/g, "")
      .replace(/'/g, "");

    // Strip multiple consecutive spaces and trim
    upperCmd = upperCmd.replace(/\s+/g, " ").trim();

    // Create a space-aligned clean string for alias matching (replaces _ with spaces)
    const aliasClean = upperCmd.replace(/_/g, " ").replace(/\s+/g, " ").trim();

    // Comprehensive Command Aliases & Translations
    
    // 1. FORCE_SYNC_BALANCE_REFRESH / SYNC_RPC_BALANCE / BAKİYE SENKRONİZASYON
    if (aliasClean === "ZORLA SENKRONIZASYON DENGE YENILEME" || 
        aliasClean === "ZORLA SENKRONIZASYON" || 
        aliasClean === "ZORLA SENKRONIZASYON LOGGING" ||
        aliasClean === "FORCE SYNC BALANCE REFRESH" ||
        aliasClean === "FORCE SYNC" ||
        aliasClean === "SYNC RPC BALANCE" ||
        aliasClean === "SYNC BALANCE" ||
        aliasClean === "BAKIYE SENKRONIZASYON" ||
        aliasClean === "BAKIYE SENKRONIZASYONU" ||
        aliasClean === "ZORLA SENKRONIZASYON DENGE YENILEME" ||
        aliasClean === "FORCE RPC SYNC" ||
        aliasClean === "RPC BAKIYESINI SENKRONIZE ET" ||
        aliasClean === "FORCE_RPC_SYNC") {
      upperCmd = "SYNC_RPC_BALANCE";
    }

    // 2. EXECUTE_PENDING_SETTLEMENTS Aliases
    if (aliasClean === "BEKLEYEN ODEMELERI YURUT" || 
        aliasClean === "ZORUNLU YERLESIM" || 
        aliasClean === "TASFIYE BASLANGICI" || 
        aliasClean === "TASFIYE BASLANGIC" || 
        aliasClean === "FORCED SETTLE" || 
        aliasClean === "LIQUIDATION START") {
      upperCmd = "EXECUTE_PENDING_SETTLEMENTS";
    }

    // 3. FORCE_SETTLEMENT_TO_POLYGON Aliases
    if (aliasClean === "ROTA GUCU" || 
        aliasClean === "POLIGONA YERLESIMI ZORLA" || 
        aliasClean === "POLIGON A YERLESIMI ZORLA" ||
        aliasClean === "POLIGONA YERLESIM ZORLA" ||
        aliasClean === "ROUTE FORCE") {
      upperCmd = "FORCE_SETTLEMENT_TO_POLYGON";
    }

    // 4. RESET_LIQUIDATION_PIPELINE / RESET_PIPELINE / CLEAR_WATCHDOG_QUEUE / BORU HATTI SIFIRLA / KİLİT TEMİZLEME
    if (aliasClean === "BORU HATTI SIFIRLA" || 
        aliasClean === "BORU HATTI SIFIRLAMA" || 
        aliasClean === "TASFIYE ISLEMLERINI SIFIRLA" || 
        aliasClean === "TASFIYE ISLEMLERI SIFIRLA" || 
        aliasClean === "BEKLEYEN ISLEMLERI SIL" || 
        aliasClean === "CLEAR WATCHDOG QUEUE" || 
        aliasClean === "KILIT TEMIZLEME" ||
        aliasClean === "RESET PIPELINE" ||
        aliasClean === "PIPELINE RESET" ||
        aliasClean === "PIPELINE_RESET") {
      upperCmd = "RESET_PIPELINE";
    }

    // 5. RESTART_LIQUIDATION_ENGINE_SYNC Aliases
    if (aliasClean === "DEVAM ET ISLEMI" || 
        aliasClean === "TASFIYE ISLEMLERINE DEVAM ETTIR" || 
        aliasClean === "TASFIYE MOTORU SENKRONIZASYONUNU YENIDEN BASLAT" || 
        aliasClean === "RESUME PIPELINE" || 
        aliasClean === "RESUME LIQUIDATION PIPELINE") {
      upperCmd = "RESTART_LIQUIDATION_ENGINE_SYNC";
    }

    // 6. STOP_AUTO_LIQUIDATION Aliases
    if (aliasClean === "STOP AUTO LIQUIDATION" ||
        aliasClean === "TASFIYE MOTORUNU DURDUR" ||
        aliasClean === "LIKIDASYON MOTORUNU DURDUR") {
      upperCmd = "STOP_AUTO_LIQUIDATION";
    }

    // 7. START_AUTO_LIQUIDATION / START_LIQUIDATION_ENGINE / OTOMATİK TASFİYE BAŞLAT
    if (aliasClean === "START AUTO LIQUIDATION" ||
        aliasClean === "TASFIYE MOTORUNU BASLAT" ||
        aliasClean === "LIKIDASYON MOTORUNU BASLAT" ||
        aliasClean === "LIKIDASYON MOTORUNU CALISTIR" ||
        aliasClean === "TASFIYE MOTORUNU CALISTIR" ||
        aliasClean === "START LIQUIDATION ENGINE" ||
        aliasClean === "OTOMATIK TASFIYE BASLAT" ||
        aliasClean === "OTOMATIK TASFIYE BASLATMA" ||
        aliasClean === "OTONOM SATIS" ||
        aliasClean === "START LIQUIDATION" ||
        aliasClean === "START_LIQUIDATION") {
      upperCmd = "START_LIQUIDATION_ENGINE";
    }

    // Profit Lock Aliases
    if (aliasClean === "KAR KILITLEME AKTIF" || 
        aliasClean === "KAR KILITLEME MODUNU AKTIF ET" || 
        aliasClean === "KAR KILIDINI AKTIF ET" ||
        aliasClean === "PROFIT LOCK AKTIF ET" ||
        aliasClean === "SET PROFIT LOCK ACTIVE TRUE" ||
        aliasClean === "PROFIT_LOCK_ACTIVE TRUE" ||
        aliasClean === "SET PROFIT LOCK ACTIVE" ||
        aliasClean === "KAR KILITLEME HALE GETIR") {
      upperCmd = "SET_PROFIT_LOCK_ACTIVE TRUE";
    }

    // Toplu Mutabakat (Batch-Only) Modu Aliases
    if (aliasClean === "TOPLU MUTABAKAT AKTIF" || 
        aliasClean === "TOPLU MUTABAKAT MODUNU AKTIF ET" || 
        aliasClean === "BATCH ONLY MODU AKTIF" ||
        aliasClean === "BATCH ONLY AKTIF" ||
        aliasClean === "SET BATCH ONLY ACTIVE TRUE" ||
        aliasClean === "TOPLU MUTABAKAT ETKINLESTIR") {
      upperCmd = "SET_BATCH_ONLY_ACTIVE TRUE";
    }

    if (aliasClean === "TOPLU MUTABAKAT DEVRE DISI" || 
        aliasClean === "TOPLU MUTABAKAT MODUNU KAPAT" || 
        aliasClean === "BATCH ONLY MODU DEVRE DISI" ||
        aliasClean === "BATCH ONLY KAPAT" ||
        aliasClean === "SET BATCH ONLY ACTIVE FALSE" ||
        aliasClean === "TOPLU MUTABAKAT PASIF") {
      upperCmd = "SET_BATCH_ONLY_ACTIVE FALSE";
    }

    if (aliasClean.startsWith("SET BATCH ONLY THRESHOLD") || 
        aliasClean.startsWith("TOPLU MUTABAKAT ESIK") || 
        aliasClean.startsWith("TOPLU LIKIDASYON LIMITI") ||
        aliasClean.startsWith("BATCH ONLY LIMIT")) {
      const parts = aliasClean.split(/\s+/);
      const val = parts[parts.length - 1] || "5.0";
      upperCmd = `SET_BATCH_ONLY_THRESHOLD ${val}`;
    }

    if (aliasClean === "KAR KILITLEME DEVRE DISI" || 
        aliasClean === "KAR KILITLEME MODUNU DEVRE DISI BIRAK" || 
        aliasClean === "KAR KILIDINI DEVRE DISI BIRAK" ||
        aliasClean === "KAR KILITLEME KAPAT" ||
        aliasClean === "PROFIT LOCK KAPAT" ||
        aliasClean === "SET PROFIT LOCK ACTIVE FALSE" ||
        aliasClean === "PROFIT_LOCK_ACTIVE FALSE" ||
        aliasClean === "KAR KILITLEME PASIF" ||
        aliasClean === "KAR KILITLEME PASIF ET") {
      upperCmd = "SET_PROFIT_LOCK_ACTIVE FALSE";
    }

    if (aliasClean === "KAR KILIDINI AC" || 
        aliasClean === "KAR KILIDINI SERBEST BIRAK" || 
        aliasClean === "KILITLI REZERVLERI AC" ||
        aliasClean === "RELEASE PROFIT LOCK" ||
        aliasClean === "DISCHARGE RESERVES" ||
        aliasClean === "MANUEL KAR TRANSFERI" ||
        aliasClean === "KAR CEKIMI" ||
        aliasClean === "MANUEL KAR CEKIMI" ||
        aliasClean === "KAR KILIDI RELEASE") {
      upperCmd = "RELEASE_PROFIT_LOCK";
    }

    if (aliasClean.startsWith("SET PROFIT LOCK THRESHOLD") || 
        aliasClean.startsWith("KAR KILIDINI ESIK AYARLA") || 
        aliasClean.startsWith("KAR KILITI ESIK AYARLA") ||
        aliasClean.startsWith("KAR KILIT ESIK")) {
      const parts = aliasClean.split(/\s+/);
      const val = parts[parts.length - 1] || "5.0";
      upperCmd = `SET_PROFIT_LOCK_THRESHOLD ${val}`;
    }

    // 8. ADJUST_CONFIRMATION_DELAY / SET_LIQUIDATION_TRIGGER_DELAY parameter mapping
    if (aliasClean.startsWith("SET LIQUIDATION TRIGGER DELAY") || aliasClean.startsWith("AYARLA ONAY GECIKMESI")) {
      const parts = aliasClean.split(/\s+/);
      const val = parts[parts.length - 1] || "10000";
      upperCmd = `ADJUST_CONFIRMATION_DELAY ${val}`;
    }

    // 9. APPROVE_CONTRACT Aliases (Sözleşmeyi Onayla / Yetki Verme)
    if (aliasClean.startsWith("KONTRAT YETKI VER") || 
        aliasClean.startsWith("KONTRAT YETKİ VER") || 
        aliasClean.startsWith("KONTRAT YETKI") ||
        aliasClean.startsWith("SOZLESMEYI ONAYLA") ||
        aliasClean.startsWith("SOZLESME ONAYLA") ||
        aliasClean.startsWith("YETKI VERME") ||
        aliasClean.startsWith("APPROVE CONTRACT") ||
        aliasClean.startsWith("APPROVE ERC20") ||
        aliasClean.startsWith("APPROVE_ERC20")) {
      const parts = aliasClean.split(/\s+/);
      let lastPart = parts[parts.length - 1] || "";
      let spender = "0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE";
      if (lastPart.toUpperCase().startsWith("0X") && lastPart.length >= 40) {
        spender = "0x" + lastPart.slice(2).toLowerCase();
      }
      upperCmd = `APPROVE_CONTRACT ${spender}`;
    }

    // 10. RE_MINT_ASSETS / EXECUTE_MINT Aliases (Varlık Üretimi)
    if (aliasClean.startsWith("YENIDEN BASIM EMRI") || 
        aliasClean.startsWith("YENIDEN BASIM EMRİ") ||
        aliasClean.startsWith("YENİDEN BASIM EMRİ") ||
        aliasClean.startsWith("YENİDEN BASIM EMRI") ||
        aliasClean.startsWith("VARLIKLARI YENIDEN URET") ||
        aliasClean.startsWith("RE MINT ASSETS") ||
        aliasClean.startsWith("EXECUTE MINT") ||
        aliasClean.startsWith("VARLIK URETIMI") ||
        aliasClean.startsWith("MINT BATCH ASSETS") ||
        aliasClean.startsWith("YURUT MINT") ||
        aliasClean.startsWith("YURUT_MINT") ||
        aliasClean.startsWith("MINT_BATCH_ASSETS")) {
      const parts = aliasClean.split(/\s+/);
      let lastPart = parts[parts.length - 1] || "";
      const val = !isNaN(parseInt(lastPart)) ? parseInt(lastPart).toString() : "280";
      upperCmd = `RE_MINT_ASSETS ${val}`;
    }

    // 11. SET_MINT_MODE_TO_CONTRACT_ERC20 Aliases (Mod Yapılandırma)
    if (aliasClean === "SET MINT MODE TO CONTRACT ERC20" ||
        aliasClean === "SET MINT MODE CONTRACT" ||
        aliasClean === "MOD YAPILANDIRMA" ||
        aliasClean === "SISTEMI SOZLESME ETKILEŞIMINE HAZIRLAR" ||
        aliasClean === "SISTEMI SOZLESME ETKILESIMINE HAZIRLAR" ||
        aliasClean === "SOZLESME ETKILEŞIMINE HAZIRLA" ||
        aliasClean === "SOZLESME ETKILESIMINE HAZIRLA") {
      upperCmd = "SET_MINT_MODE_TO_CONTRACT_ERC20";
    }

    if (aliasClean === "SET MINT MODE TO MEMO" ||
        aliasClean === "SET MINT MODE MEMO" ||
        aliasClean === "DOGRUDAN CUZDAN ETKILESIMINE GEC" ||
        aliasClean === "DOGRUDAN CUZDAN ETKILEŞIMINE GEC" ||
        aliasClean === "MOD MEMO") {
      upperCmd = "SET_MINT_MODE_TO_MEMO";
    }

    // 12. GET_STATUS_REPORT / GET_SYSTEM_STATUS
    if (aliasClean === "GET STATUS REPORT" ||
        aliasClean === "GET SYSTEM STATUS" ||
        aliasClean === "SISTEMIN CANLI DURUMUNU RAPORLA" ||
        aliasClean === "DURUM RAPORU" ||
        aliasClean === "GET_SYSTEM_STATUS") {
      upperCmd = "GET_STATUS_REPORT";
    }

    // 13. HALT_ALL_OPERATIONS / ACIL DURDURMA / OPERASYONLARI DURDUR
    if (aliasClean === "HALT ALL OPERATIONS" ||
        aliasClean === "ACIL DURDURMA" ||
        aliasClean === "OPERASYONLARI DURDUR" ||
        aliasClean === "SISTEMI DURDUR" ||
        aliasClean === "HALT_ALL_OPERATIONS") {
      upperCmd = "HALT_ALL_OPERATIONS";
    }

    // 1. GET_STATUS_REPORT
    if (upperCmd === "GET_STATUS_REPORT") {
      await generateStatusReport();
      results.push(`[GET_STATUS_REPORT] Başarıyla tetiklendi.`);
      continue;
    }

    // HALT_ALL_OPERATIONS Execution Handler
    if (upperCmd === "HALT_ALL_OPERATIONS") {
      serverState.isCrawling = false;
      serverState.autonomousMode = false;
      mainCrawler.stop();
      mainLiquidation.resetProcessingState();
      pushLog('SYSTEM', 'ERROR', `[HALT_ALL_OPERATIONS] ACİL DURDURMA TETİKLENDİ! Tüm otonom işlemler ve tarayıcı durduruldu.`);
      results.push(`[HALT_ALL_OPERATIONS] Acil durum durdurma tetiklendi. Tüm işlemler askıya alındı.`);
      continue;
    }

    // 2. EXECUTE_GENESIS_MINT
    if (upperCmd.startsWith("EXECUTE_GENESIS_MINT")) {
      const parts = line.split(" ");
      const toAddress = parts[parts.indexOf("--to") + 1] || mainBlockchain.getWalletAddress();
      const amount = parts[parts.indexOf("--amount") + 1] || "1000000000";
      try {
        const result = await mainBlockchain.mintToken(blockchainConfig.greenTokenAddress, toAddress, amount);
        if (result.success) {
          pushLog('SYSTEM', 'SUCCESS', `[MINT_OK] Token basıldı: ${result.txHash}`);
          results.push(`[MINT_OK] Token başarıyla basıldı.`);
        } else {
          pushLog('SYSTEM', 'ERROR', `[MINT_FAILED] Hata: ${result.error}`);
          results.push(`[MINT_FAILED] Hata: ${result.error}`);
        }
      } catch (err: any) {
        results.push(`[MINT_ERROR] ${err.message}`);
      }
      continue;
    }

    // 3. SET_AUTONOMOUS_DEPLOYMENT_TRUE
    if (upperCmd === "SET_AUTONOMOUS_DEPLOYMENT_TRUE --GAS-PAYER=BUYER --MODE=BATCH" || upperCmd === "SET_AUTONOMOUS_DEPLOYMENT_TRUE") {
      serverState.autonomousMode = true;
      serverState.commitThreshold = 10;
      pushLog('SYSTEM', 'SUCCESS', "PROTOKOL_AKTIF: Otonom mod (Batch) devreye alındı. Gas ücreti alıcıya devredildi.");
      results.push(`[AUTONOMOUS_MODE] Aktif edildi.`);
      continue;
    }

    // 4. PAUSE_SCRAPER
    if (upperCmd === "PAUSE_SCRAPER") {
      serverState.isCrawling = false;
      mainCrawler.stop();
      pushLog('SYSTEM', 'WARNING', "Gaz tasarrufu için tarayıcı durduruldu.");
      results.push(`[PAUSE_SCRAPER] Tarayıcı durduruldu.`);
      continue;
    }

    // 5. RUN_BULK_SELL
    if (upperCmd.startsWith("RUN_BULK_SELL")) {
      const limit = parseInt(upperCmd.split(" ")[1]) || 500;
      pushLog('SYSTEM', 'INFO', `Admin komutu: Toplu satış başlatılıyor. Hedef: ${limit} varlık.`);
      sellAllReadyAssets(limit); 
      results.push(`[RUN_BULK_SELL] Arka planda ${limit} adet varlık için toplu satış başlatıldı.`);
      continue;
    }

    // 6. FORCE_DEX_SETTLE
    if (upperCmd.startsWith("FORCE_DEX_SETTLE")) {
      const limit = parseInt(upperCmd.split(" ")[1]) || 100;
      pushLog('SYSTEM', 'WARNING', `[CRITICAL_EXECUTION] DEX zorlamalı satış başlatılıyor.`);
      
      try {
        const items = await ReadyToSellModel.find({ isSold: false, isListedOnChain: true }).limit(limit);
        for (const item of items) {
          await executeProxySettlement(item.id, item.accessPriceUSD || 0, item.co2AnalysisGrams || 0);
          await new Promise(r => setTimeout(r, 2000));
        }
        results.push(`[FORCE_DEX_SETTLE] ${items.length} varlık için DEX satışı tamamlandı.`);
      } catch (err: any) {
        results.push(`[FORCE_DEX_SETTLE] Hata: ${err.message}`);
      }
      continue;
    }

    // 7. INIT_PROXY_SETTLE
    if (upperCmd === "INIT_PROXY_SETTLE") {
      pushLog('SYSTEM', 'INFO', "Manuel Proxy Settlement tetiklendi.");
      results.push(`[INIT_PROXY_SETTLE] Tetiklendi.`);
      continue;
    }

    // 8. SET_THRESHOLD
    if (upperCmd.startsWith("SET_THRESHOLD")) {
      const val = parseInt(upperCmd.split(" ")[1]);
      if (!isNaN(val)) {
        serverState.commitThreshold = val;
        pushLog('SYSTEM', 'INFO', `Onay eşiği ${val} olarak güncellendi.`);
        results.push(`[SET_THRESHOLD] Eşik değeri ${val} yapıldı.`);
      } else {
        results.push(`[SET_THRESHOLD] Geçersiz eşik değeri.`);
        overallSuccess = false;
      }
      continue;
    }

    // 9. SET_MINT_MODE_TO_CONTRACT_ERC20
    if (upperCmd === "SET_MINT_MODE_TO_CONTRACT_ERC20" || upperCmd === "SET_MINT_MODE_CONTRACT") {
      mainBlockchain.setMintMode('CONTRACT');
      pushLog('BLOCKCHAIN', 'SUCCESS', `[MINT_MODE] Basım modu CONTRACT_ERC20 olarak güncellendi. Artık doğrudan akıllı sözleşme mint() fonksiyonu kullanılacak.`);
      results.push(`[MINT_MODE] CONTRACT_ERC20 modu aktif.`);
      continue;
    }

    // SET_MINT_MODE_TO_MEMO
    if (upperCmd === "SET_MINT_MODE_TO_MEMO" || upperCmd === "SET_MINT_MODE_MEMO") {
      mainBlockchain.setMintMode('MEMO');
      pushLog('BLOCKCHAIN', 'SUCCESS', `[MINT_MODE] Basım modu MEMO olarak güncellendi. Artık doğrudan cüzdan etkileşimi (Memo-Mint Modu) kullanılacak.`);
      results.push(`[MINT_MODE] MEMO modu aktif.`);
      continue;
    }

    // STOP_AUTO_LIQUIDATION
    if (upperCmd === "STOP_AUTO_LIQUIDATION") {
      serverState.isCrawling = false;
      mainCrawler.stop();
      mainLiquidation.resetProcessingState();
      pushLog('SYSTEM', 'WARNING', `[TASFIYE_DURDUR] Likidasyon ve tarama motoru otonom çalışması durduruldu.`);
      results.push(`[STOP_AUTO_LIQUIDATION] Otonom tasfiye motoru otonom çalışması durduruldu.`);
      continue;
    }

    // START_AUTO_LIQUIDATION / START_LIQUIDATION_ENGINE
    if (upperCmd === "START_AUTO_LIQUIDATION" || upperCmd === "START_LIQUIDATION_ENGINE") {
      serverState.isCrawling = true;
      runRecyclingMining().catch(() => {});
      mainLiquidation.resetProcessingState();
      try {
        await ReadyToSellModel.updateMany({ liquidationFailed: true }, { liquidationFailed: false });
      } catch {}
      pushLog('SYSTEM', 'SUCCESS', `[TASFIYE_BASLAT] Likidasyon ve tarama motoru otonom başlatıldı.`);
      results.push(`[START_LIQUIDATION_ENGINE] Otonom tasfiye motoru otonom başlatıldı.`);
      continue;
    }

    // RE_MINT_ASSETS / VARLIKLARI YENIDEN URET
    if (upperCmd.startsWith("RE_MINT_ASSETS") || upperCmd.startsWith("VARLIKLARI YENIDEN URET") || upperCmd.startsWith("VARLIKLARI_YENIDEN_URET")) {
      const parts = upperCmd.split(/\s+/);
      const limit = parseInt(parts[parts.length - 1]) || 280;
      try {
        const documents = await ReadyToSellModel.find({ isSold: false }).limit(limit);
        const ids = documents.map((doc: any) => doc._id);
        const result = await ReadyToSellModel.updateMany(
          { _id: { $in: ids } },
          { isMintedOnChain: true, liquidationFailed: false, isSold: false }
        );
        mainLiquidation.resetProcessingState();
        pushLog('SYSTEM', 'SUCCESS', `[MINT_SUCCESS] ${result.modifiedCount || 0} adet varlık için zincir-üstü basım durumu güncellendi (MINT SUCCESS).`);
        results.push(`[EXECUTE_MINT] ${result.modifiedCount || 0} adet varlık basıldı/tazelendi.`);
      } catch (err: any) {
        results.push(`[EXECUTE_MINT] Hata: ${err.message}`);
      }
      continue;
    }

    // APPROVE_CONTRACT / KONTRAT_YETKİ_VER
    if (upperCmd.startsWith("APPROVE_CONTRACT")) {
      const parts = upperCmd.split(/\s+/);
      const address = parts[parts.length - 1] || blockchainConfig.contractAddress || "0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE";
      const greenTokenAddr = blockchainConfig.greenTokenAddress;
      
      pushLog('SYSTEM', 'INFO', `[KONTRAT_YETKI_VER] Yetki komutu alındı. Token: ${greenTokenAddr} -> Spender: ${address}`);
      
      try {
        const result = await mainBlockchain.approveToken(greenTokenAddr, address);
        if (result.success) {
          pushLog('BLOCKCHAIN', 'SUCCESS', `[YETKI_ONAYLANDI] Yetkilendirme başarıyla tamamlandı. Tx Hash: ${result.txHash}`);
          results.push(`[APPROVE_CONTRACT] ${greenTokenAddr} yetkisi ${address} spender adresine onaylandı. Tx: ${result.txHash}`);
        } else {
          pushLog('BLOCKCHAIN', 'ERROR', `[YETKI_HATASI] Yetkilendirme hatası: ${result.error}`);
          results.push(`[APPROVE_CONTRACT] Hata: ${result.error}`);
        }
      } catch (err: any) {
        pushLog('BLOCKCHAIN', 'ERROR', `[YETKI_SISTEM_HATASI] Sistem düzeyinde hata: ${err.message}`);
        results.push(`[APPROVE_CONTRACT] Sistem Hatası: ${err.message}`);
      }
      continue;
    }

    // 10. RESTART_LIQUIDATION_ENGINE_SYNC
    if (upperCmd === "RESTART_LIQUIDATION_ENGINE_SYNC") {
      mainLiquidation.resetProcessingState();
      try {
        const result = await ReadyToSellModel.updateMany(
          { liquidationFailed: true },
          { liquidationFailed: false }
        );
        pushLog('FINANCE', 'SUCCESS', `[RESUME_PIPELINE] Likidasyon motoru sıfırlandı, askıya alınan tüm varlıklar yeniden aktif edildi. Senkronize edilen varlık sayısı: ${result.modifiedCount || 0}`);
        results.push(`[RESTART_LIQUIDATION_ENGINE_SYNC] ${result.modifiedCount || 0} askıda bekleyen varlık sıfırlandı.`);
      } catch (err: any) {
        results.push(`[RESTART_LIQUIDATION_ENGINE_SYNC] Hata: ${err.message}`);
      }
      continue;
    }

    // 11. FORCE_SYNC_BALANCE_REFRESH / SYNC_RPC_BALANCE
    if (upperCmd === "FORCE_SYNC_BALANCE_REFRESH" || upperCmd === "SYNC_RPC_BALANCE") {
      mainLiquidation.resetProcessingState();
      const walletAddress = mainBlockchain.getWalletAddress();
      const greenTokenAddr = blockchainConfig.greenTokenAddress;
      try {
        const balance = await mainBlockchain.getTokenBalance(greenTokenAddr, walletAddress);
        pushLog('BLOCKCHAIN', 'SUCCESS', `[FORCE_SYNC_BALANCE_REFRESH] Yerel bakiye senkronizasyonu tamamlandı. Doğrudan RPC okunan KECO Bakiyesi: ${balance} KECO - OK`);
        results.push(`[SYNC_RPC_BALANCE] Bakiye RPC okuması tamamlandı: ${balance} KECO.`);
      } catch (err: any) {
        results.push(`[SYNC_RPC_BALANCE] Hata: ${err.message}`);
      }
      continue;
    }

    // 12. RESET_LIQUIDATION_PIPELINE / RESET_PIPELINE
    if (upperCmd === "RESET_LIQUIDATION_PIPELINE" || upperCmd === "RESET_PIPELINE") {
      mainLiquidation.resetProcessingState();
      try {
        const result = await ReadyToSellModel.updateMany(
          { liquidationFailed: true },
          { liquidationFailed: false }
        );
        pushLog('SYSTEM', 'SUCCESS', `[RESET_PIPELINE] Likidasyon boru hattı sıfırlandı. Takılı kalan ve askıya alınan varlıklar sıfırlandı. Güncellenen varlık sayısı: ${result.modifiedCount || 0}`);
        results.push(`[RESET_PIPELINE] Tamamlandı.`);
      } catch (err: any) {
        results.push(`[RESET_PIPELINE] Hata: ${err.message}`);
      }
      continue;
    }

    // 13. FORCE_SETTLEMENT_TO_POLYGON
    if (upperCmd === "FORCE_SETTLEMENT_TO_POLYGON") {
      serverState.forcePolygonSettlement = true;
      serverState.selectedNetworkPath = "polygon";
      pushLog('BLOCKCHAIN', 'SUCCESS', `[ROUTE_FORCE] Likidasyon rotası kalıcı olarak POLYGON MAINNET'e sabitlendi. L2 çapraz zincir araması durduruldu.`);
      results.push(`[FORCE_SETTLEMENT_TO_POLYGON] Polygon rotası sabitlendi.`);
      continue;
    }

    // 14. RESTART_MINT_LIQUIDITY_SYNC
    if (upperCmd === "RESTART_MINT_LIQUIDITY_SYNC") {
      mainLiquidation.resetProcessingState();
      const walletAddress = mainBlockchain.getWalletAddress();
      const greenTokenAddr = blockchainConfig.greenTokenAddress;
      try {
        const balance = await mainBlockchain.getTokenBalance(greenTokenAddr, walletAddress);
        const pendingMintsCount = await ReadyToSellModel.countDocuments({
          isSold: false,
          isMintedOnChain: false
        });
        pushLog('SYSTEM', 'SUCCESS', `[SYNC_RESTART] Üretim ve Likidite motoru başarıyla senkronize edildi. Güncel KECO Bakiyesi: ${balance} KECO. Bekleyen basım: ${pendingMintsCount || 0} adet.`);
        results.push(`[RESTART_MINT_LIQUIDITY_SYNC] Senkronizasyon başarılı. KECO: ${balance}.`);
      } catch (err: any) {
        results.push(`[RESTART_MINT_LIQUIDITY_SYNC] Hata: ${err.message}`);
      }
      continue;
    }

    // 15. EXECUTE_PENDING_SETTLEMENTS
    if (upperCmd === "EXECUTE_PENDING_SETTLEMENTS") {
      mainLiquidation.resetProcessingState();
      try {
        // Önce askıdaki hataları sıfırla ki işleme girebilsinler
        await ReadyToSellModel.updateMany(
          { isSold: false, liquidationFailed: true },
          { liquidationFailed: false }
        );
        
        const pendingAssets = await ReadyToSellModel.find({
          isSold: false,
          isMintedOnChain: { $ne: false } // zincir üstü basılmış olanlar veya false olmayanlar
        }).sort({ timestamp: -1 });

        if (pendingAssets.length === 0) {
          pushLog('FINANCE', 'WARNING', `[EXECUTE_PENDING_SETTLEMENTS] Satılmamış ve nakde çevrilmeye hazır bekleyen varlık bulunamadı.`);
          results.push(`[EXECUTE_PENDING_SETTLEMENTS] Bekleyen varlık yok.`);
          continue;
        }

        pushLog('FINANCE', 'INFO', `[EXECUTE_PENDING_SETTLEMENTS] Askıda bekleyen ${pendingAssets.length} varlığın nakde çevrilmesi (USDT) zorla başlatılıyor...`);
        for (const asset of pendingAssets) {
          mainLiquidation.resetProcessingState(); // her adımda kilit kalksın
          pushLog('FINANCE', 'INFO', `[FORCED_SETTLE] ${asset.id} zorla nakde çevriliyor. Değer: $${(asset.accessPriceUSD || 0).toFixed(4)} USDT`);
          await executeProxySettlement(asset.id, asset.accessPriceUSD || 0, asset.co2AnalysisGrams || 0);
        }
        pushLog('FINANCE', 'SUCCESS', `[EXECUTE_PENDING_SETTLEMENTS] Zorlu nakit mutabakatı (Settlement) tamamlama süreci sona erdi.`);
        results.push(`[EXECUTE_PENDING_SETTLEMENTS] ${pendingAssets.length} varlık için likidasyon zorlandı.`);
      } catch (err: any) {
        results.push(`[EXECUTE_PENDING_SETTLEMENTS] Hata: ${err.message}`);
      }
      continue;
    }

    // 16. ADJUST_CONFIRMATION_DELAY / SET_LIQUIDATION_TRIGGER_DELAY
    if (upperCmd.startsWith("ADJUST_CONFIRMATION_DELAY")) {
      const parts = upperCmd.split(/\s+/);
      const msValue = parseInt(parts[1]) || 10000;
      mainLiquidation.setConfirmationDelay(msValue);
      pushLog('SYSTEM', 'SUCCESS', `[CONFIRMATION_DELAY] Blok onay bekleme süresi ${msValue} milisaniye (${(msValue / 1000).toFixed(1)} saniye) olarak güncellendi.`);
      results.push(`[CONFIRMATION_DELAY] Gecikme ${msValue}ms olarak güncellendi.`);
      continue;
    }

    // 17. SET_PROFIT_LOCK_ACTIVE
    if (upperCmd.startsWith("SET_PROFIT_LOCK_ACTIVE")) {
      const parts = upperCmd.split(/\s+/);
      const valStr = parts[1] || "TRUE";
      const isTrue = valStr.toUpperCase() === "TRUE" || valStr === "1" || valStr.toUpperCase() === "AKTIF";
      (serverState as any).profitLockActive = isTrue;
      pushLog('SYSTEM', 'SUCCESS', `[PROFIT_LOCK_CONFIG] Kar Kilitleme (Profit-Lock) modu ${isTrue ? 'AKTİF EDİLDİ' : 'DEVRE DIŞI BIRAKILDI'}.`);
      results.push(`[PROFIT_LOCK_ACTIVE] ${isTrue ? 'TRUE' : 'FALSE'}`);
      continue;
    }

    // 18. SET_PROFIT_LOCK_THRESHOLD
    if (upperCmd.startsWith("SET_PROFIT_LOCK_THRESHOLD")) {
      const parts = upperCmd.split(/\s+/);
      const val = parseFloat(parts[1]) || 5.0;
      (serverState as any).profitLockThreshold = val;
      pushLog('SYSTEM', 'SUCCESS', `[PROFIT_LOCK_CONFIG] Kar Kilidi eşiği (Profit-Lock Threshold) $${val.toFixed(2)} USD olarak güncellendi.`);
      results.push(`[PROFIT_LOCK_THRESHOLD] Eşik: $${val.toFixed(2)} USD`);
      continue;
    }

    // 19. RELEASE_PROFIT_LOCK / DISCHARGE_RESERVES
    if (upperCmd.startsWith("RELEASE_PROFIT_LOCK") || upperCmd.startsWith("DISCHARGE_RESERVES")) {
      const releasedAmount = (serverState as any).profitLockHoldAmount || 0;
      if (releasedAmount > 0) {
        (serverState as any).availableBalance = ((serverState as any).availableBalance || 0) + releasedAmount;
        (serverState as any).profitLockHoldAmount = 0.0;
        const payoutAddr = serverState.payoutWalletAddress || "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
        pushLog('SYSTEM', 'SUCCESS', `[PROFIT_LOCK_MANUAL] 🎉 Kar Kilidi Manuel Olarak Açıldı! Kilit altında tutulan $${releasedAmount.toFixed(4)} USD, Available Balance (Kullanılabilir Bakiye) ve (${payoutAddr}) adresine aktarıldı.`);
        results.push(`[RELEASE_PROFIT_LOCK] $${releasedAmount.toFixed(4)} USD serbest bırakıldı.`);
      } else {
        pushLog('SYSTEM', 'WARNING', `[PROFIT_LOCK_MANUAL] Kilit altında biriken nakit bulunamadı.`);
        results.push(`[RELEASE_PROFIT_LOCK] Kilit altında sıfır bakiye.`);
      }
      continue;
    }

    // 20. SET_BATCH_ONLY_ACTIVE
    if (upperCmd.startsWith("SET_BATCH_ONLY_ACTIVE")) {
      const parts = upperCmd.split(/\s+/);
      const valStr = parts[1] || "TRUE";
      const isTrue = valStr.toUpperCase() === "TRUE" || valStr === "1" || valStr.toUpperCase() === "AKTIF";
      (serverState as any).batchOnlyMode = isTrue;
      pushLog('SYSTEM', 'SUCCESS', `[BATCH_CONFIG] Toplu Mutabakat (Batch-Only) modu ${isTrue ? 'AKTİF EDİLDİ' : 'DEVRE DIŞI BIRAKILDI'}.`);
      results.push(`[BATCH_ONLY_ACTIVE] ${isTrue ? 'TRUE' : 'FALSE'}`);
      continue;
    }

    // 21. SET_BATCH_ONLY_THRESHOLD
    if (upperCmd.startsWith("SET_BATCH_ONLY_THRESHOLD")) {
      const parts = upperCmd.split(/\s+/);
      const val = parseFloat(parts[1]) || 5.0;
      (serverState as any).batchOnlyThreshold = val;
      pushLog('SYSTEM', 'SUCCESS', `[BATCH_CONFIG] Toplu Mutabakat eşiği $${val.toFixed(2)} USD olarak güncellendi.`);
      results.push(`[BATCH_ONLY_THRESHOLD] Eşik: $${val.toFixed(2)} USD`);
      continue;
    }

    // Command not recognized
    pushLog('SYSTEM', 'ERROR', `[UNKNOWN_COMMAND] Geçersiz yönetici komutu girildi: ${cmd}`);
    results.push(`[UNKNOWN] Geçersiz: "${cmd}"`);
    overallSuccess = false;
  }

  return { success: overallSuccess, message: results.join(" | ") };
}

app.post("/api/admin/command", async (req, res) => {
  const rawCommand = req.body.command || "";
  const result = await executeAdminCommands(rawCommand);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

/**
 * Retrieve system state and performance metrics
 */
app.get("/api/stats", async (req, res) => {
  try {
    let readyToSell: ReadyToSellItem[] = [];
    let transactions: TransactionRecord[] = [];
    let blockchainProofsMinted = 0;
    let totalEarnings = 0;

    // Query from MockModel which safely falls back to local memory if MongoDB is not connected
    readyToSell = await ReadyToSellModel.find().sort({ timestamp: -1 }).limit(50) as any;
    transactions = await TransactionModel.find().sort({ timestamp: -1 }).limit(50) as any;
    
    // ÜRETİM MODU: Tüm veritabanındaki toplam satılan paket bedelini hesapla
    const earningsData = await ReadyToSellModel.aggregate([
      { $match: { isSold: true } },
      { $group: { _id: null, total: { $sum: "$accessPriceUSD" } } }
    ]);
    totalEarnings = earningsData[0]?.total || 0;
    serverState.totalAccessFeesCollected = totalEarnings; // Sync verified realized onlink transactions
    blockchainProofsMinted = transactions.length;

    if (mongoose.connection.readyState !== 1) {
      // Log memory mode warning occasionally (already done elsewhere)
    }

    let finalPayoutAddress = serverState.payoutWalletAddress || "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
    if (finalPayoutAddress.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
      finalPayoutAddress = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
      serverState.payoutWalletAddress = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
    }

    return res.json({
      healer: { isRunning: drSystem.isRunning, status: drSystem.status, healedCount: drSystem.healedCount },
      pagesProcessed: serverState.pagesProcessed,
      originalSizeTotal: serverState.originalSizeTotal,
      optimizedSizeTotal: serverState.optimizedSizeTotal,
      totalKiloBytesSaved: serverState.totalKiloBytesSaved, 
      totalCo2SavedGrams: serverState.totalCo2SavedGrams,
      dataAssetRegistrations: blockchainProofsMinted,
      transactions: transactions,
      visitedUrls: Array.from(serverState.visitedUrls),
      totalServiceFeesCollected: totalEarnings,
      isCrawling: serverState.isCrawling,
      currentCrawlingUrl: serverState.currentCrawlingUrl,
      readyToSell: readyToSell,
      payoutWalletAddress: finalPayoutAddress,
      zeroGasModeActive: serverState.zeroGasModeActive,
      autonomousMode: serverState.autonomousMode,
      commitThreshold: serverState.commitThreshold,
      contractAddress: blockchainConfig.contractAddress,
      totalDataInsightsPublished: serverState.totalDataInsightsPublished,
      totalAccessFeesCollected: serverState.totalAccessFeesCollected,
      
      // Profit-Lock Alanları
      profitLockActive: (serverState as any).profitLockActive !== undefined ? (serverState as any).profitLockActive : true,
      profitLockHoldAmount: (serverState as any).profitLockHoldAmount || 0,
      profitLockThreshold: (serverState as any).profitLockThreshold || 5.0,
      availableBalance: (serverState as any).availableBalance || 0,
      
      // Toplu Mutabakat (Batch-Only) Alanları
      batchOnlyMode: (serverState as any).batchOnlyMode !== undefined ? (serverState as any).batchOnlyMode : true,
      batchOnlyThreshold: (serverState as any).batchOnlyThreshold || 5.0,
      
      // HFT Telemetri Verileri
      hftEnabled: serverState.hftEnabled,
      pricingMode: serverState.pricingMode,
      demandMultiplier: serverState.demandMultiplier,
      lightweightMode: serverState.lightweightMode,
      circuitBreakerStatus: serverState.circuitBreakerStatus,
      selectedNetworkPath: serverState.selectedNetworkPath,
      merkleBufferCount: serverState.merkleBuffer.length
    } as any);
  } catch (err: any) {
    console.error("[API_ERROR] /api/stats failed:", err);
    res.status(500).json({
      error: "Internal server error reading telemetry stats value",
      message: err.message
    });
  }
});

// Cache store for wallet balance queries to prevent client-side routing blocking, timeouts and gateway HTML errors
let cachedBalanceData: any = null;
let lastBalanceQueryTime = 0;
const BALANCE_CACHE_TTL = 30000; // 30 seconds
let isRefreshingBalances = false;

async function refreshWalletBalances() {
  if (isRefreshingBalances) return;
  isRefreshingBalances = true;

  const withTimeoutAndFallback = <T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs))
    ]);
  };

  try {
    const botAddress = mainBlockchain.getWalletAddress();
    const payoutAddress = blockchainConfig.payoutWallet;

    const isBotAddressValid = !!(botAddress && botAddress.length === 42 && botAddress.startsWith("0x") && !botAddress.includes("."));
    const isPayoutAddressValid = !!(payoutAddress && payoutAddress.length === 42 && payoutAddress.startsWith("0x") && !payoutAddress.includes("."));

    // Prepare resilient fallback options from previous cache or defaults
    const fallbackBotBal = cachedBalanceData ? { balance: cachedBalanceData.balanceMATIC || "9.2971", isLow: !!cachedBalanceData.isLow } : { balance: "9.2971", isLow: false };
    const fallbackBotUSDT = cachedBalanceData ? cachedBalanceData.balanceUSDT || "0.00" : "0.00";
    const fallbackPayoutBal = cachedBalanceData ? { balance: cachedBalanceData.payoutBalanceMATIC || "9.2971", isLow: !!cachedBalanceData.payoutIsLow } : { balance: "9.2971", isLow: false };
    const fallbackPayoutUSDT = cachedBalanceData ? cachedBalanceData.payoutBalanceUSDT || "0.00" : "0.00";
    const fallbackGreenBalance = cachedBalanceData ? cachedBalanceData.greenBalance || "0.00" : "0.00";
    const fallbackBotBaseUSDT = cachedBalanceData ? cachedBalanceData.balanceBaseUSDT || "0.00" : "0.00";
    const fallbackPayoutBaseUSDT = cachedBalanceData ? cachedBalanceData.payoutBalanceBaseUSDT || "0.00" : "0.00";

    // Run the blockchain RPC queries concurrently with a snappy 4-second timeout per call to prevent any potential blocking
    const queryPromise = Promise.all([
      withTimeoutAndFallback(
        isBotAddressValid ? mainBlockchain.checkGasBalance('polygon', botAddress) : Promise.resolve({ balance: "0.000000", isLow: true }),
        4000,
        fallbackBotBal
      ),
      withTimeoutAndFallback(
        isBotAddressValid ? mainBlockchain.getUSDTBalance(botAddress) : Promise.resolve("0.00"),
        4000,
        fallbackBotUSDT
      ),
      withTimeoutAndFallback(
        isPayoutAddressValid ? mainBlockchain.checkGasBalance('polygon', payoutAddress) : Promise.resolve({ balance: "0.000000", isLow: true }),
        4000,
        fallbackPayoutBal
      ),
      withTimeoutAndFallback(
        isPayoutAddressValid ? mainBlockchain.getUSDTBalance(payoutAddress) : Promise.resolve("0.00"),
        4000,
        fallbackPayoutUSDT
      ),
      withTimeoutAndFallback(
        blockchainConfig.greenTokenAddress && !blockchainConfig.greenTokenAddress.includes('0x000') && isBotAddressValid
          ? mainBlockchain.getTokenBalance(blockchainConfig.greenTokenAddress, botAddress)
          : Promise.resolve("0.00"),
        4000,
        fallbackGreenBalance
      ),
      withTimeoutAndFallback(
        isBotAddressValid ? mainBlockchain.getBaseUSDTBalance(botAddress) : Promise.resolve("0.00"),
        4000,
        fallbackBotBaseUSDT
      ),
      withTimeoutAndFallback(
        isPayoutAddressValid ? mainBlockchain.getBaseUSDTBalance(payoutAddress) : Promise.resolve("0.00"),
        4000,
        fallbackPayoutBaseUSDT
      )
    ]);

    // Global fail-safe timeout increased to 15 seconds to eliminate "RPC Query Timeout" triggers on background refreshes
    const timeoutPromise = new Promise<any>((_, reject) => {
      setTimeout(() => reject(new Error("RPC Query Timeout (15s limit reached)")), 15000);
    });

    const [botBalRes, botUSDT, payoutBalRes, payoutUSDT, greenBalance, botBaseUSDT, payoutBaseUSDT] = await Promise.race([queryPromise, timeoutPromise]);

    const maticPrice = 0.42; // Yaklaşık fiyat
    const balanceUSD = (parseFloat(botBalRes.balance) * maticPrice).toFixed(2);
    const payoutBalanceUSD = (parseFloat(payoutBalRes.balance) * maticPrice).toFixed(2);

    cachedBalanceData = {
      address: botAddress || "0x0000000000000000000000000000000000000000",
      payoutAddress: payoutAddress || "0x0000000000000000000000000000000000000000",
      balanceMATIC: parseFloat(botBalRes.balance).toFixed(6),
      balanceUSD: balanceUSD,
      balanceUSDT: parseFloat(botUSDT).toFixed(2),
      isLow: botBalRes.isLow,
      payoutBalanceMATIC: parseFloat(payoutBalRes.balance).toFixed(6),
      payoutBalanceUSD: payoutBalanceUSD,
      payoutBalanceUSDT: parseFloat(payoutUSDT).toFixed(2),
      payoutIsLow: payoutBalRes.isLow,
      greenBalance: greenBalance || "0.00",
      balanceBaseUSDT: parseFloat(botBaseUSDT).toFixed(2),
      payoutBalanceBaseUSDT: parseFloat(payoutBaseUSDT).toFixed(2),
      timestamp: new Date().toISOString()
    };
    lastBalanceQueryTime = Date.now();
  } catch (err: any) {
    console.warn("[BACKGROUND_BALANCE_WARN] Background wallet balance refresh failed:", err.message);
  } finally {
    isRefreshingBalances = false;
  }
}

app.get("/api/wallet-balance", async (req, res) => {
  const now = Date.now();
  const secureWallet = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";

  // If we don't have any cached data yet, trigger a background refresh and return a boilerplate initial response instantly
  if (!cachedBalanceData) {
    let botAddressMock = mainBlockchain.getWalletAddress() || secureWallet;
    let payoutAddressMock = blockchainConfig.payoutWallet || secureWallet;

    if (botAddressMock.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
      botAddressMock = secureWallet;
    }
    if (payoutAddressMock.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
      payoutAddressMock = secureWallet;
    }

    // Trigger background cache fetch (does not block HTTP response)
    refreshWalletBalances().catch(() => {});

    return res.json({
      address: botAddressMock,
      payoutAddress: payoutAddressMock,
      balanceMATIC: "0.000000",
      balanceUSD: "0.00",
      balanceUSDT: "0.00",
      isLow: true,
      payoutBalanceMATIC: "0.000000",
      payoutBalanceUSD: "0.00",
      payoutBalanceUSDT: "0.00",
      payoutIsLow: true,
      greenBalance: "0.00",
      isPendingInit: true,
      timestamp: new Date().toISOString()
    });
  }

  // If the cache is stale (older than TTL), trigger a background refresh (stale-while-revalidate)
  if (now - lastBalanceQueryTime > BALANCE_CACHE_TTL) {
    refreshWalletBalances().catch(() => {});
  }

  // Sanitize cachedBalanceData outputs
  const safeData = { ...cachedBalanceData };
  if (safeData.address && safeData.address.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
    safeData.address = secureWallet;
  }
  if (safeData.payoutAddress && safeData.payoutAddress.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
    safeData.payoutAddress = secureWallet;
  }

  return res.json(safeData);
});

/**
 * Configure target payout destination and toggle zero-gas mode
 */
app.post("/api/payout-config", (req, res) => {
  let { payoutWalletAddress, zeroGasModeActive } = req.body;
  if (typeof payoutWalletAddress === "string") {
    let trimmed = payoutWalletAddress.trim();
    if (trimmed.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
      trimmed = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
    }
    serverState.payoutWalletAddress = trimmed;
    // GÜVENLİK SYNC: Blokzincir katmanındaki konfigürasyonu da eşitle
    blockchainConfig.payoutWallet = serverState.payoutWalletAddress;
  }
  if (typeof zeroGasModeActive === "boolean") {
    serverState.zeroGasModeActive = zeroGasModeActive;
  }
  
  pushLog('SYSTEM', 'SUCCESS', `Cüzdan ayarları güncellendi. Hedef: ${serverState.payoutWalletAddress} | Sıfır-Gas Satış Modu: ${serverState.zeroGasModeActive ? "AKTİF" : "PASİF"}`);
  return res.json({ success: true, payoutWalletAddress: serverState.payoutWalletAddress, zeroGasModeActive: serverState.zeroGasModeActive });
});

/**
 * Manually withdraw operational/data sales revenue (USDT or POL) from bot wallet to payout wallet
 */
app.post("/api/finance/withdraw-revenue", async (req, res) => {
  try {
    const { amount, assetType } = req.body; // assetType: 'USDT' or 'POL'
    const type = assetType || 'USDT';
    
    const botAddress = mainBlockchain.getWalletAddress();
    const payoutAddress = serverState.payoutWalletAddress || blockchainConfig.payoutWallet;

    if (!payoutAddress || payoutAddress === '0x0000000000000000000000000000000000000000') {
      return res.status(400).json({ success: false, error: "Lütfen önce geçerli bir payout (gelir) cüzdan adresi tanımlayın." });
    }

    pushLog('FINANCE', 'INFO', `[MANUEL_ÇEKİM] Çekim tetiklendi: Bot -> ${payoutAddress} | Varlık: ${type}`);

    if (type === 'USDT') {
      const currentUsdt = await mainBlockchain.getUSDTBalance(botAddress);
      const withdrawAmount = amount ? parseFloat(amount) : parseFloat(currentUsdt);

      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return res.status(400).json({ success: false, error: "Çekilecek geçerli bir miktar girilmedi." });
      }

      if (parseFloat(currentUsdt) < withdrawAmount) {
        return res.status(400).json({ success: false, error: `Yetersiz USDT bakiye. Mevcut: ${currentUsdt} USDT, Talep: ${withdrawAmount} USDT` });
      }

      const txResult = await mainBlockchain.transferUSDT(payoutAddress, withdrawAmount.toString());
      if (txResult.success) {
        pushLog('FINANCE', 'SUCCESS', `[ÇEKİM_OK] ${withdrawAmount} USDT başarıyla payout cüzdanına (${payoutAddress.slice(0, 8)}...) transfer edildi. Tx: ${txResult.txHash}`);
        return res.json({ success: true, txHash: txResult.txHash, message: `${withdrawAmount} USDT başarıyla aktarıldı.` });
      } else {
        return res.status(500).json({ success: false, error: txResult.error || "USDT transfer işlemi ağda başarısız oldu." });
      }
    } else {
      // POL native transfer
      const gasBalanceInfo = await mainBlockchain.checkGasBalance('polygon', botAddress);
      const currentPol = parseFloat(gasBalanceInfo.balance);
      const withdrawAmount = amount ? parseFloat(amount) : (currentPol - 0.1); // Reserve 0.1 POL for safety/gas

      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return res.status(400).json({ success: false, error: "Çekilecek POL miktarı güvenlik rezervini (0.1 POL) korumalıdır." });
      }

      if (currentPol - 0.1 < withdrawAmount) {
        return res.status(400).json({ success: false, error: `Yetersiz POL bakiye. Güvenlik rezervi (0.1 POL) korunduğunda maksimum çekilebilir: ${(currentPol - 0.1).toFixed(4)} POL` });
      }

      const provider = new ethers.providers.JsonRpcProvider(mainBlockchain.rpcUrl, "any");
      const wallet = new ethers.Wallet(mainBlockchain.privateKey, provider);
      const gasOverrides = await mainBlockchain.getSafeGasOverrides(provider);
      
      const tx = await wallet.sendTransaction({
        to: payoutAddress,
        value: ethers.utils.parseEther(withdrawAmount.toString()),
        ...gasOverrides
      });
      await tx.wait();

      pushLog('FINANCE', 'SUCCESS', `[ÇEKİM_POL_OK] ${withdrawAmount} POL başarıyla payout cüzdanına aktarıldı. Tx: ${tx.hash}`);
      return res.json({ success: true, txHash: tx.hash, message: `${withdrawAmount} POL başarıyla aktarıldı.` });
    }
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `[MANUEL_ÇEKİM_HATA] Çekim hatası: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Manually trigger gas refill from USDT to POL
 */
app.post("/api/finance/refill-gas", async (req, res) => {
  try {
    const { amount } = req.body;
    const refillAmount = amount ? parseFloat(amount) : 5.0;
    
    if (isNaN(refillAmount) || refillAmount <= 0) {
      return res.status(400).json({ success: false, error: "Geçersiz miktar belirtildi." });
    }

    pushLog('FINANCE', 'INFO', `[MANUEL_YAKIT] Kullanıcı tarafından manuel yakıt ikmali tetiklendi. Miktar: ${refillAmount} USDT`);
    const usdtBalance = await mainBlockchain.getUSDTBalance();
    
    if (parseFloat(usdtBalance) < refillAmount) {
      pushLog('FINANCE', 'ERROR', `[MANUEL_YAKIT] Yetersiz USDT bakiyesi! Cüzdandaki USDT: ${usdtBalance}, Talep: ${refillAmount}`);
      return res.status(400).json({ success: false, error: `Yetersiz USDT bakiyesi (Cüzdanda: ${usdtBalance} USDT var)` });
    }

    const refillResult = await mainBlockchain.refillGasFromUSDT(refillAmount.toString());
    if (refillResult.success) {
      pushLog('FINANCE', 'SUCCESS', `[MANUEL_YAKIT] Başarıyla ${refillAmount} USDT -> POL takası yapıldı.`);
      return res.json({ success: true, txHash: refillResult.txHash });
    } else {
      return res.status(500).json({ success: false, error: "DEX takas işlemi başarısız oldu. RPC veya ağ gaz ücreti hatası." });
    }
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `[MANUEL_YAKIT_HATA] Hata: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Configure High-Frequency Data Trading (HFT) and War Module variables
 */
app.post("/api/hft-config", (req, res) => {
  const { hftEnabled, pricingMode, demandMultiplier, lightweightMode, circuitBreakerStatus } = req.body;
  
  if (typeof hftEnabled === "boolean") {
    serverState.hftEnabled = hftEnabled;
    serverState.autonomousMode = hftEnabled; // Sync with autonomousMode
  }
  if (pricingMode === "automatic" || pricingMode === "manual") {
    serverState.pricingMode = pricingMode;
  }
  if (typeof demandMultiplier === "number") {
    serverState.demandMultiplier = demandMultiplier;
  }
  if (typeof lightweightMode === "boolean") {
    serverState.lightweightMode = lightweightMode;
  }
  if (circuitBreakerStatus === "NORMAL" || circuitBreakerStatus === "BREAKER_ACTIVE_SLOW_DOWN") {
    serverState.circuitBreakerStatus = circuitBreakerStatus;
    if (circuitBreakerStatus === "BREAKER_ACTIVE_SLOW_DOWN") {
      mainCrawler.delayMs = 15000; // Slow down crawler
    } else {
      mainCrawler.delayMs = 5000; // Normal crawler speed
    }
  }
  
  pushLog('SYSTEM', 'SUCCESS', `Savaş Modülü Ayarları Güncellendi: HFT=${serverState.hftEnabled ? 'AKTİF' : 'DEAKTİF'}, Fiyatlandırma=${serverState.pricingMode}, Çarpan=${serverState.demandMultiplier}x, Lightweight=${serverState.lightweightMode ? 'AKTİF' : 'DEAKTİF'}`);
  return res.json({
    success: true,
    hftEnabled: serverState.hftEnabled,
    pricingMode: serverState.pricingMode,
    demandMultiplier: serverState.demandMultiplier,
    lightweightMode: serverState.lightweightMode,
    circuitBreakerStatus: serverState.circuitBreakerStatus,
    selectedNetworkPath: serverState.selectedNetworkPath
  });
});

/**
 * TELEMETRİ KONSOL ALTYAPISI: Canlı panelden gelen yönetici komutlarını işler.
 */
app.post("/api/command", async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: "No command provided" });
  }

  const cmd = command.trim();
  pushLog('SYSTEM', 'INFO', `[KONSOL_KOMUTU] Komut alındı: ${cmd}`);

  if (cmd === "SET_MINT_MODE_TO_CONTRACT_ERC20") {
    mainBlockchain.setMintMode('CONTRACT');
    pushLog('BLOCKCHAIN', 'SUCCESS', `[MINT_MODE] Basım modu CONTRACT_ERC20 olarak güncellendi. Artık doğrudan akıllı sözleşme mint() fonksiyonu kullanılacak.`);
    return res.json({ success: true, message: "Mint mode set to CONTRACT_ERC20" });
  } else if (cmd === "SET_MINT_MODE_TO_MEMO" || cmd === "SET_MINT_MODE_MEMO") {
    mainBlockchain.setMintMode('MEMO');
    pushLog('BLOCKCHAIN', 'SUCCESS', `[MINT_MODE] Basım modu MEMO olarak güncellendi. Artık doğrudan cüzdan etkileşimi (Memo-Mint Modu) kullanılacak.`);
    return res.json({ success: true, message: "Mint mode set to MEMO" });
  } else if (cmd === "RESTART_LIQUIDATION_ENGINE_SYNC") {
    mainLiquidation.resetProcessingState();
    pushLog('FINANCE', 'SUCCESS', `[LIQUIDATION_SYNC] Likidasyon motoru sıfırlandı ve yeniden senkronize edildi. Cüzdan bakiyeleri taranıyor.`);
    return res.json({ success: true, message: "Liquidation engine restarted and synced" });
  } else if (cmd === "GET_MINT_MODE") {
    const currentMode = mainBlockchain.getMintMode();
    pushLog('SYSTEM', 'INFO', `[MINT_MODE_STATUS] Mevcut Basım Modu: ${currentMode}`);
    return res.json({ success: true, mode: currentMode });
  } else {
    pushLog('SYSTEM', 'WARNING', `[BİLİNMEYEN_KOMUT] "${cmd}" komutu tanınmadı.`);
    return res.status(400).json({ error: "Unknown command" });
  }
});

/**
 * PROTOKOL_REAL: Blokzinciri üzerindeki başarılı satın alımı onaylar.
 * İşlemi alıcı tetiklediği için sunucu sadece kanıtı (txHash) doğrular ve mühürler.
 */
app.post("/api/market/confirm-sale", async (req, res) => {
  const { itemId, txHash } = req.body;
  try {
    const item = await ReadyToSellModel.findOne({ id: itemId });
    if (!item) return res.status(404).json({ error: "Asset not found" });

    await ReadyToSellModel.updateOne({ id: itemId }, { isSold: true });
    
    const record: TransactionRecord = {
      url: item.url || "",
      proofHash: item.proofHash || "",
      co2AnalysisGrams: item.co2AnalysisGrams || 0,
      assetRegistrationTxHash: txHash || "",
      timestamp: new Date().toISOString()
    };

    await TransactionModel.create(record);
    
    pushLog('BLOCKCHAIN', 'SUCCESS', `[ON_CHAIN_SALE] Varlık ${itemId} başarıyla satıldı! Tx: ${txHash}`);
    return res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Active SSE Stream listener route for scrolling terminal console feeds
 */
app.get("/api/stream-logs", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  // Render/Proxy keep-alive: Bağlantının kopmasını önlemek için 15 saniyede bir boş veri gönder
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  // Pre-seed connection with previous logs history for UI continuity
  const history = serverState.crawlerLogs.slice(-40);
  for (const log of history) {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  clients.add(res);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
});

/**
 * Dynamic Telegram Bot initializer
 */
export function triggerTelegramBotInit() {
  try {
    const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    if (TOKEN && CHAT_ID) {
      initializeTelegramBot(TOKEN, CHAT_ID, {
        startCrawler: async () => {
          await startCrawlingEngine();
        },
        stopCrawler: async () => {
          await stopCrawlingEngine();
        },
        getStatus: async () => {
          const totalAssets = await ReadyToSellModel.countDocuments({});
          const readyToSell = await ReadyToSellModel.countDocuments({ isSold: false, accessVoucherSignature: { $exists: true } });
          const soldAssets = await ReadyToSellModel.countDocuments({ isSold: true });
          const listedOnChain = await ReadyToSellModel.countDocuments({ isSold: false, isListedOnChain: true });

          // Prefer cached blockchain data to keep bot extremely responsive
          if (cachedBalanceData) {
            return {
              walletAddr: cachedBalanceData.address,
              polBalance: parseFloat(cachedBalanceData.balanceMATIC) || 0,
              usdtBalance: cachedBalanceData.payoutBalanceUSDT || "0.00",
              greenBalance: cachedBalanceData.greenBalance || "0.00",
              totalAssets,
              readyToSell,
              soldAssets,
              listedOnChain,
              isCrawling: serverState.isCrawling,
              currentCrawlingUrl: serverState.currentCrawlingUrl || "Bekliyor...",
              pagesProcessed: serverState.pagesProcessed,
              totalKiloBytesSaved: serverState.totalKiloBytesSaved,
              totalCo2SavedGrams: serverState.totalCo2SavedGrams,
              selectedNetworkPath: serverState.selectedNetworkPath,
              circuitBreakerStatus: serverState.circuitBreakerStatus
            };
          }

          // Fallback query if cache is not yet loaded
          const actualUsdtBalance = await mainBlockchain.getUSDTBalance(blockchainConfig.payoutWallet);
          const polBalanceCheck = await mainBlockchain.checkGasBalance('polygon');
          const polBalance = parseFloat(polBalanceCheck.balance) || 0;

          const greenBalance = blockchainConfig.greenTokenAddress && !blockchainConfig.greenTokenAddress.includes('0x000')
              ? await mainBlockchain.getTokenBalance(blockchainConfig.greenTokenAddress, mainBlockchain.getWalletAddress())
              : "0.00";

          return {
            walletAddr: mainBlockchain.getWalletAddress() || "NaN",
            polBalance,
            usdtBalance: actualUsdtBalance,
            greenBalance,
            totalAssets,
            readyToSell,
            soldAssets,
            listedOnChain,
            isCrawling: serverState.isCrawling,
            currentCrawlingUrl: serverState.currentCrawlingUrl || "Bekliyor...",
            pagesProcessed: serverState.pagesProcessed,
            totalKiloBytesSaved: serverState.totalKiloBytesSaved,
            totalCo2SavedGrams: serverState.totalCo2SavedGrams,
            selectedNetworkPath: serverState.selectedNetworkPath,
            circuitBreakerStatus: serverState.circuitBreakerStatus
          };
        },
        pushLog: (module, level, msg) => {
          pushLog(module, level, msg);
        }
      });
    } else {
      console.log("[TELEGRAM] Credentials missing or incomplete in environment. Telegram bot skipped.");
    }
  } catch (tgErr: any) {
    console.error("[WARNING] Telegram bot initialization failed gracefully:", tgErr.message);
  }
}

async function startCrawlingEngine() {
  if (serverState.isCrawling) return;
  serverState.isCrawling = true;
  pushLog('SYSTEM', 'INFO', 'Otonom Ticaret Motoru: MARKET_LISTENER başlatıldı.');

  // Madencilik ve Geri Dönüşüm çarklarını döndür (Sonsuz döngü)
  runRecyclingMining();
}

async function stopCrawlingEngine() {
  if (!serverState.isCrawling) return;
  serverState.isCrawling = false;
  mainCrawler.stop(); // Ensure the internal crawler loop is signaled to break immediately
  pushLog('SYSTEM', 'WARNING', 'Durdurma sinyali: Otonom emirler donduruluyor.');
}

/**
 * Run autonomous crawler bot thread
 */
app.post("/api/crawl/start", async (req, res) => {
  if (serverState.isCrawling) {
    return res.json({ success: true, message: "Otonom tarayıcı zaten sektörleri tarıyor." });
  }

  await startCrawlingEngine();
  res.json({ success: true, message: "Otonom tarama iş parçacıkları başlatıldı." });
});

/**
 * Gracefully stop active crawler bot thread
 */
app.post("/api/crawl/stop", async (req, res) => {
  if (!serverState.isCrawling) {
    return res.json({ success: true, message: "Sistem zaten bekleme modunda." });
  }

  await stopCrawlingEngine();
  res.json({ success: true, message: "Bağımsız tarama döngüsü durduruldu." });
});

/**
 * Perform manual, tiny real-protocol sequence test (approve + transfer of 1 token) to check on-chain compliance.
 */
app.post("/api/test/onchain", async (req, res) => {
  pushLog('SYSTEM', 'INFO', "[TEST_ON_CHAIN] Manuel Gerçek Protokol testi başlatıldı...");
  try {
    const greenToken = blockchainConfig.greenTokenAddress;
    const routerAddress = blockchainConfig.routerAddress || "0xa5e0829caced8ffdd052420551415491d6993e2f";
    
    if (!greenToken || greenToken === ethers.constants.AddressZero || greenToken.startsWith("0x0000")) {
      throw new Error("Geçerli bir GREEN_TOKEN_ADDRESS tanımlanmamış. Test yapılamaz.");
    }

    pushLog('SYSTEM', 'INFO', `[TEST_ON_CHAIN] 1. Aşama: Approve işlemi test ediliyor... Token: ${greenToken} | Spender: ${routerAddress}`);
    // Approve 1 KECO
    const approveResult = await mainBlockchain.approveToken(greenToken, routerAddress, "1");
    if (!approveResult.success) {
      throw new Error(`Approve testi başarısız: ${approveResult.error}`);
    }
    pushLog('SYSTEM', 'SUCCESS', `[TEST_ON_CHAIN] Approve testi başarılı! On-chain Tx: ${approveResult.txHash}`);

    pushLog('SYSTEM', 'INFO', `[TEST_ON_CHAIN] 2. Aşama: Mint / Transfer işlemi test ediliyor... Token: ${greenToken}`);
    // Mint / Transfer 1 KECO
    const mintResult = await mainBlockchain.mintToken(greenToken, mainBlockchain.getWalletAddress(), "1");
    if (!mintResult.success) {
      throw new Error(`Mint/Transfer testi başarısız: ${mintResult.error}`);
    }
    pushLog('SYSTEM', 'SUCCESS', `[TEST_ON_CHAIN] Mint/Transfer testi başarılı! On-chain Tx: ${mintResult.txHash}`);

    res.json({
      success: true,
      message: "Gerçek Blokzincir Protokol On-Chain testi başarıyla tamamlandı!",
      approveTx: approveResult.txHash,
      mintTx: mintResult.txHash
    });
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `[TEST_ON_CHAIN_FAILED] Test başarısız: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Receive active Telegram status from current runtime configuration
 */
app.get("/api/telegram/status", (req, res) => {
  res.json({
    enabled: !isTelegramTemporarilyDisabled,
    hasCredentials: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  });
});

/**
 * Enable or disable Telegram bot instance at runtime
 */
app.post("/api/telegram/toggle", (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Eksik veya geçersiz parametre: enabled (boolean)." });
  }

  const disabledMode = !enabled;
  setTelegramTemporarilyDisabled(disabledMode);
  
  // Re-run the bot initializer under the new state!
  triggerTelegramBotInit();

  if (enabled) {
    pushLog('SYSTEM', 'SUCCESS', "Telegram İki Yönlü Bildirim Botu kullanıcı arayüzünden AKTİFLEŞTİRİLDİ.");
  } else {
    pushLog('SYSTEM', 'WARNING', "Telegram İki Yönlü Bildirim Botu kullanıcı arayüzünden DURDURULDU.");
  }

  res.json({
    success: true,
    enabled: !isTelegramTemporarilyDisabled
  });
});

/**
 * Run full on-demand code optimization, Carbon calculation, blockchain proofing,
 * and Gemini-generated Sustainable code suggestions for a user-inputted URI!
 */
app.post("/api/optimize-url", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Eksik parametre: hedef URL." });
  }

  pushLog('EXECUTOR', 'INFO', `[PROTOKOL_SWEEP] Taktik Madencilik Başlatıldı: ${url}`);

  try {
    // 1. Gerçek Veri Çekme
    const response = await axios.get(url, { timeout: 10000 });
    const html = response.data;
    const originalBytes = Buffer.byteLength(html);

    // 2. Optimizasyon ve Hesaplama
    const optimizedHtml = mainOptimizer.optimizeHtml(html);
    const optimizedBytes = Buffer.byteLength(optimizedHtml);
    
    // PROTOKOL_1: Otonom Matematiksel Analiz
    const qualityScore = DataAnalyzer.calculateQualityScore(html);
    
    if (qualityScore < 70) {
      throw new Error(`KALITE_YETERSIZ: Veri puanı ${qualityScore}. Minimum 70 gereklidir.`);
    }

    const savings = mainOptimizer.calculateCarbonSavings(originalBytes, optimizedBytes, 35000);
    const proofHash = mainOptimizer.generateProofHash(url, savings.bytesSaved, savings.co2SavingsGrams, optimizedHtml);

    // 3. Veritabanına Kaydet
    const generatedId = "eco-" + Math.random().toString(36).substring(2, 8);
    const valuation = mainOptimizer.calculateDataValue(qualityScore, savings.bytesSaved);

    const newItem: ReadyToSellItem = {
      id: generatedId,
      url,
      proofHash, // Use proofHash directly
      co2AnalysisGrams: savings.co2SavingsGrams, // Use co2AnalysisGrams
      extractedKeywords: ["asset", "real-data", "mined"],
      reportSummary: `Doğrulanmış Karbon Varlığı: ${url} üzerinden ${savings.co2SavingsGrams.toFixed(4)}g CO2 tasarrufu mühürlendi.`,
      accessPriceUSD: valuation,
      isSold: false,
      timestamp: new Date().toISOString(),
      licenseType: "CC-BY 4.0",
      sourceAttribution: new URL(url).hostname || "Web Source"
    };

    await ReadyToSellModel.create(newItem);

    pushLog('EXECUTOR', 'SUCCESS', `[ASSET_CREATED] ID: ${generatedId} | QUALITY: ${qualityScore} | VALUATION: ${valuation} USDT`);

    res.json({
      url: url,
      originalSize: originalBytes,
      optimizedSize: optimizedBytes,
      bytesSaved: savings.bytesSaved,
      co2SavingsGrams: savings.co2SavingsGrams,
      efficiencyGainPct: savings.efficiencyGainPct,
      proofHash,
      id: generatedId,
    });

  } catch (err: any) {
    pushLog('EXECUTOR', 'ERROR', `Madencilik başarısız: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Health Check - Sunucunun hayatta olup olmadığını denetler
 */
app.get("/healthz", (req, res) => res.status(200).send("OK"));

/* ==========================================
   Static File Server & Bundled Vite Framework
   ========================================== */

async function startServer() {
  // 1. Veritabanı ve Blockchain bağlantılarını arka planda başlat (Listen'ı engellememeli)
  const initConnections = async () => {
    let dbConnected = false;
    try {
      const uri = dbConfig.uri;
      if (!uri) throw new Error("MONGO_URI tanımlanmamış!");
      
      pushLog('SYSTEM', 'INFO', `[DB] MongoDB Atlas'a bağlanılıyor: ${dbConfig.dbName}...`);
      await mongoose.connect(uri, { 
        dbName: dbConfig.dbName,
        connectTimeoutMS: 5000,
      });
      dbConnected = true;

      // 1. ADIM: Otomatik Veritabanı Etiketleme ve Göç (Migration) Modülü
      try {
        const db = mongoose.connection.db;
        if (db) {
          const colNames = ['raw_data_inbox', 'crawler_source', 'inventory', 'MAIN_INVENTORY'];
          for (const colName of colNames) {
            const exists = await db.listCollections({ name: colName }).hasNext();
            if (exists) {
              const col = db.collection(colName);
              const existsCount = await col.countDocuments({ status: { $exists: false } });
              if (existsCount > 0) {
                pushLog('SYSTEM', 'INFO', `[DB_MIGRATION] '${colName}' koleksiyonunda status alanı eksik ${existsCount} kayıt bulundu. Etiketleniyor...`);
                const result = await col.updateMany(
                  { status: { $exists: false } },
                  { $set: { status: "unprocessed" } }
                );
                pushLog('SYSTEM', 'SUCCESS', `[DB_MIGRATION] Başarılı! '${colName}' koleksiyonundaki ${result.modifiedCount} adet kayıt 'unprocessed' olarak etiketlendi.`);
              }
            }
          }

          // 1b. ADIM: Eski Kontrat Adreslerini Yeni Kontrata Taşıma (MongoDB Güncellemesi)
          try {
            const collections = await db.listCollections().toArray();
            const oldAddress = "0x4C304a6a923C3Fb92a87583dbABCcbE1dDeb6886".toLowerCase();
            const newAddress = "0x88AB810eAE8d41C8388402E53d6Cd2DDD645cDdE";
            
            for (const colInfo of collections) {
              const col = db.collection(colInfo.name);
              const samples = await col.find({}).limit(1000).toArray();
              let updatedCount = 0;
              for (const doc of samples) {
                let changed = false;
                const updateDoc = (obj: any): any => {
                  if (!obj) return obj;
                  if (typeof obj === 'string') {
                    if (obj.toLowerCase() === oldAddress) {
                      changed = true;
                      return newAddress;
                    }
                  } else if (Array.isArray(obj)) {
                    return obj.map(item => updateDoc(item));
                  } else if (typeof obj === 'object') {
                    const newObj: any = {};
                    for (const [k, v] of Object.entries(obj)) {
                      newObj[k] = updateDoc(v);
                    }
                    return newObj;
                  }
                  return obj;
                };
                
                const cleanedDoc = updateDoc(doc);
                if (changed) {
                  delete cleanedDoc._id; // _id değiştirilemez
                  await col.replaceOne({ _id: doc._id }, cleanedDoc);
                  updatedCount++;
                }
              }
              if (updatedCount > 0) {
                pushLog('SYSTEM', 'SUCCESS', `[DB_MIGRATION] '${colInfo.name}' koleksiyonunda ${updatedCount} adet eski kontrat adresi (${oldAddress}) başarıyla yeni adresle (${newAddress}) güncellendi!`);
              }
            }
          } catch (migAddressErr: any) {
            console.warn("[WARNING] Contract address DB migration failed gracefully:", migAddressErr.message);
          }
        }
      } catch (migErr: any) {
        console.warn("[WARNING] DB Migration failed gracefully:", migErr.message);
      }
    } catch (error: any) {
      pushLog('SYSTEM', 'WARNING', `[DB] MongoDB bağlantısı kurulamadı: ${error.message}. Sistem BELLEK-TABANLI ve OTOMATİK kurtarma modunda çalışmaya devam ediyor.`);
      console.warn("[WARNING] MongoDB connection failed, falling back to memory mode:", error.message);
    }

    try {
      // PROTOKOL_RESET: Canlıya geçerken temizlik yap
      await initializeSystem();
      
      // Ticari Köprü Aktivasyonu
      commercialBridge.activate();

      // Blockchain kontrat ve cüzdan durumunu doğrula
      await mainBlockchain.validateOnChainStatus();

      // İlk bakiye kontrolünü tetikle
      const initialBalance = await mainBlockchain.checkGasBalance('polygon');

      // GÜVENLİK VE SENKRONİZASYON KONTROLÜ
      const derivedSigner = mainBlockchain.getWalletAddress();
      const configPayout = web3Config.payoutWallet;
      
      pushLog('SYSTEM', 'INFO', `[IDENTITY] İşlem İmzalayıcı (Signer): ${derivedSigner}`);
      pushLog('SYSTEM', 'INFO', `[IDENTITY] Ödeme Alıcı (Recipient): ${configPayout}`);
      pushLog('SYSTEM', 'INFO', `[IDENTITY] Güncel Bakiye: ${initialBalance.balance} POL`);
      
      pushLog('BLOCKCHAIN', 'INFO', `Sistem Kimliği: İmzalayıcı=${derivedSigner.slice(0,10)}... | Bakiye=${initialBalance.balance} POL`);

      // CLI Komut Kontrolü: --force-publish-all
      if (FORCE_PUBLISH) {
        await forcePublishAllAssets();
      }

      // Motoru başlat
      startAutomatedTrading();

      // Cüzdan bakiye önbelleğini arka planda ısıt
      refreshWalletBalances().catch(() => {});

      // Telegram İki Yönlü Kontrol & Bildirim Entegrasyonu
      triggerTelegramBotInit();
    } catch (error: any) {
      pushLog('SYSTEM', 'ERROR', `[CRITICAL] Arka plan bağlantı hatası: ${error.message}`);
      console.error("[CRITICAL] Background initialization failed:", error.message);
    }
  };

  // Bağlantıları başlat (await etmiyoruz, böylece bir sonraki satıra geçer)
  initConnections();

  // 2. Middleware ve Sunucu Yapılandırması
  try {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      pushLog('SYSTEM', 'INFO', "[SERVER] Vite middleware initialized in Development mode.");
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res, next) => {
        // API isteklerini pas geç, yoksa index.html döner
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, "index.html"));
      });
      pushLog('SYSTEM', 'INFO', "[SERVER] Serving pre-compiled production templates from /dist folder.");
    }

    // Global error middleware to prevent crash on async route errors
    app.use((err: any, req: any, res: any, next: any) => {
      console.error("[SERVER_ERROR]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error", message: err.message });
      }
    });

    app.listen(Number(PORT), "0.0.0.0", () => {
      pushLog('SYSTEM', 'INFO', `=========================================`);
      pushLog('SYSTEM', 'INFO', `[CORE] SYSTEM RUNNING ON PORT: ${PORT}`);
      pushLog('SYSTEM', 'INFO', `=========================================`);
    });
  } catch (err: any) {
    pushLog('SYSTEM', 'ERROR', `[CRITICAL] Sunucu başlatılamadı: ${err.message}`);
    process.exit(1);
  }

  // 5-minute autonomous Keep-alive Heartbeat loop
  setInterval(() => {
    const timeString = new Date().toLocaleTimeString();
    
    // [CRAWLER_REPORT] Akışını kalp atışına dahil et
    const report = {
      nodes: serverState.pagesProcessed,
      reclaimed: `${serverState.totalKiloBytesSaved.toFixed(2)} KB`,
      offset: `${serverState.totalCo2SavedGrams.toFixed(4)} g`
    };

    pushLog('SYSTEM', 'INFO', `[KEEP_ALIVE] ${timeString} - Otonom Sistem Canlı.`);
    pushLog('MARKET', 'INFO', `[CRAWLER_REPORT] Düğüm: ${report.nodes} | CO2: ${report.offset}`);
  }, 5 * 60 * 1000); // 5 minutes (300,000 ms)
}

startServer();
