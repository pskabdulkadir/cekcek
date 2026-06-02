/**
 * @file blockchain-safe.ts
 * @description Güvenli ve stabil balanceOf sorgusu için örnek implementasyon
 * Stack underflow ve revert data sorunlarını önleyen pre-flight checks içerir
 */

import { ethers } from 'ethers';

export class SafeBalanceChecker {
  private provider: ethers.providers.Provider;
  private logCallback?: (msg: string) => void;

  constructor(rpcUrl: string, logCallback?: (msg: string) => void) {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl, "any");
    this.logCallback = logCallback;
  }

  private log(msg: string) {
    if (this.logCallback) this.logCallback(msg);
  }

  /**
   * PRE-FLIGHT CHECK 1: Adresin bir kontrat olup olmadığını doğrula
   */
  private async isContract(address: string): Promise<boolean> {
    try {
      const code = await this.provider.getCode(address);
      return code !== '0x' && code !== '0x0';
    } catch (err) {
      this.log(`[PRE-FLIGHT FAIL] Kontrat kodu alınamadı: ${address}`);
      return false;
    }
  }

  /**
   * PRE-FLIGHT CHECK 2: Adresin geçerli bir EVM adresi olduğunu doğrula
   */
  private isValidAddress(address: string): boolean {
    try {
      return ethers.utils.isAddress(address) && address !== ethers.constants.AddressZero;
    } catch {
      return false;
    }
  }

  /**
   * PRE-FLIGHT CHECK 3: Sözleşmenin ERC-20 standardına uygun olup olmadığını test et
   */
  private async isERC20Compatible(tokenAddress: string): Promise<boolean> {
    try {
      const testContract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
        this.provider
      );

      // decimals() fonksiyonunu çağırarak ERC-20 uyumluluğunu test et
      await testContract.decimals();
      return true;
    } catch (err: any) {
      this.log(`[PRE-FLIGHT FAIL] ERC-20 uyumluluk testi başarısız: ${err.message}`);
      return false;
    }
  }

  /**
   * GÜVENLİ BALANCEOF SORGUSU
   * Tüm pre-flight checks'ten geçen, stack underflow korumalı balanceOf sorgusu
   */
  public async getSafeBalance(
    tokenAddress: string,
    accountAddress: string
  ): Promise<{ success: boolean; balance: string; error?: string }> {
    
    // PRE-FLIGHT CHECK 1: Adres validasyonu
    if (!this.isValidAddress(tokenAddress)) {
      return { success: false, balance: "0", error: "Geçersiz token adresi" };
    }
    if (!this.isValidAddress(accountAddress)) {
      return { success: false, balance: "0", error: "Geçersiz cüzdan adresi" };
    }

    // PRE-FLIGHT CHECK 2: Kontrat doğrulaması
    const isContract = await this.isContract(tokenAddress);
    if (!isContract) {
      this.log(`[PRE-FLIGHT] ${tokenAddress} bir kontrat değil, cüzdan adresi`);
      return { success: false, balance: "0", error: "Adres bir kontrat değil" };
    }

    // PRE-FLIGHT CHECK 3: ERC-20 uyumluluk testi
    const isERC20 = await this.isERC20Compatible(tokenAddress);
    if (!isERC20) {
      this.log(`[PRE-FLIGHT] ${tokenAddress} ERC-20 uyumlu değil`);
      return { success: false, balance: "0", error: "Sözleşme ERC-20 uyumlu değil" };
    }

    // GÜVENLİ ÇAĞRI: staticCall kullanarak gas tüketimini önle
    try {
      const contract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
        this.provider
      );

      // staticCall kullanarak state değiştirmeyen güvenli çağrı
      const balanceBN = await contract.callStatic.balanceOf(accountAddress);
      const decimals = await contract.callStatic.decimals().catch(() => 18);
      
      const formattedBalance = ethers.utils.formatUnits(balanceBN, decimals);
      
      this.log(`[SUCCESS] Bakiye sorgulandı: ${accountAddress} -> ${formattedBalance}`);
      return { success: true, balance: formattedBalance };
      
    } catch (err: any) {
      // HATA ANALİZİ: Revert nedenini tespit et
      let errorMsg = err.message;
      
      if (err.message.includes('call exception')) {
        if (err.data) {
          errorMsg = `Revert data: ${err.data}`;
        } else {
          errorMsg = 'Revert without reason string - Muhtemelen ABI uyumsuzluğu';
        }
      }
      
      if (err.message.includes('stack underflow')) {
        errorMsg = 'Stack underflow - Parametre sayısı veya sırası yanlış';
      }

      this.log(`[ERROR] BalanceOf başarısız: ${errorMsg}`);
      return { success: false, balance: "0", error: errorMsg };
    }
  }

  /**
   * GAS FEE KORUMASI: İşlem öncesi gas simülasyonu
   */
  public async simulateGas(
    tokenAddress: string,
    accountAddress: string
  ): Promise<{ success: boolean; estimatedGas: string; error?: string }> {
    
    try {
      const contract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)"],
        this.provider
      );

      // estimateGas kullanarak gas maliyetini tahmin et
      const gasEstimate = await contract.estimateGas.balanceOf(accountAddress);
      
      this.log(`[GAS SIMULATION] Tahmini gas: ${gasEstimate.toString()}`);
      return { success: true, estimatedGas: gasEstimate.toString() };
      
    } catch (err: any) {
      this.log(`[GAS SIMULATION FAIL] ${err.message}`);
      return { success: false, estimatedGas: "0", error: err.message };
    }
  }
}

// KULLANIM ÖRNEĞİ
/*
const checker = new SafeBalanceChecker('https://polygon-rpc.com', console.log);

const result = await checker.getSafeBalance(
  '0x7010FedfCb1Dc2e935243D9E85B46D5A8DCe2692',
  '0xF7BfCBf93f422EbE3C7B62509F0A9bdd4eD6aE8D'
);

if (result.success) {
  console.log('Bakiye:', result.balance);
} else {
  console.log('Hata:', result.error);
}
*/
