/**
 * @file types.ts
 * @description Joint domain data models, structures, and schemas shared between
 * backend automation systems and the cyber-terminal frontend dashboard.
 * 
 * @author Senior Software Architect
 * @license SPDX-License-Identifier: Apache-2.0
 */

export interface TransactionRecord {
  url: string; // Veri kaynağı URL'si
  proofHash: string; // Analiz raporunun kriptografik kanıtı
  co2AnalysisGrams: number; // CO2 analiz değeri (was co2SavingsGrams)
  assetRegistrationTxHash: string; // Varlık kaydının işlem hash'i
  timestamp: string;
  simulated?: boolean;
}

export interface ReadyToSellItem {
  id: string;
  url: string;
  proofHash: string;
  co2AnalysisGrams: number; // co2SavingsGrams yerine co2AnalysisGrams
  extractedKeywords: string[];
  reportSummary: string;
  accessPriceUSD: number; // marketPriceUSD yerine accessPriceUSD
  isSold: boolean;
  timestamp: string;
  licenseType: string; // Örn: "CC-BY 4.0", "Public Domain"
  sourceAttribution: string; // Orijinal veri portalı adı
  accessVoucherSignature?: string; // Veri erişim voucheri imzası
  publisherAddress?: string; // Varlığı yayınlayan cüzdan adresi
  accessPriceWei?: string; // Kontrat için hassas erişim ücreti verisi (BigNumber string olarak)
  isMintedOnChain?: boolean; // Zincir üstünde KECO basılıp basılmadığı
  mintAmountKECO?: string; // Basılan veya basılacak KECO miktarı
}

export interface SalesLedgerEntry {
  assetId: string;
  amountUsdt: number;
  status: 'PENDING_PAYMENT' | 'PAID' | 'EXPIRED';
  ticker: string;
  timestamp: string;
}

export interface CoreStats {
  pagesProcessed: number;
  originalSizeTotal: number;
  optimizedSizeTotal: number;
  totalKiloBytesSaved: number;
  totalCo2SavedGrams: number;
  dataAssetRegistrations: number; // blockchainProofsMinted yerine dataAssetRegistrations
  visitedUrls: string[];
  totalServiceFeesCollected: number; // totalEarnings yerine
  transactions: TransactionRecord[];
  isCrawling: boolean;
  currentCrawlingUrl: string;
  readyToSell: ReadyToSellItem[];
  payoutWalletAddress: string;
  autonomousMode: boolean;
  commitThreshold: number;
  contractAddress: string;
  totalDataInsightsPublished: number; // totalGreenCredits yerine totalDataInsightsPublished
  totalAccessFeesCollected: number; // totalRealizedCash yerine totalAccessFeesCollected
  // zeroGasModeActive: boolean; // Artık kullanılmıyor
  
  // Profit-Lock (Kar Kilitleme) Özellikleri
  profitLockActive?: boolean;
  profitLockHoldAmount?: number;
  profitLockThreshold?: number;
  availableBalance?: number;
  
  // Toplu Mutabakat (Batch-Only) Modu Özellikleri
  batchOnlyMode?: boolean;
  batchOnlyThreshold?: number;
  
  // HFT - Savaş Modülü Alanları
  hftEnabled?: boolean;
  pricingMode?: "automatic" | "manual";
  demandMultiplier?: number;
  lightweightMode?: boolean;
  circuitBreakerStatus?: "NORMAL" | "BREAKER_ACTIVE_SLOW_DOWN";
  selectedNetworkPath?: "polygon" | "arbitrum" | "base";
  merkleBufferCount?: number;
  healer?: { isRunning: boolean; status: string; healedCount: number };
}

export interface OptimizationResult {
  url: string;
  originalSize: number;
  optimizedSize: number;
  bytesSaved: number;
  co2AnalysisGrams: number; // CO2 analiz değeri (was co2SavingsGrams)
  efficiencyGainPct: number;
  proofHash: string;
  optimizedCode: string;
  originalCode: string;
  txHash: string;
  simulated: boolean;
  aiReport?: string; // Optional Gemini-powered semantic review
}

export interface LogEntry {
  id: string;
  timestamp: string;
  module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI' | 'FINANCE';
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE';
  message: string;
}
