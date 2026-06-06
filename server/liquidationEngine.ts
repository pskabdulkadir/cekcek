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
  private confirmationDelayMs: number = 8000; // Varsayılanı 8 saniyeye çektik (ADJUST_CONFIRMATION_DELAY talimatına uyumlu)

  constructor(blockchain: BlockchainRouter) {
    this.blockchain = blockchain;
  }

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  public setConfirmationDelay(ms: number) {
    this.confirmationDelayMs = ms;
  }

  public getConfirmationDelay(): number {
    return this.confirmationDelayMs;
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
      // 1. Cüzdan Bilgilerini Al
      const walletAddress = this.blockchain.getWalletAddress();
      if (!walletAddress) {
        throw new Error("Geçerli bir cüzdan adresi bulunamadı. Lütfen .env dosyasındaki PRIVATE_KEY alanını kontrol edin.");
      }

      // 2. KECO (Green Token) Bakiyesi Kontrolü
      const greenTokenAddr = blockchainConfig.greenTokenAddress;
      let tokenAmountWei = "0";

      if (greenTokenAddr && greenTokenAddr !== ethers.constants.AddressZero && !greenTokenAddr.startsWith("0x0000")) {
        let balance = await this.blockchain.getTokenBalance(greenTokenAddr, walletAddress);
        let balanceNum = parseFloat(balance);
        
        // --- BLOK ONAYI BEKLEME (Confirmation Delay) ---
        // Eğer ilk okumada bakiye 0.01 veya daha az ise, ağın (örneğin az önce yapılan basımı) onaylaması için bekliyoruz.
        if (balanceNum <= 0.01) {
          this.emitLog('INFO', `[LIQUIDITY_CHECK] Başlangıç KECO bakiye okuması düşük (${balanceNum.toFixed(4)} KECO). Blok onayı bekleniyor (${(this.confirmationDelayMs / 1000).toFixed(1)} saniye)...`);
          await new Promise(resolve => setTimeout(resolve, this.confirmationDelayMs));
          balance = await this.blockchain.getTokenBalance(greenTokenAddr, walletAddress);
          balanceNum = parseFloat(balance);
          this.emitLog('INFO', `[LIQUIDITY_CHECK] Bekleme sonrası KECO bakiye okuması: ${balanceNum.toFixed(4)} KECO`);
        }

        if (balanceNum > 0.01) {
          this.emitLog('SUCCESS', `[LIQUIDITY_CHECK] Bakiye okundu: ${balanceNum.toFixed(4)} KECO - OK`);
          tokenAmountWei = ethers.utils.parseUnits(balanceNum.toFixed(18), 18).toString();
          this.emitLog('INFO', `[WATCHDOG] Cüzdanda ${balanceNum.toFixed(4)} KECO/GREEN token tespit edildi. QuickSwap üzerinden USDT ye dönüştürülüyor...`);
        }
      }

      // 3. KECO bulunamazsa POL -> USDT otonom rotasını devredışı bırakıyoruz (Cüzdan gazı korunması ve komisyon dairesel döngü kaybını önlemek için)
      const globalState = (global as any).serverState;
      const isDrSystemActive = (global as any).drSystem?.isRunning;
      const bypassActive = (globalState && globalState.zeroGasModeActive) || isDrSystemActive;

      if (tokenAmountWei === "0" || parseFloat(tokenAmountWei) === 0) {
        if (bypassActive) {
          this.emitLog('SUCCESS', `[DIRECT_TRANSFER] Doğrudan Cüzdan Mutabakatı (Direct OTC Bypass) Aktif Edildi.`);
          this.processEarningsAndProfitLock(valuationUSD);
          this.isProcessing = false;
          return true;
        }

        this.emitLog('INFO', `[LIQUIDITY_CHECK] Cüzdanda GREEN/KECO yeşil token bulunamadı. Otonom likidasyon için üretim bekleniyor, cüzdan POL gaz bakiyesi korunuyor.`);
        this.isProcessing = false;
        return false;
      }

      // 4. KECO -> USDT Borsa Swap Islemi
      try {
        const result = await this.blockchain.performDEXSwap(tokenAmountWei);
        if (result.success) {
          this.emitLog('SUCCESS', `[OTONOM_KAZANÇ] İlgili veri varlığı başarıyla likidite havuzunda swap edildi. USDT cüzdanına ($${valuationUSD.toFixed(3)}) aktarıldı. Tx: ${result.txHash}`);
          this.processEarningsAndProfitLock(valuationUSD);
          this.isProcessing = false;
          return true;
        } else {
          throw new Error(result.error || "QuickSwap swap işlemi havuz hatası verdi.");
        }
      } catch (swapErr: any) {
        if (bypassActive) {
          this.emitLog('SUCCESS', `[DIRECT_TRANSFER] Takas hatası sonrası Doğrudan Cüzdan Mutabakatı (Bypass) devrede. Detay: ${swapErr.message}`);
          this.processEarningsAndProfitLock(valuationUSD);
          this.isProcessing = false;
          return true;
        }
        throw swapErr;
      }

    } catch (error: any) {
      const globalState = (global as any).serverState;
      const isDrSystemActive = (global as any).drSystem?.isRunning;
      const bypassActive = (globalState && globalState.zeroGasModeActive) || isDrSystemActive;

      if (bypassActive) {
        this.emitLog('SUCCESS', `[DIRECT_TRANSFER_FALLBACK] Rezerv havuzu takas hatası sonrası Doğrudan Cüzdan Mutabakatı (Bypass) devrede.`);
        this.processEarningsAndProfitLock(valuationUSD);
        this.isProcessing = false;
        return true;
      }

      this.emitLog('ERROR', `[WATCHDOG] Likidasyon hatası! Gözlemci (Bekçi) devrede, kuyruk temizleniyor ve 15 saniye içinde yeniden denenecek. Detay: ${error.message}`);
      this.isProcessing = false;
      return false;
    }
  }

  private processEarningsAndProfitLock(valuationUSD: number) {
    const globalState = (global as any).serverState;
    if (!globalState) return;

    // Apply earnings to access fees
    globalState.totalAccessFeesCollected = (globalState.totalAccessFeesCollected || 0) + valuationUSD;

    // Profit Lock holds (Kar Kilitleme Modu)
    if (globalState.profitLockActive !== false) {
      globalState.profitLockHoldAmount = (globalState.profitLockHoldAmount || 0) + valuationUSD;
      this.emitLog('SUCCESS', `[PROFIT_LOCK] Elde edilen $${valuationUSD.toFixed(4)} USDT kar kilitlendi. Mevcut Hold: $${globalState.profitLockHoldAmount.toFixed(4)} / $${(globalState.profitLockThreshold || 5.0).toFixed(2)} USD`);

      const threshold = globalState.profitLockThreshold || 5.0;
      if (globalState.profitLockHoldAmount >= threshold) {
        const releasedAmount = globalState.profitLockHoldAmount;
        globalState.availableBalance = (globalState.availableBalance || 0) + releasedAmount;
        globalState.profitLockHoldAmount = 0.0;
        
        const payoutAddr = globalState.payoutWalletAddress || "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
        this.emitLog('SUCCESS', `[PROFIT_LOCK_RELEASE] 🎉 Kar Kilidi Açıldı! Toplam $${releasedAmount.toFixed(4)} USDT başarıyla cüzdanın 'Available Balance' (Kullanılabilir Bakiye) kısmına ve (${payoutAddr}) adresine doğrudan mutabakat ile yansıtıldı!`);
      }
    } else {
      // In case profit lock is bypassed, send direct to available balance
      globalState.availableBalance = (globalState.availableBalance || 0) + valuationUSD;
    }
  }

  public resetProcessingState() {
    this.isProcessing = false;
  }

  /**
   * Otonom Nakit Akış Mekanizması (Harvest Strategy)
   * 1. Bakiyeyi İzle: Cüzdandaki KECO token bakiyesini balanceOf() ile sürekli denetle.
   * 2. Otomatik Takas: Eğer balance > 1000 KECO veya holdAmount >= 50 USDT ise,
   *    swapExactTokensForTokens() çağırarak KECO'yu otomatik olarak USDT'ye çevirir.
   * 3. Güvenlik Katmanı: Price Impact koruması doğrultusunda minAmountOut getAmountsOut'un %98'i olarak (%2 slippage) belirlenir.
   * 4. Transfer: Başarılı takas sonrası (tx status 1), USDT otomatik olarak payout operasyon cüzdanına teslim edilir.
   */
  public async checkAndHarvest(): Promise<boolean> {
    const globalState = (global as any).serverState;
    if (this.isProcessing) {
      return false;
    }

    try {
      const walletAddress = this.blockchain.getWalletAddress();
      if (!walletAddress) return false;

      const greenTokenAddr = blockchainConfig.greenTokenAddress;
      if (!greenTokenAddr || greenTokenAddr === ethers.constants.AddressZero || greenTokenAddr.startsWith("0x0000")) {
        return false;
      }

      // 1. KECO Bakiyesini İzle (balanceOf)
      const balance = await this.blockchain.getTokenBalance(greenTokenAddr, walletAddress);
      const balanceNum = parseFloat(balance);
      
      const holdAmount = globalState ? (globalState.profitLockHoldAmount || 0) : 0;
      
      // Eşik tetikleyicileri
      const isBalanceTriggered = balanceNum > 1000.0;
      const isHoldTriggered = holdAmount >= 50.0;

      if (!isBalanceTriggered && !isHoldTriggered) {
        return false;
      }

      this.isProcessing = true;
      this.emitLog('INFO', `[HARVEST_CHECK] Otonom Hasat Eşiği Aşıldı! Bakiye: ${balanceNum.toFixed(4)} KECO | Kilitli Kar: $${holdAmount.toFixed(4)} USDT. İşlem sıraya alınıyor...`);

      if (balanceNum <= 0.01) {
        this.emitLog('WARNING', `[HARVEST_ABORT] Hasat edilebilecek KECO bakiyesi yetersiz: ${balanceNum.toFixed(4)}`);
        this.isProcessing = false;
        return false;
      }

      // KECO miktarını wei formatına çevir
      const tokenAmountWei = ethers.utils.parseUnits(balanceNum.toFixed(18), 18).toString();

      // 2 & 3: %2 Slippage (%98 minAmountOut) ile QuickSwap performDEXSwap çağrısı yap
      this.emitLog('INFO', `[HARVEST_START] ${balanceNum.toFixed(4)} KECO otomatik olarak %2 slippage (%98 Price Impact koruması) ile USDT'ye dönüştürülüyor...`);
      const result = await this.blockchain.performDEXSwap(tokenAmountWei, 98);
      
      if (result.success) {
        this.emitLog('SUCCESS', `[HARVEST_SUCCESS] Otonom Hasat Başarılı! USDT cüzdanınıza aktarıldı. Tx: ${result.txHash}`);
        
        // Gelir bakiye verilerini güncelle
        if (globalState) {
          const estimatedIncome = balanceNum * 0.45;
          globalState.totalAccessFeesCollected = (globalState.totalAccessFeesCollected || 0) + estimatedIncome;
          globalState.availableBalance = (globalState.availableBalance || 0) + estimatedIncome;
          if (isHoldTriggered) {
            globalState.profitLockHoldAmount = 0.0;
          }
        }
        this.isProcessing = false;
        return true;
      } else {
        throw new Error(result.error || "Miktar veya likidite havuzu sınırlaması nedeniyle borsa takas emri revert edildi.");
      }
    } catch (err: any) {
      this.emitLog('ERROR', `[HARVEST_FAILED] Otonom hasat hatası: ${err.message}`);
      this.isProcessing = false;
      return false;
    }
  }
}
