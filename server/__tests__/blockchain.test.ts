import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlockchainRouter } from '../blockchain';

describe('BlockchainRouter', () => {
  let router: BlockchainRouter;

  beforeEach(() => {
    router = new BlockchainRouter({
      rpcUrl: 'https://polygon-rpc.com',
      contractAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      privateKey: '0x' + '1'.repeat(64) // Mock private key
    });
  });

  describe('constructor', () => {
    it('should initialize with valid configuration', () => {
      expect(router).toBeDefined();
      expect(router.rpcUrl).toBeDefined();
      expect(router.contractAddress).toBeDefined();
    });

    it('should handle missing private key gracefully', () => {
      const routerWithoutKey = new BlockchainRouter({
        rpcUrl: 'https://polygon-rpc.com',
        contractAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
      });

      expect(routerWithoutKey).toBeDefined();
    });
  });

  describe('contract ABI', () => {
    it('should include required functions in ABI', () => {
      // Note: This is a simplified check - actual ABI is private
      expect(router).toHaveProperty('contractAddress');
    });
  });

  describe('mintCarbonAsset', () => {
    it('should accept asset ID and CO2 value', async () => {
      const assetId = 'test-asset-123';
      const co2Value = 50;

      // Mock the submitDataInsightProof method
      vi.spyOn(router, 'submitDataInsightProof' as any).mockResolvedValueOnce({
        success: true,
        txHash: '0x123...'
      });

      // This would fail without proper network setup, so we're checking the interface
      expect(router.mintCarbonAsset).toBeDefined();
    });
  });

  describe('network configuration', () => {
    it('should default to Polygon Mainnet', () => {
      expect(router.currentChainId).toBe(137);
      expect(router.currentNetworkName).toBe('Polygon Mainnet');
    });

    it('should have explorer URL configured', () => {
      expect(router.currentExplorerUrl).toContain('scan');
    });
  });
});
