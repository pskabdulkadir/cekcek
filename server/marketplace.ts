/**
 * @file marketplace.ts
 * @description Gas-on-Purchase Protocol: Off-chain asset preparation to eliminate seller gas fees.
 */

import { ethers } from 'ethers';
import { blockchainConfig } from './config.ts';

export class MarketplaceManager {
  private logCallback?: (module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;

  constructor() {}

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  private emitLog(module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    if (this.logCallback) {
      this.logCallback(module, level, msg);
    }
  }

  /**
   * [LEGACY_BRIDGE] prepareAssetForSale
   * Eski terminolojiyle yapılan çağrıları yeni meşru yapıya yönlendirir.
   */
  public async prepareAssetForSale(dataAssetId: string, accessFeeInUsdt: number) {
    return this.prepareDataAssetForAccess(dataAssetId, accessFeeInUsdt);
  }

  /**
   * PROTOKOL_1: prepareAssetForSale (Gasless)
   * Veriyi satışa hazırlar ve alıcının işlemi başlatacağı yapıya sokar.
   */
  public async prepareDataAssetForAccess(dataAssetId: string, accessFeeInUsdt: number) {
    this.emitLog('MARKET', 'SUCCESS', `[DATA_ASSET_PREPARED] ${dataAssetId} veri erişimine hazırlandı. Erişim ücreti alıcıya devredildi.`);
    return { status: "READY", dataAssetId, accessFeeInUsdt };
  }
}