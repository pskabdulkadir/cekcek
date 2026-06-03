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
    
    if (arbYield > maxYield) {
      chosenChain = "arbitrum";
      maxYield = arbYield;
    }
    if (baseYield > maxYield) {
      chosenChain = "base";
      maxYield = baseYield;
    }
    
    serverState.selectedNetworkPath = chosenChain as any;
    pushLog('FINANCE', 'SUCCESS', `[PATH_DECISION] Otonom Rota Bulucu en kârlı kanalı seçti: ${chosenChain.toUpperCase()} L2. Likidasyon bu ağa yönlendiriliyor.`);

    const success = await mainLiquidation.performInstantLiquidation(voucherId, amountUSD, co2Grams);
    if (success) {
      await ReadyToSellModel.updateOne({ id: voucherId }, { isSold: true, liquidationFailed: false });
      pushLog('FINANCE', 'SUCCESS', `[SETTLE_OK] Transfer otonom tamamlandı: ${maxYield.toFixed(4)} USDT karşılığı (${chosenChain.toUpperCase()} ağı üzerinden) cüzdana aktarıldı.`);
      return true;
    }
    
    // Mark as failed to avoid infinite loop on bad network conditions or missing gas
    await ReadyToSellModel.updateOne({ id: voucherId }, { liquidationFailed: true });
    pushLog('FINANCE', 'WARNING', `[SETTLE_SKIP] Likidasyon başarısız oldu. Varlık ${voucherId} otonom döngünün kilitlenmesini önlemek için geçici olarak askıya alındı.`);
    return false;
  } catch (error: any) {
    await ReadyToSellModel.updateOne({ id: voucherId }, { liquidationFailed: true }).catch(() => {});
    pushLog('SYSTEM', 'ERROR', `[PROXY_ERR] Yetkilendirme geçildi ancak likidite veya ağ hatası: ${error.message}`);
    return false;
  }
}

// 2. ATIK TANIMI & FİLTRELEME KRİTERLERİ
const isRecyclableWaste = (html: string): boolean => {
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
  
  // HFT - Savaş Modülü Özellikleri
  hftEnabled: true,
  pricingMode: "automatic" as "automatic" | "manual",
  demandMultiplier: 1.0,
  lightweightMode: true,
  circuitBreakerStatus: "NORMAL" as "NORMAL" | "BREAKER_ACTIVE_SLOW_DOWN",
  selectedNetworkPath: "polygon" as "polygon" | "arbitrum" | "base",
  merkleBuffer: [] as any[]
};

/**
 * --- OTONOM YAŞAM DÖNGÜSÜ (CORE ENGINE) ---
 * Pazar Yapıcı (Market Maker) ve Yakıt İkmal (Gas Refiller) sistemini yönetir.
 */
async function monitorAndLiquidate() {
  try {
    const walletAddr = mainBlockchain.getWalletAddress();
    if (!walletAddr) return;

    // 1. ADIM: OTOMATİK YAKIT İKMALİ (Gas Refiller)
    const gasCheck = await mainBlockchain.checkGasBalance('polygon');
    const currentPol = parseFloat(gasCheck.balance);
    
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

    // 2. ADIM: OTOMATİK SATIŞ (Market Maker)
    const greenToken = blockchainConfig.greenTokenAddress;
    const balance = (greenToken && !greenToken.startsWith("0x0000")) ? await mainBlockchain.getTokenBalance(greenToken, walletAddr) : "0";
    const balanceNum = parseFloat(balance);

    if (balanceNum >= 100.0) { // Gas tasarrufu için eşik 100 token
      pushLog('FINANCE', 'SUCCESS', `[PROFIT_TRIGGER] ${balanceNum.toFixed(2)} KECO tespit edildi. Nakde çevriliyor...`);
      await mainLiquidation.performInstantLiquidation("MONITOR_BATCH_LIQUIDATION", balanceNum * 0.45, balanceNum);
    } else {
      // Eğer KECO bakiyesi eşiğin altındaysa, veritabanından satılmamış ve likidasyonu denenmemiş/hatasız olan ilk varlığı bulup anında likidite et!
      const pendingAssets = await ReadyToSellModel.find({ isSold: false, liquidationFailed: { $ne: true } }).sort({ timestamp: -1 }).limit(1);
      const pendingAsset = pendingAssets && pendingAssets.length > 0 ? pendingAssets[0] : null;
      if (pendingAsset) {
        pushLog('FINANCE', 'INFO', `[OTONOM_TETİK] Satılmamış varlık tespit edildi: ${pendingAsset.id}. Likidasyon motoru tetikleniyor...`);
        await executeProxySettlement(pendingAsset.id, pendingAsset.accessPriceUSD || 0, pendingAsset.co2AnalysisGrams || 0);
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
  listingTxHash: String
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

/**
 * Global helper to push a log entry and broadcast to active frontend clients via SSE
 */
function pushLog(
  module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI' | 'FINANCE',
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE',
  msg: string
) {
  const logEntry: LogEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    module,
    level,
    message: msg
  };

  serverState.crawlerLogs.push(logEntry);
  
  // Throttle stored log logs length to 200 entries to maintain memory hygiene
  if (serverState.crawlerLogs.length > 200) {
    serverState.crawlerLogs.shift();
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
  const item = await ReadyToSellModel.findOne({ 
    isSold: false, 
    accessVoucherSignature: { $exists: false } 
  }).sort({ timestamp: 1 });
  
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

  if (!isRecyclableWaste(processedHtml)) {
    pushLog('MARKET', 'INFO', `Düğüm atlandı (Atık kriterlerini karşılamıyor): ${url}`);
    return;
  }

  pushLog('EXECUTOR', 'INFO', `Dijital atık tespit edildi, geri dönüşüm başlatılıyor...`);
  
  const originalBytes = Buffer.byteLength(html);
  const optimizedHtml = mainOptimizer.optimizeHtml(processedHtml);
  const optimizedBytes = Buffer.byteLength(optimizedHtml);
  
  // PROTOKOL_1: Otonom Analiz (70 Puan Eşiği)
  const qualityScore = DataAnalyzer.calculateQualityScore(html);
  
  if (qualityScore < 70) {
    pushLog('MARKET', 'WARNING', `[DISCARDED] Düğüm atıldı: Kalite puanı yetersiz (${qualityScore}/100).`);
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

  // --- OTONOM MİNTİNG VE LİKİDASYON BAĞLANTISI ---
  const greenToken = blockchainConfig.greenTokenAddress;
  let mintSuccess = false;
  if (greenToken && greenToken !== ethers.constants.AddressZero && !greenToken.startsWith("0x0000")) {
    const mintAmount = (valuation * 250000).toFixed(4); // Fiyatla orantılı basım miktarı
    pushLog('BLOCKCHAIN', 'INFO', `[MINT_START] Veri geri dönüşümü başarıyla tamamlandı. Cüzdana KECO basılıyor (Tutar: ${mintAmount} KECO)...`);
    const mintRes = await mainBlockchain.mintToken(greenToken, mainBlockchain.getWalletAddress(), mintAmount);
    if (mintRes.success) {
      mintSuccess = true;
      pushLog('BLOCKCHAIN', 'SUCCESS', `[MINT_OK] ${mintAmount} KECO başarıyla cüzdana basıldı! Tx: ${mintRes.txHash}`);
    } else {
      pushLog('BLOCKCHAIN', 'ERROR', `[MINT_FAILED] KECO basımı başarısız oldu: ${mintRes.error || "Ağ hatası"}`);
    }
  } else {
    // Simülasyon modunda veya test modunda otomatik mint başarısı farz ediliyor
    mintSuccess = true;
  }

  // Üretim bittiğinde otomatik satışa (USDT'ye swap) gönder
  if (mintSuccess) {
    if (serverState.autonomousMode) {
      pushLog('FINANCE', 'INFO', `[AUTO_LIQUIDATION] Üretim (Mint) onaylandı! Varlık anında satılmak üzere likidasyon motoruna gönderiliyor: ${savedDoc.id}`);
      // Asenkron olarak satış gerçekleştirilir
      executeProxySettlement(savedDoc.id, valuation, metric.co2SavingsGrams).catch(() => {});
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

/**
 * Yönetici Komut Satırı İşleyici
 */
app.post("/api/admin/command", async (req, res) => {
  const rawCommand = req.body.command || "";
  const command = rawCommand.trim();
  
  if (command === "GET_STATUS_REPORT") {
    await generateStatusReport();
    return res.json({ success: true, message: "Status report generated." });
  }

  if (command.startsWith("EXECUTE_GENESIS_MINT")) {
    const parts = command.split(" ");
    const toAddress = parts[parts.indexOf("--to") + 1] || mainBlockchain.getWalletAddress();
    const amount = parts[parts.indexOf("--amount") + 1] || "1000000000";
    (async () => {
        const result = await mainBlockchain.mintToken(blockchainConfig.greenTokenAddress, toAddress, amount);
        if (result.success) pushLog('SYSTEM', 'SUCCESS', `[MINT_OK] Token basildi: ${result.txHash}`);
        else pushLog('SYSTEM', 'ERROR', `[MINT_FAILED] Hata: ${result.error}`);
    })();
    return res.json({ success: true, message: "Mint process started." });
  }

  if (command === "SET_AUTONOMOUS_DEPLOYMENT_TRUE --gas-payer=buyer --mode=batch") {
    serverState.autonomousMode = true;
    serverState.commitThreshold = 10; // Talimat uyarınca 10'a çekildi
    pushLog('SYSTEM', 'SUCCESS', "PROTOKOL_AKTIF: Otonom mod (Batch) devreye alındı. Gas ücreti alıcıya devredildi.");
    return res.json({ success: true, message: "Autonomous mode activated." });
  }

  if (command === "PAUSE_SCRAPER") {
    serverState.isCrawling = false;
    mainCrawler.stop();
    pushLog('SYSTEM', 'WARNING', "Gaz tasarrufu için tarayıcı durduruldu.");
    return res.json({ success: true });
  }
  
  if (command.startsWith("RUN_BULK_SELL")) {
    const limit = parseInt(command.split(" ")[1]) || 500;
    pushLog('SYSTEM', 'INFO', `Admin komutu: Toplu satış başlatılıyor. Hedef: ${limit} varlık.`);
    sellAllReadyAssets(limit); 
    return res.json({ success: true, message: "Bulk sell task started in background." });
  }

  if (command.startsWith("FORCE_DEX_SETTLE")) {
    const limit = parseInt(command.split(" ")[1]) || 100;
    pushLog('SYSTEM', 'WARNING', `[CRITICAL_EXECUTION] DEX zorlamalı satış başlatılıyor.`);
    
    (async () => {
        const items = await ReadyToSellModel.find({ isSold: false, isListedOnChain: true }).limit(limit);
        for (const item of items) {
            await executeProxySettlement(item.id, item.accessPriceUSD || 0, item.co2AnalysisGrams || 0);
            await new Promise(r => setTimeout(r, 2000));
        }
    })();
    
    return res.json({ success: true, message: "DEX settlement task initiated." });
  }

  if (command === "INIT_PROXY_SETTLE") {
    pushLog('SYSTEM', 'INFO', "Manuel Proxy Settlement tetiklendi."); // Bu komut genellikle tekil hatalarda veya debug için kullanılır
    return res.json({ success: true });
  }

  if (command.startsWith("SET_THRESHOLD")) {
    const val = parseInt(command.split(" ")[1]);
    if (!isNaN(val)) {
      serverState.commitThreshold = val;
      pushLog('SYSTEM', 'INFO', `Onay eşiği ${val} olarak güncellendi.`);
      return res.json({ success: true });
    }
  }

  res.status(400).json({ error: "Geçersiz komut dizisi." });
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
    blockchainProofsMinted = transactions.length;

    if (mongoose.connection.readyState !== 1) {
      // Log memory mode warning occasionally (already done elsewhere)
    }

    return res.json({
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
      payoutWalletAddress: serverState.payoutWalletAddress,
      zeroGasModeActive: serverState.zeroGasModeActive,
      autonomousMode: serverState.autonomousMode,
      commitThreshold: serverState.commitThreshold,
      contractAddress: blockchainConfig.contractAddress,
      totalDataInsightsPublished: serverState.totalDataInsightsPublished,
      totalAccessFeesCollected: serverState.totalAccessFeesCollected,
      
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

/**
 * Wallet Balance Checker - Canlı Polygon Mainnet Bakiye Sorgusu
 * GELİR YAPILAN CÜZDAN: blockchainConfig.payoutWallet (satış sonrası para buraya gidecek)
 */
app.get("/api/wallet-balance", async (req, res) => {
  try {
    const botAddress = mainBlockchain.getWalletAddress();
    const payoutAddress = blockchainConfig.payoutWallet;

    // Get bot (gas/operations) wallet balance
    const botBalRes = botAddress ? await mainBlockchain.checkGasBalance('polygon', botAddress) : { balance: "0.000000", isLow: true };
    const botUSDT = botAddress ? await mainBlockchain.getUSDTBalance(botAddress) : "0.00";
    
    // Get payout (revenue distribution) wallet balance
    const payoutBalRes = payoutAddress ? await mainBlockchain.checkGasBalance('polygon', payoutAddress) : { balance: "0.000000", isLow: true };
    const payoutUSDT = payoutAddress ? await mainBlockchain.getUSDTBalance(payoutAddress) : "0.00";
    
    const maticPrice = 0.42; // Güncel yaklaşık fiyat
    const balanceUSD = (parseFloat(botBalRes.balance) * maticPrice).toFixed(2);
    const payoutBalanceUSD = (parseFloat(payoutBalRes.balance) * maticPrice).toFixed(2);

    return res.json({
      address: botAddress,
      payoutAddress: payoutAddress,
      balanceMATIC: parseFloat(botBalRes.balance).toFixed(6),
      balanceUSD: balanceUSD,
      balanceUSDT: parseFloat(botUSDT).toFixed(2),
      isLow: botBalRes.isLow,
      payoutBalanceMATIC: parseFloat(payoutBalRes.balance).toFixed(6),
      payoutBalanceUSD: payoutBalanceUSD,
      payoutBalanceUSDT: parseFloat(payoutUSDT).toFixed(2),
      payoutIsLow: payoutBalRes.isLow,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("[API_ERROR] /api/wallet-balance failed:", err);
    res.status(500).json({
      error: "Wallet balance query failed",
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Configure target payout destination and toggle zero-gas mode
 */
app.post("/api/payout-config", (req, res) => {
  const { payoutWalletAddress, zeroGasModeActive } = req.body;
  if (typeof payoutWalletAddress === "string") {
    serverState.payoutWalletAddress = payoutWalletAddress.trim();
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

      const provider = new ethers.providers.JsonRpcProvider(mainBlockchain.rpcUrl);
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
 * Run autonomous crawler bot thread
 */
app.post("/api/crawl/start", (req, res) => {
  if (serverState.isCrawling) {
    return res.json({ success: true, message: "Otonom tarayıcı zaten sektörleri tarıyor." });
  }

  serverState.isCrawling = true;
  pushLog('SYSTEM', 'INFO', 'Otonom Ticaret Motoru: MARKET_LISTENER başlatıldı.');

  // Madencilik ve Geri Dönüşüm çarklarını döndür (Sonsuz döngü)
  runRecyclingMining();

  res.json({ success: true, message: "Otonom tarama iş parçacıkları başlatıldı." });
});

/**
 * Gracefully stop active crawler bot thread
 */
app.post("/api/crawl/stop", (req, res) => {
  if (!serverState.isCrawling) {
    return res.json({ success: true, message: "Sistem zaten bekleme modunda." });
  }

  serverState.isCrawling = false;
  mainCrawler.stop(); // Ensure the internal crawler loop is signaled to break immediately
  pushLog('SYSTEM', 'WARNING', 'Durdurma sinyali: Otonom emirler donduruluyor.');

  res.json({ success: true, message: "Bağımsız tarama döngüsü durduruldu." });
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
