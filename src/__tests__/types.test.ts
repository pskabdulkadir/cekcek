import { describe, it, expect } from 'vitest';
import { CoreStats, OptimizationResult, ReadyToSellItem, TransactionRecord } from '../types';

/**
 * Type definition validation tests
 * Ensures that frontend types match backend API responses
 */

describe('Frontend Type Definitions', () => {
  describe('OptimizationResult', () => {
    it('should have required fields for API response', () => {
      const result: OptimizationResult = {
        url: 'https://example.com',
        originalSize: 5000,
        optimizedSize: 2500,
        bytesSaved: 2500,
        co2AnalysisGrams: 87.5, // Matches backend: co2SavingsGrams
        efficiencyGainPct: 50,
        proofHash: '0xabc123...',
        optimizedCode: '<div>optimized</div>',
        originalCode: '<div>original</div>',
        txHash: '0x123...',
        simulated: false
      };

      expect(result).toBeDefined();
      expect(result.co2AnalysisGrams).toBeGreaterThan(0);
      expect(result.bytesSaved).toBeLessThan(result.originalSize);
    });

    it('should have optional AI report field', () => {
      const result: OptimizationResult = {
        url: 'https://example.com',
        originalSize: 5000,
        optimizedSize: 2500,
        bytesSaved: 2500,
        co2AnalysisGrams: 87.5,
        efficiencyGainPct: 50,
        proofHash: '0xabc123...',
        optimizedCode: '<div>optimized</div>',
        originalCode: '<div>original</div>',
        txHash: '0x123...',
        simulated: false,
        aiReport: 'This is an AI-generated report'
      };

      expect(result.aiReport).toBeDefined();
    });
  });

  describe('ReadyToSellItem', () => {
    it('should have all required fields', () => {
      const item: ReadyToSellItem = {
        id: 'eco-123456',
        url: 'https://example.com',
        proofHash: '0xabc123...',
        co2AnalysisGrams: 87.5, // Use new field name
        extractedKeywords: ['data', 'web', 'optimization'],
        reportSummary: 'Data asset report',
        accessPriceUSD: 10.5, // Use new field name
        isSold: false,
        timestamp: new Date().toISOString(),
        licenseType: 'CC-BY 4.0',
        sourceAttribution: 'Wikipedia'
      };

      expect(item).toBeDefined();
      expect(item.id).toMatch(/^eco-/);
      expect(item.accessPriceUSD).toBeGreaterThan(0);
    });

    it('should have optional blockchain fields', () => {
      const item: ReadyToSellItem = {
        id: 'eco-123456',
        url: 'https://example.com',
        proofHash: '0xabc123...',
        co2AnalysisGrams: 87.5,
        extractedKeywords: [],
        reportSummary: 'Summary',
        accessPriceUSD: 10.5,
        isSold: false,
        timestamp: new Date().toISOString(),
        licenseType: 'CC-BY 4.0',
        sourceAttribution: 'Web',
        accessVoucherSignature: '0x...',
        publisherAddress: '0x...',
        accessPriceWei: '1000000000000000000',
        isMintedOnChain: true,
        mintAmountKECO: '100'
      };

      expect(item.isMintedOnChain).toBe(true);
      expect(item.mintAmountKECO).toBeDefined();
    });
  });

  describe('TransactionRecord', () => {
    it('should have required transaction fields', () => {
      const tx: TransactionRecord = {
        url: 'https://example.com',
        proofHash: '0xabc123...',
        co2AnalysisGrams: 87.5,
        assetRegistrationTxHash: '0x123...',
        timestamp: new Date().toISOString()
      };

      expect(tx).toBeDefined();
      expect(tx.assetRegistrationTxHash).toMatch(/^0x/);
    });

    it('should support simulated transactions', () => {
      const tx: TransactionRecord = {
        url: 'https://example.com',
        proofHash: '0xabc123...',
        co2AnalysisGrams: 87.5,
        assetRegistrationTxHash: '0x123...',
        timestamp: new Date().toISOString(),
        simulated: true
      };

      expect(tx.simulated).toBe(true);
    });
  });

  describe('CoreStats', () => {
    it('should have all required stat fields', () => {
      const stats: CoreStats = {
        pagesProcessed: 100,
        originalSizeTotal: 500000,
        optimizedSizeTotal: 250000,
        totalKiloBytesSaved: 244.14,
        totalCo2SavedGrams: 8544.9,
        dataAssetRegistrations: 50,
        visitedUrls: ['https://example.com'],
        totalServiceFeesCollected: 525,
        transactions: [],
        isCrawling: true,
        currentCrawlingUrl: 'https://example.com',
        readyToSell: [],
        payoutWalletAddress: '0x06E83497F599D67447EfFfeA399cC885CEB6eEff',
        autonomousMode: true,
        commitThreshold: 10,
        contractAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        totalDataInsightsPublished: 50,
        totalAccessFeesCollected: 525
      };

      expect(stats).toBeDefined();
      expect(stats.isCrawling).toBeDefined();
      expect(stats.totalCo2SavedGrams).toBeGreaterThanOrEqual(0);
    });

    it('should have optional profit-lock fields', () => {
      const stats: CoreStats = {
        pagesProcessed: 100,
        originalSizeTotal: 500000,
        optimizedSizeTotal: 250000,
        totalKiloBytesSaved: 244.14,
        totalCo2SavedGrams: 8544.9,
        dataAssetRegistrations: 50,
        visitedUrls: [],
        totalServiceFeesCollected: 525,
        transactions: [],
        isCrawling: false,
        currentCrawlingUrl: '',
        readyToSell: [],
        payoutWalletAddress: '0x...',
        autonomousMode: true,
        commitThreshold: 10,
        contractAddress: '0x...',
        totalDataInsightsPublished: 50,
        totalAccessFeesCollected: 525,
        profitLockActive: true,
        profitLockHoldAmount: 100,
        profitLockThreshold: 500
      };

      expect(stats.profitLockActive).toBe(true);
    });
  });

  describe('Type Compatibility', () => {
    it('should use co2AnalysisGrams consistently', () => {
      // Ensure all types use the same CO2 field name
      const result: OptimizationResult = {
        url: '',
        originalSize: 1000,
        optimizedSize: 500,
        bytesSaved: 500,
        co2AnalysisGrams: 17.5,
        efficiencyGainPct: 50,
        proofHash: '0x...',
        optimizedCode: '',
        originalCode: '',
        txHash: '0x...',
        simulated: false
      };

      const item: ReadyToSellItem = {
        id: 'eco-123',
        url: '',
        proofHash: '0x...',
        co2AnalysisGrams: 17.5,
        extractedKeywords: [],
        reportSummary: '',
        accessPriceUSD: 1,
        isSold: false,
        timestamp: new Date().toISOString(),
        licenseType: '',
        sourceAttribution: ''
      };

      expect(result.co2AnalysisGrams).toBe(item.co2AnalysisGrams);
    });

    it('should use accessPriceUSD consistently', () => {
      const item: ReadyToSellItem = {
        id: 'eco-123',
        url: '',
        proofHash: '0x...',
        co2AnalysisGrams: 10,
        extractedKeywords: [],
        reportSummary: '',
        accessPriceUSD: 25.5, // Updated field name
        isSold: false,
        timestamp: new Date().toISOString(),
        licenseType: '',
        sourceAttribution: ''
      };

      expect(item.accessPriceUSD).toBe(25.5);
    });
  });
});
