/**
 * @file liquidationEngine.ts
 * @description Autonomous Trading & High-Frequency Liquidation Engine with automated recovery Watchdog.
 */

import { ethers } from 'ethers';
import { blockchainConfig } from './config.ts';
import { BlockchainRouter } from './blockchain.ts';

export class LiquidationEngine {
  private blockchain: BlockchainRouter;
  private logCallback?: (module: 'SYSTEM' | 'MARKET' | 'EXECUTOR' | 'BLOCKCHAIN' | 'AI' | 'FINANCE', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;
  private isProcessing: boolean = false;

  constructor(blockchain: BlockchainRouter) {
    this.blockchain = blockchain;
  }

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  private emitLog(level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    if (this.logCallback) {
      this.logCallback('FINANCE', level, msg);
    }
  }

  /**
   * Otonom Ticaret Mimarisi (High-Frequency Liquidation)
   * Varlık değerini kontrol edip QuickSwap Router üzerinden anında swap (POL -> USDT veya GREEN -> USDT) emri verir.
   */
  public async performInstantLiquidation(assetId: string, valuationUSD: number = 0, co2Grams: number = 0, balanceType: string = 'token'): Promise<boolean> {
    if (balanceType === 'NATIVE_POL') {
      this.emitLog('WARNING', `[SAFETY_GUARD] NATIVE_POL likidasyonu engellendi! Cüzdan gas ücreti korunuyor.`);
      return false;
    }

    if (this.isProcessing) {
      this.emitLog('WARNING', `[WATCHDOG] Başka bir likidasyon işlemi devam ediyor. Varlık sıraya alındı: ${assetId}`);
      return false;
    }

    this.isProcessing = true;
    this.emitLog('INFO', `[LIQUIDATION_START] Otonom Likidasyon Başlatıldı. Varlık ID: ${assetId} | Değer: $${valuationUSD.toFixed(4)} USDT`);

    try {
      // --- GAS_THROTTLE: AĞ YOĞUNLUĞU KONTROLÜ (Limit Artırımı: 400 Gwei) ---
      const provider = new ethers.providers.JsonRpcProvider(this.blockchain.rpcUrl);
      const feeData = await provider.getFeeData();
      const currentGasPriceGwei = feeData.gasPrice ? parseFloat(ethers.utils.formatUnits(feeData.gasPrice, 'gwei')) : 0;
      const GAS_THROTTLE_LIMIT = parseFloat(blockchainConfig.gasPriceLimit) / 1e9; // config.ts'den 400 Gwei çekilir

      if (currentGasPriceGwei > GAS_THROTTLE_LIMIT) {
        this.emitLog('WARNING', `[GAS_THROTTLE] Ağ yoğunluğu çok yüksek (Mevcut Gas: ${currentGasPriceGwei.toFixed(2)} Gwei > Limit: ${GAS_THROTTLE_LIMIT} Gwei). Likidasyon ertelendi.`);
        this.isProcessing = false;
        return false;
      }

      // 1. Cüzdan Bilgilerini Al
      const walletAddress = this.blockchain.getWalletAddress();
      if (!walletAddress) {
        throw new Error("Geçerli bir cüzdan adresi bulunamadı. Lütfen .env dosyasındaki PRIVATE_KEY alanını kontrol edin.");
      }

      // 2. KECO (Green Token) Bakiyesi Kontrolü
      const greenTokenAddr = blockchainConfig.greenTokenAddress;
      let tokenAmountWei = "0";

      if (greenTokenAddr && greenTokenAddr !== ethers.constants.AddressZero && !greenTokenAddr.startsWith("0x0000")) {
        const balance = await this.blockchain.getTokenBalance(greenTokenAddr, walletAddress);
        const balanceNum = parseFloat(balance);
        if (balanceNum > 0.01) {
          tokenAmountWei = ethers.utils.parseUnits(balanceNum.toFixed(18), 18).toString();
          this.emitLog('INFO', `[WATCHDOG] Cüzdanda ${balanceNum.toFixed(4)} KECO/GREEN token tespit edildi. QuickSwap üzerinden USDT ye dönüştürülüyor...`);
        }
      }

      // 3. KECO bulunamazsa POL -> USDT otonom rotasını devredışı bırakıyoruz (Cüzdan gazı korunması ve komisyon dairesel döngü kaybını önlemek için)
      if (tokenAmountWei === "0" || parseFloat(tokenAmountWei) === 0) {
        this.emitLog('INFO', `[LIQUIDITY_CHECK] Cüzdanda GREEN/KECO yeşil token bulunamadı. Otonom likidasyon için üretim bekleniyor, cüzdan POL gaz bakiyesi korunuyor.`);
        this.emitLog('WARNING', `[LIQUIDITY_EMPTY] Likidasyon için KECO/GREEN bakiyesi yetersiz (0.00). Mint işlemleri kontrol edilmeli.`);
        this.isProcessing = false;
        return false;
      }

      // 4. KECO -> USDT Borsa Swap Islemi
      const result = await this.blockchain.performDEXSwap(tokenAmountWei);
      if (result.success) {
        this.emitLog('SUCCESS', `[OTONOM_KAZANÇ] İlgili veri varlığı başarıyla likidite havuzunda swap edildi. USDT cüzdanına ($${valuationUSD.toFixed(3)}) aktarıldı. Tx: ${result.txHash}`);
        this.isProcessing = false;
        return true;
      } else {
        throw new Error(result.error || "QuickSwap swap işlemi havuz hatası verdi.");
      }

    } catch (error: any) {
      this.emitLog('ERROR', `[WATCHDOG] Likidasyon hatası! Gözlemci (Bekçi) devrede, kuyruk temizleniyor ve 15 saniye içinde yeniden denenecek. Detay: ${error.message}`);
      this.isProcessing = false;
      return false;
    }
  }
}
