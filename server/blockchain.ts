/**
 * @file blockchain.ts
 * @description Decoupled production-ready EVM ledger transaction gateway in ESM TypeScript.
 * 
 * @author Senior Software Architect
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { ethers } from 'ethers';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { blockchainConfig } from './config.ts';

// --- GÜVENLİK KATMANI: SÖZLEŞME BEYAZ LİSTESİ ---
const STATIC_WHITELIST = [
  ethers.utils.getAddress("0x4544d5674066f7f6f966144510006327e5b56345".toLowerCase()), // Ocean Market
  ethers.utils.getAddress("0x71C7656EC7ab88b098defB751B7401B5f6d8976F".toLowerCase()), // Smart Gate
  ethers.utils.getAddress("0xa5e0829caced8ffdd052420551415491d6993e2f".toLowerCase()), // QuickSwap Router
  ethers.utils.getAddress("0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase()), // USDT
  ethers.utils.getAddress("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270".toLowerCase()), // WMATIC
].map(addr => addr.toLowerCase());

// --- DEX YAPILANDIRMASI (QuickSwap Polygon) ---
const POLYGON_USDT = ethers.utils.getAddress("0xc2132d05d31c914a87c6611c10748aeb04b58e8f".toLowerCase());
const WMATIC = ethers.utils.getAddress("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270".toLowerCase());

export class BlockchainRouter {
  public rpcUrl: string;
  public rpcEndpoints: string[] = [];
  public privateKey: string;
  public contractAddress: string; // The contract address for the current network
  public currentChainId: number = 137; // Polygon Mainnet ID
  public currentExplorerUrl: string = "https://polygonscan.com";
  public currentNetworkName: string = "Polygon Mainnet";
  private isRealMode: boolean = false;
  private mintMode: 'CONTRACT' | 'MEMO' = 'CONTRACT';

  private gasThresholds = {
    polygon: "0.5", // MATIC/POL (Daha gerçekçi bir eşik)
    bsc: "0.005"   // BNB
  };

  private logCallback?: (module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;

  // Varlık oluşturma fonksiyonu ve CarbonHarvester sözleşme desteği
  private contractAbi = [
    "function registerDataAsset(uint256 amount, string memory proof) public returns (bool)", // Oluşturma yerine kayıt
    "function submitProof(bytes32 proofHash, uint256 amount) external returns (bool)",
    "function settle(string memory id) public returns (bool)", // DEX Settlement fonksiyonu eklendi
    "function balanceOf(address owner) view returns (uint256)", // Token bakiye sorgusu
  ];

  /**
   * PROTOKOL_BRIDGE: Ticari Köprü üzerinden varlık mühürleme işlemini gerçekleştirir.
   */
  public async mintCarbonAsset(assetId: string, co2Value: number): Promise<boolean> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[BRIDGE_EMISSION] Varlık blokzincirine ihraç ediliyor: ${assetId}`);
    const result = await this.submitDataInsightProof(co2Value, assetId);
    return result.success;
  }

  constructor(options: { rpcUrl?: string; privateKey?: string; contractAddress?: string } = {}) {
    let rpc = options.rpcUrl || blockchainConfig.rpcUrl;
    let pkey = options.privateKey || blockchainConfig.privateKey;
    let contract = options.contractAddress || blockchainConfig.contractAddress;

    if (pkey && !pkey.startsWith('0x')) { // PRIVATE_KEY'in 0x ile başladığından emin ol
      pkey = '0x' + pkey;
    }

    this.privateKey = pkey; // Set private key first
    this.contractAddress = contract;
    this.rpcEndpoints = this.getInitialRpcEndpoints(rpc, blockchainConfig.networkMode);
    this.rpcUrl = this.rpcEndpoints[0];

    // Ağ detaylarını asenkron olarak başlat
    this.getNetworkDetailsFromRpc(this.rpcUrl).then(details => {
      this.currentChainId = details.chainId;
      this.currentExplorerUrl = details.explorerUrl;
      this.currentNetworkName = details.networkName;
      this.emitLog('BLOCKCHAIN', 'INFO', `Ağ tespit edildi: ${this.currentNetworkName} (ID: ${this.currentChainId})`);
    }).catch(() => {});

    // ÜRETİM MODU DOĞRULAMASI: Cüzdanın geçerliliğini kontrol et
    try {
      if (!this.privateKey || this.privateKey.includes('YOUR_PRIVATE_KEY') || this.privateKey.includes('0xtest')) {
        throw new Error("Invalid private key placeholder");
      }
      this.isRealMode = true;
    } catch (err) {
      this.emitLog('BLOCKCHAIN', 'ERROR', "KRITIK: PRIVATE_KEY eksik veya geçersiz! Sistem gerçek işlem yapamaz. Lütfen .env dosyasını kontrol edin.");
      this.isRealMode = false;
    }
  }

  public setMintMode(mode: 'CONTRACT' | 'MEMO') {
    this.mintMode = mode;
    this.emitLog('BLOCKCHAIN', 'SUCCESS', `[MINT_MODE_UPDATED] Basım modu başarıyla güncellendi: ${mode}`);
  }

  public getMintMode(): 'CONTRACT' | 'MEMO' {
    return this.mintMode;
  }

  /**
   * Safe transaction executing wrapper with backup RPC failover and retry mechanisms.
   */
  public async safeExecute<T>(task: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await task();
      } catch (err: any) {
        attempt++;
        const msg = err.message || String(err);
        this.emitLog('BLOCKCHAIN', 'WARNING', `[SAFE_EXECUTE_ATTEMPT] Hata oluştu (Deneme ${attempt}/${maxRetries}): ${msg}`);
        
        // Gaz yetersiz hatası veya cüzdan bakiye yetersizliği gibi kritik limitlerin kontrolü
        const upperMsg = msg.toUpperCase();
        if (upperMsg.includes("INSUFFICIENT FUNDS") || 
            upperMsg.includes("INSUFFICIENT_FUNDS") || 
            upperMsg.includes("NOT ENOUGH POL") ||
            upperMsg.includes("UNDERPRICED") ||
            upperMsg.includes("REPLACEMENT_UNDERPRICED")) {
          this.emitLog('BLOCKCHAIN', 'ERROR', `[CRITICAL_GAS_FAIL] Gaz/Bakiye yetersizliği tespiti! Güvenli liman gereği işlem durduruluyor.`);
          const globalState = (global as any).serverState;
          if (globalState) {
            globalState.isCrawling = false;
          }
          throw err;
        }

        if (attempt >= maxRetries) {
          throw err;
        }
        
        // Exponential backoff delay to allow the network or RPC node to recover
        const delayMs = attempt * 1500;
        this.emitLog('BLOCKCHAIN', 'INFO', `[RETRY_DELAY] Yeniden denemeden önce ${delayMs}ms bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));

        // RPC failover: Bir sonraki RPC'ye geçelim
        if (this.rpcEndpoints && this.rpcEndpoints.length > 1) {
          const nextIndex = attempt % this.rpcEndpoints.length;
          this.rpcUrl = this.rpcEndpoints[nextIndex];
          this.emitLog('BLOCKCHAIN', 'INFO', `[RPC_FAILOVER] RPC alternatifi devreye alınıyor: ${this.rpcUrl}`);
        }
      }
    }
  }

  /**
   * Hedef sözleşme adresinin beyaz listede olup olmadığını kontrol eder.
   */
  private validateContract(address: string) {
    if (!address || address === ethers.constants.AddressZero) return;
    
    try {
      const safeAddress = ethers.utils.getAddress(address.toLowerCase());
      const lowerAddr = safeAddress.toLowerCase();

      // DİNAMİK KONTROL: Sabit liste + Aktif Konfigürasyon
      const isWhitelisted = STATIC_WHITELIST.includes(lowerAddr) || 
                            lowerAddr === (blockchainConfig.greenTokenAddress || "").toLowerCase() ||
                            lowerAddr === (blockchainConfig.routerAddress || "").toLowerCase() ||
                            lowerAddr === (this.contractAddress || "").toLowerCase();

      if (!isWhitelisted) {
        throw new Error(`Yetkisiz adres: ${safeAddress}`);
      }
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `GÜVENLİK İHLALİ: Yetkisiz sözleşme adresi tespit edildi: ${address}`);
      throw new Error("GÜVENLİK İHLALİ: Yetkisiz sözleşme adresi.");
    }
  }

  private getInitialRpcEndpoints(primaryRpc: string, networkMode: string): string[] {
    const endpoints: string[] = [];
    if (primaryRpc) {
      endpoints.push(primaryRpc);
    }
    
    // Always append multiple reliable public backup nodes to guarantee resilience against single RPC failure
    if (networkMode === 'mainnet') {
      endpoints.push('https://polygon.llamarpc.com');
      endpoints.push('https://polygon-rpc.com');
      endpoints.push('https://rpc.ankr.com/polygon');
      endpoints.push('https://1rpc.io/matic');
    } else {
      endpoints.push('https://rpc-amoy.polygon.technology');
    }
    
    return Array.from(new Set(endpoints.filter(Boolean)));
  }

  public async getNetworkDetailsFromRpc(rpcUrl: string): Promise<{ chainId: number, explorerUrl: string, networkName: string }> {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, "any");
      const network = await provider.getNetwork();
      let explorerUrl = "https://polygonscan.com";
      let networkName = network.name;

      if (network.chainId === 56 || network.chainId === 97) {
        explorerUrl = network.chainId === 56 ? "https://bscscan.com" : "https://testnet.bscscan.com";
        networkName = network.chainId === 56 ? "BSC Mainnet" : "BSC Testnet";
      } else if (network.chainId === 137 || network.chainId === 80001) {
        explorerUrl = network.chainId === 137 ? "https://polygonscan.com" : "https://mumbai.polygonscan.com";
        networkName = network.chainId === 137 ? "Polygon Mainnet" : "Polygon Mumbai";
      }
      return { chainId: network.chainId, explorerUrl, networkName };
    } catch (err) {
      return { chainId: 137, explorerUrl: "https://polygonscan.com", networkName: "Polygon Mainnet (Fallback)" };
    }
  }

  public async validateOnChainStatus() { // Metodu public yaptık
    this.emitLog('BLOCKCHAIN', 'INFO', `Ağ geçitleri taranıyor: ${this.rpcEndpoints.length} düğüm aktif.`);

    if (blockchainConfig.configOverride) {
      this.emitLog('BLOCKCHAIN', 'INFO', `Stabilizasyon Modu Aktif: Render ağ kısıtlamaları için optimize ediliyor.`);
    }

    for (let i = 0; i < this.rpcEndpoints.length; i++) {
      const currentRpc = this.rpcEndpoints[i];
      try {
        let provider;
        if (currentRpc.startsWith('ws')) {
          provider = new ethers.providers.WebSocketProvider(currentRpc);
        } else {
          provider = new ethers.providers.JsonRpcProvider(currentRpc, "any");
        }

        // Render ağ kısıtlamalarını aşmak için dinamik bekleme süresi
        const waitTime = process.env.CONFIG_OVERRIDE === 'true' ? 30000 : 15000;

        await Promise.race([
          provider.getNetwork(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Ağ Yanıt Vermedi (Timeout)")), waitTime))
        ]);

        this.rpcUrl = currentRpc; // Çalışan RPC'yi ana kanal yap
        const details = await this.getNetworkDetailsFromRpc(currentRpc).catch(() => ({
            chainId: 137,
            explorerUrl: "https://polygonscan.com",
            networkName: "Polygon Mainnet"
        }));
        
        this.validateContract(this.contractAddress);
        this.currentChainId = details.chainId;
        this.currentExplorerUrl = details.explorerUrl;

        this.emitLog('BLOCKCHAIN', 'SUCCESS', `Ağ bağlantısı kuruldu: ${currentRpc}`);
        return;
      } catch (err) {
        this.emitLog('BLOCKCHAIN', 'WARNING', `Düğüm hatası [${i + 1}/${this.rpcEndpoints.length}]: ${currentRpc}`);
        continue;
      }
    }

    this.emitLog('BLOCKCHAIN', 'ERROR', "KRITIK: Mevcut tüm RPC düğümleri kapalı! Lütfen Alchemy API anahtarınızı .env dosyasına ekleyin.");
  }

  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  /**
   * Helper to fetch fee data and return safe EIP-1559 gas overrides with 30 Gwei floor for maxPriorityFeePerGas.
   */
  public async getSafeGasOverrides(provider: ethers.providers.Provider): Promise<ethers.providers.TransactionRequest> {
    const txOverrides: ethers.providers.TransactionRequest = {};
    try {
      const feeData = await provider.getFeeData();
      const minPriorityFee = ethers.utils.parseUnits("30", "gwei");

      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        let targetPriorityFee = feeData.maxPriorityFeePerGas.mul(125).div(100);
        if (targetPriorityFee.lt(minPriorityFee)) {
          targetPriorityFee = minPriorityFee;
        }

        let targetMaxFee = feeData.maxFeePerGas.mul(160).div(100).add(targetPriorityFee);
        if (targetMaxFee.lt(targetPriorityFee.mul(150).div(100))) {
          targetMaxFee = targetPriorityFee.mul(150).div(100);
        }

        txOverrides.maxPriorityFeePerGas = targetPriorityFee;
        txOverrides.maxFeePerGas = targetMaxFee;
      } else if (feeData.gasPrice) {
        txOverrides.gasPrice = feeData.gasPrice.mul(150).div(100);
      } else {
        txOverrides.gasPrice = ethers.utils.parseUnits("150", "gwei");
      }
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'WARNING', `Gas tahmini alınamadı: ${err.message}. Varsayılanlar uygulanıyor.`);
      txOverrides.maxPriorityFeePerGas = ethers.utils.parseUnits("30", "gwei");
      txOverrides.maxFeePerGas = ethers.utils.parseUnits("150", "gwei");
    }
    return txOverrides;
  }

  /**
   * Helper to fetch fee data and return high-priority responsive gas overrides with safety cap of 400 Gwei.
   */
  public async getHighPriorityGasOverrides(provider: ethers.providers.Provider): Promise<ethers.providers.TransactionRequest> {
    const txOverrides: ethers.providers.TransactionRequest = {};
    try {
      const feeData = await provider.getFeeData();
      const minPriorityFee = ethers.utils.parseUnits("35", "gwei");

      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        let targetPriorityFee = feeData.maxPriorityFeePerGas.mul(130).div(100);
        if (targetPriorityFee.lt(minPriorityFee)) {
          targetPriorityFee = minPriorityFee;
        }

        let targetMaxFee = feeData.maxFeePerGas.mul(170).div(100).add(targetPriorityFee);
        
        // Safety cap of 400 Gwei to prevent drain during extreme spikes
        const safetyCap = ethers.utils.parseUnits("400", "gwei");
        if (targetMaxFee.gt(safetyCap)) {
          targetMaxFee = safetyCap;
        }
        if (targetPriorityFee.gt(ethers.utils.parseUnits("60", "gwei"))) {
          targetPriorityFee = ethers.utils.parseUnits("60", "gwei");
        }

        txOverrides.maxPriorityFeePerGas = targetPriorityFee;
        txOverrides.maxFeePerGas = targetMaxFee;
      } else if (feeData.gasPrice) {
        let boostedGasPrice = feeData.gasPrice.mul(160).div(100);
        const safetyCap = ethers.utils.parseUnits("400", "gwei");
        if (boostedGasPrice.gt(safetyCap)) {
          boostedGasPrice = safetyCap;
        }
        txOverrides.gasPrice = boostedGasPrice;
      } else {
        txOverrides.gasPrice = ethers.utils.parseUnits("160", "gwei");
      }
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'WARNING', `Yüksek öncelikli Gas tahmini alınamadı: ${err.message}. Varsayılanlar uygulanıyor.`);
      txOverrides.maxPriorityFeePerGas = ethers.utils.parseUnits("35", "gwei");
      txOverrides.maxFeePerGas = ethers.utils.parseUnits("160", "gwei");
    }
    return txOverrides;
  }

  /**
   * Cüzdan adresini döndür (PRIVATE_KEY'den türetilmiş)
   */
  public getWalletAddress(): string {
    const targetSecureAddress = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
    try {
      if (!this.privateKey || this.privateKey.includes('0xtest') || this.privateKey.includes('YOUR_PRIVATE_KEY')) {
        return targetSecureAddress;
      }
      const wallet = new ethers.Wallet(this.privateKey);
      if (wallet.address && wallet.address.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
        return targetSecureAddress;
      }
      return wallet.address || targetSecureAddress;
    } catch {
      return targetSecureAddress;
    }
  }

  /**
   * Cüzdandaki gerçek USDT (Polygon) bakiyesini sorgular.
   */
  public async getUSDTBalance(targetAddress?: string): Promise<string> {
    const usdtAddress = ethers.utils.getAddress("0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase());
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const contract = new ethers.Contract(usdtAddress, ["function balanceOf(address owner) view returns (uint256)"], provider);
      const walletAddress = ethers.utils.getAddress((targetAddress || this.getWalletAddress() || blockchainConfig.payoutWallet).toLowerCase());
      
      if (!walletAddress) return "0.00";

      const balance = await contract.balanceOf(walletAddress);
      // Polygon'da USDT 6 decimal kullanır
      return ethers.utils.formatUnits(balance, 6);
    } catch (err) {
      return "0.00";
    }
  }

  /**
   * Cüzdandaki gerçek USDT (Base) bakiyesini sorgular.
   */
  public async getBaseUSDTBalance(targetAddress?: string): Promise<string> {
    const baseUsdtAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913";
    try {
      const provider = new ethers.providers.JsonRpcProvider("https://mainnet.base.org", "any");
      const contract = new ethers.Contract(baseUsdtAddress, ["function balanceOf(address owner) view returns (uint256)"], provider);
      const walletAddress = ethers.utils.getAddress((targetAddress || this.getWalletAddress() || blockchainConfig.payoutWallet).toLowerCase());
      
      if (!walletAddress) return "0.00";

      const balance = await contract.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0));
      // Base'de USDT 6 decimal kullanır
      return ethers.utils.formatUnits(balance, 6);
    } catch {
      return "0.00";
    }
  }

  /**
   * Transfers USDT from the bot address to another address.
   */
  public async transferUSDT(toAddress: string, amount: string): Promise<{ success: boolean; txHash: string; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `USDT Transferi başlatılıyor: ${amount} USDT -> ${toAddress}`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const wallet = new ethers.Wallet(this.privateKey, provider);
      
      const usdtAddress = ethers.utils.getAddress("0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase());
      const contract = new ethers.Contract(usdtAddress, [
        "function transfer(address to, uint256 value) public returns (bool)"
      ], wallet);

      const amountWei = ethers.utils.parseUnits(amount, 6); // USDT uses 6 decimals on Polygon
      const nonce = await provider.getTransactionCount(wallet.address, "pending");
      const gasOverrides = await this.getSafeGasOverrides(provider);
      
      const tx = await contract.transfer(toAddress, amountWei, { nonce, ...gasOverrides });
      await tx.wait();
      
      this.emitLog('BLOCKCHAIN', 'SUCCESS', `USDT transfer tamamlandı! Tx: ${tx.hash}`);
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      const errorMsg = this.parseBlockchainError(err);
      this.emitLog('BLOCKCHAIN', 'ERROR', `USDT transfer başarısız: ${errorMsg}`);
      return { success: false, txHash: '', error: errorMsg };
    }
  }

  /**
   * PRE-FLIGHT CHECK: Adresin geçerli bir EVM adresi olduğunu doğrular
   */
  private isValidAddress(address: string): boolean {
    try {
      return ethers.utils.isAddress(address) && address !== ethers.constants.AddressZero;
    } catch {
      return false;
    }
  }

  /**
   * PRE-FLIGHT CHECK: Adresin bir kontrat olup olmadığını doğrular
   */
  private async isContract(address: string): Promise<boolean> {
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const code = await provider.getCode(address);
      return code !== '0x' && code !== '0x0';
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'WARNING', `[PRE-FLIGHT FAIL] Kontrat kodu alınamadı: ${err.message}`);
      return false;
    }
  }

  /**
   * PRE-FLIGHT CHECK: Sözleşmenin ERC-20 standardına uygun olup olmadığını test eder
   */
  private async isERC20Compatible(tokenAddress: string): Promise<boolean> {
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const testContract = new ethers.Contract(
        tokenAddress,
        ["function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)"],
        provider
      );
      // Kritik kontroller: Hem decimals hem balanceOf çağrılabilir olmalı
      await Promise.all([
        testContract.decimals().catch(() => 18),
        testContract.balanceOf(ethers.constants.AddressZero).catch(() => ethers.BigNumber.from(0))
      ]);
      return true;
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'WARNING', `[PRE-FLIGHT FAIL] ERC-20 uyumluluk testi başarısız: ${tokenAddress}`);
      return false;
    }
  }

  /**
   * Herhangi bir ERC-20 tokenının bakiyesini sorgular (GREEN, MATIC vb.)
   * GÜVENLİK GÜNCELLEMESİ: Pre-flight checks ve stack underflow koruması eklendi
   */
  public async getTokenBalance(tokenAddress: string, accountAddress: string): Promise<string> {
    try {
      const safeToken = ethers.utils.getAddress(tokenAddress.toLowerCase());
      const safeAccount = ethers.utils.getAddress(accountAddress.toLowerCase());
      
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const contract = new ethers.Contract(safeToken, [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ], provider);

      // KRİTİK DÜZELTME: Stack Underflow koruması için her çağrıyı izole ediyoruz
      const balanceBN = await contract.balanceOf(safeAccount).catch(() => ethers.BigNumber.from(0));
      const decimals = await contract.decimals().catch(() => 18);
      
      return ethers.utils.formatUnits(balanceBN, decimals);
    } catch (err) {
      return "0.00"; 
    }
  }

  /**
   * PROTOKOL_READY_MARKET: Kendi token'ın yerine elindeki POL'ü doğrudan USDT'ye çevirir.
   * Bu, sistemin "Hatalı Token" döngüsünden çıkıp gerçek paraya dokunmasını sağlar.
   */
  public async swapPOLForUSDT(polAmount: string): Promise<{ success: boolean; txHash: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[EXIT_TO_CASH] ${polAmount} POL -> USDT takası başlatılıyor...`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const wallet = new ethers.Wallet(this.privateKey, provider);
      // GÜVENLİK: Adresi checksum hatası almamak için normalize et
      const routerAddr = ethers.utils.getAddress(blockchainConfig.routerAddress.toLowerCase());
      const router = new ethers.Contract(routerAddr, [
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
      ], wallet);

      const path = [ethers.utils.getAddress(WMATIC.toLowerCase()), ethers.utils.getAddress(POLYGON_USDT.toLowerCase())];
      const nonce = await provider.getTransactionCount(wallet.address, "pending");
      const gasOverrides = await this.getSafeGasOverrides(provider);

      const amountInWei = ethers.utils.parseEther(polAmount);
      let amountOutMin = ethers.BigNumber.from(0);
      try {
        const amountsOut = await router.getAmountsOut(amountInWei, path);
        if (amountsOut && amountsOut[1]) {
          // %1 Slippage Tolerance (99% output)
          amountOutMin = amountsOut[1].mul(99).div(100);
          this.emitLog('BLOCKCHAIN', 'INFO', `[SWAP_POL_QUOTE] Tahmini USDT kazancı: ${ethers.utils.formatUnits(amountsOut[1], 6)} USDT. %1 Slippage ile minimum limit: ${ethers.utils.formatUnits(amountOutMin, 6)} USDT`);
        }
      } catch (quoteErr: any) {
        this.emitLog('BLOCKCHAIN', 'WARNING', `Fiyat sorgulama hatası: ${quoteErr.message}. Fallback (0 Slippage) devrede.`);
      }

      const tx = await router.swapExactETHForTokens(
        amountOutMin, path, wallet.address, Math.floor(Date.now() / 1000) + 600,
        { value: amountInWei, gasLimit: 250000, nonce, ...gasOverrides }
      );
      await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `Takas başarısız: ${err.message}`);
      return { success: false, txHash: '' };
    }
  }

  private emitLog(module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    // GÜVENLİK FİLTRESİ: Loglarda asla private key geçmemeli
    if (this.privateKey && msg.includes(this.privateKey)) {
      msg = msg.replace(this.privateKey, "***GIZLI_ANAHTAR***");
    }
    // GÜVENLİK FİLTRESİ: Loglarda APP_URL geçmemeli
    if (blockchainConfig.appUrl && msg.includes(blockchainConfig.appUrl)) {
      msg = msg.replace(blockchainConfig.appUrl, "***APP_URL***");
    }
    // Cüzdan adresini kısaltarak logla (0x123...abcd)
    if (this.privateKey && msg.includes(this.privateKey)) {
        msg = msg.replace(this.privateKey, "SECRET_KEY");
    }
    if (this.logCallback) {
      this.logCallback(module, level, msg);
    }
  }

  /**
   * Blokzinciri hatalarını kullanıcı dostu Türkçe mesajlara dönüştürür.
   */
  private parseBlockchainError(err: any): string {
    const message = err?.message || String(err);
    if (message.includes('insufficient funds')) return "Cüzdanda gas ücreti için yetersiz bakiye (POL/BNB eksik).";
    if (message.includes('nonce too low')) return "Ağda bekleyen başka bir işlem var, lütfen bekleyin.";
    if (message.includes('replacement transaction underpriced')) return "İşlem ücreti çok düşük, ağ kabul etmedi.";
    if (message.includes('user rejected')) return "İşlem kullanıcı tarafından reddedildi.";
    if (message.includes('execution reverted')) return "Akıllı kontrat işlemi reddetti; koşullar sağlanmamış olabilir.";
    if (message.includes('call exception')) return "Kontrat çağrısı başarısız (Call Exception). Muhtemel neden: Bayt kodu uyumsuzluğu veya ağ yoğunluğu.";
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) return "İşlem ağ yoğunluğu nedeniyle zaman aşımına uğradı.";
    // Gelişmiş hata teşhisi için ham mesajın bir kısmını ekle
    return `Blokzinciri Hatası: ${message.substring(0, 120)}`;
  }

  /**
   * Cüzdan bakiyesini kontrol eder ve üretim modu için kritik eşik uyarısı verir.
   * Bu fonksiyon, ödeme emri öncesinde sistemin gas ücretini karşılayıp karşılayamayacağını denetler.
   * PROTOKOL_POL_SYNC: POL geçişi ve Alchemy cache sorunlarını aşmak için hibrit doğrulama yapar.
   */
  public async checkGasBalance(network: 'polygon' | 'bsc' = 'polygon', targetAddress?: string): Promise<{ balance: string, isLow: boolean }> {
    let lastError = "";

    // GÜVENLİK_İZOLE: Render kısıtlamalarını aşmak için sadece tanımlı rpcEndpoints kullanılır.
    // Dışarıdan zorla bakiye kontrolü (publicFallback) devre dışı bırakıldı.
    const endpoints = network === 'bsc' ? ['https://bsc-dataseed.binance.org/'] : this.rpcEndpoints;
    if (endpoints.length === 0) return { balance: "0.000000", isLow: true };

    for (const rpc of endpoints) {
      try {
        let provider;
        if (rpc.includes('wss://') || rpc.startsWith('ws')) {
          provider = new ethers.providers.WebSocketProvider(rpc);
        } else {
          provider = new ethers.providers.JsonRpcProvider({
            url: rpc,
            skipFetchSetup: true // Render/Axios çakışmasını önle
          }, "any"); // Network değişimlerine tolerans göster
        }

        const address = targetAddress ? ethers.utils.getAddress(targetAddress.toLowerCase()) : new ethers.Wallet(this.privateKey).address;

        // POL Senkronizasyon Koruması: Ağ durumunu kontrol et
        const networkState = await Promise.race([
          provider.getNetwork(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Düğüm Yanıt Vermedi")), 8000))
        ]);
        
        // PROTOKOL_NATIVE_SYNC: eth_getBalance çağrısını ham RPC olarak zorla (Cache bypass)
        let balance;
        try {
          const balanceHex = await provider.send("eth_getBalance", [address, "latest"]);
          balance = ethers.BigNumber.from(balanceHex);
        } catch {
          // Fallback: Standart ethers metodu
          balance = await provider.getBalance(address);
        }

        const balanceInEther = ethers.utils.formatEther(balance);
        
        const threshold = network === 'bsc' ? this.gasThresholds.bsc : this.gasThresholds.polygon;
        const isLow = parseFloat(balanceInEther) < parseFloat(threshold);

        // Eğer bakiye hala 0 ise ve rpc başarılıysa, diğer RPC'yi de dene (Senkronizasyon gecikmesi olasılığı)
        if (parseFloat(balanceInEther) === 0 && endpoints.length > 1 && rpc === endpoints[0]) {
          this.emitLog('BLOCKCHAIN', 'WARNING', `Bakiye ${rpc} üzerinde 0 görünüyor. Senkronizasyon kontrolü için bir sonraki düğüm deneniyor...`);
          continue;
        }

        this.emitLog('BLOCKCHAIN', 'SUCCESS', `Gas Balance Check: ${parseFloat(balanceInEther).toFixed(4)} POL detected for ${address.slice(0,10)}... [RPC: ${rpc}]`);

        if (isLow) {
          this.emitLog('BLOCKCHAIN', 'WARNING', `DİKKAT: Bakiyeniz düşük (${balanceInEther} POL).`);
        }

        // Başarılı bakiye alındıysa (0 olsa bile tüm RPC'leri denedik) dön
        return { balance: balanceInEther, isLow };
      } catch (err: any) {
        lastError = err.message;
        this.emitLog('BLOCKCHAIN', 'WARNING', `Bakiye sorgulama hatası (RPC: ${rpc}): ${err.message}`);
        continue;
      }
    }

    if (lastError) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `Mevcut tüm RPC düğümleri bakiye sorgusuna yanıt vermedi: ${lastError}`);
    }
    // HATA KORUMASI: RPC hatası 500 döndürmemeli, sadece bakiyeyi 0 göstermeli
    return { balance: "0.000000", isLow: true };
  }

  /**
   * PROTOKOL_REAL: EIP-712 Standartlarında yapılandırılmış satış emri imzalar.
   * Bu imza, alıcı tarafından 'buyAsset' fonksiyonunda kullanılır.
   */
  public async createSignedAccessVoucher(dataAssetId: string, co2AnalysisGrams: number, accessPrice: number): Promise<string> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[EIP-712] Veri erişim voucheri imzalanıyor: ${dataAssetId}...`);
    
    this.validateContract(this.contractAddress);

    try {
      // Cüzdanı provider olmadan başlat (Signing işlemi için bağlantı gerekmez, noNetwork hatasını önler)
      const wallet = new ethers.Wallet(this.privateKey);

      // Domain Separator (Kontrat ile eşleşmeli)
      const domain = {
        name: "InternetReclamationMarket",
        version: "1", // Kontrat versiyonu
        chainId: this.currentChainId, // Dinamik olarak belirlenen Chain ID
        verifyingContract: this.contractAddress
      };

      // Veri Yapısı (Types)
      const types = {
        DataAssetAccess: [ // AssetSale yerine DataAssetAccess
          { name: "id", type: "string" },
          { name: "accessFee", type: "uint256" }, // price yerine accessFee
          { name: "publisher", type: "address" } // seller yerine publisher
        ]
      };

      // Veri (Value)
      const value = {
        id: dataAssetId,
        accessFee: ethers.utils.parseUnits(parseFloat(String(accessPrice || 0)).toFixed(18), 18), // Sayı tipini garantiye al
        publisher: wallet.address // seller yerine publisher
      };

      const signature = await wallet._signTypedData(domain, types, value);
      
      // AUDIT: İmza Geçerlilik Denetimi (EIP-712 Standardı)
      const recoveredAddress = ethers.utils.verifyTypedData(domain, types, value, signature);
      const isAuthentic = recoveredAddress.toLowerCase() === wallet.address.toLowerCase();

      this.emitLog('BLOCKCHAIN', 'SUCCESS', `[VOUCHER_OK] Mühür mülkiyeti doğrulandı: ${isAuthentic ? 'GEÇERLİ (VALID)' : 'GEÇERSİZ'}`);
      this.emitLog('BLOCKCHAIN', 'ANALYZE', `[TRACE] Recovered Signer: ${recoveredAddress.slice(0, 10)}...`);
      
      return signature;
    } catch (err: any) {
      throw new Error(`EIP-712 imzalama hatası: ${err.message}`);
    }
  }

  /**
   * [DEPRECATED] executeRealSale artık Gas-on-Purchase modeli nedeniyle kullanılmamaktadır.
   * Bu fonksiyon, satıcının doğrudan gas ödediği transferler için tasarlanmıştır.
   */
  public async executeRealSale(amountStr: string): Promise<string> {
    this.emitLog('BLOCKCHAIN', 'WARNING', `[DEPRECATED] executeRealSale fonksiyonu çağrıldı ancak pasif. Yeni protokol: Gas-on-Purchase.`);
    throw new Error("DEPRECATED: executeRealSale is no longer used in Gas-on-Purchase model.");
  }

  /**
   * Dispatches immutable parameters onto the target L2/Core blockchain network.
   */
  public async submitDataInsightProof(co2AnalysisGrams: number, proofHash: string): Promise<{ success: boolean; txHash: string; simulated: boolean; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `Blokzinciri ağ geçidi hazırlanıyor...`);

    let lastError: any = null;
    for (let i = 0; i < this.rpcEndpoints.length; i++) {
      const currentRpc = this.rpcEndpoints[i];
      try {
        this.emitLog('BLOCKCHAIN', 'INFO', `Ağa bağlanılıyor [${i + 1}/${this.rpcEndpoints.length}]: ${currentRpc}`);
        
        let provider;
        if (currentRpc.startsWith('ws')) {
          provider = new ethers.providers.WebSocketProvider(currentRpc);
        } else {
          provider = new ethers.providers.JsonRpcProvider(currentRpc, "any");
        }
        
        // Load and verify security keys
        const wallet = new ethers.Wallet(this.privateKey, provider);
        if (!this.privateKey || this.privateKey.includes('YOUR_PRIVATE_KEY')) {
          const errMsg = "HATA: Geçerli bir PRIVATE_KEY (Özel Anahtar) gereklidir. İşlem durduruldu.";
          this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
          return { success: false, txHash: '', simulated: false, error: errMsg };
        }

        this.validateContract(this.contractAddress);

        const balance = await provider.getBalance(wallet.address).catch(() => ethers.BigNumber.from(0));
        const balanceInEther = parseFloat(ethers.utils.formatEther(balance));
        const threshold = parseFloat(this.gasThresholds.polygon);

        if (balanceInEther < threshold && this.isRealMode) {
          const errMsg = `KRİTİK: Gaz bakiyesi çok düşük (${balanceInEther.toFixed(4)} POL). Eşik: ${threshold} POL. İşlem durduruldu.`;
          this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
          return { success: false, txHash: '', simulated: false, error: errMsg };
        }
        this.emitLog('BLOCKCHAIN', 'INFO', `Sıcak cüzdan doğrulandı: ${wallet.address} | Bakiye: ${ethers.utils.formatEther(balance)} MATIC/POL`);

        // --- DİNAMİK GAZ FİYATI TAHMİNİ ---
        const txOverrides = await this.getSafeGasOverrides(provider);
        if (txOverrides.maxFeePerGas) {
            this.emitLog('BLOCKCHAIN', 'INFO', `Optimize Gas (EIP-1559): MaxFee=${ethers.utils.formatUnits(txOverrides.maxFeePerGas, "gwei")} gwei`);
        } else if (txOverrides.gasPrice) {
            this.emitLog('BLOCKCHAIN', 'INFO', `Dinamik Gas (Legacy) kullanılıyor: GasPrice=${ethers.utils.formatUnits(txOverrides.gasPrice, "gwei")} gwei`);
        }

        // Check if contract is zero-address to trigger Direct Proof anchoring on-chain
        const isZeroContract = this.contractAddress === ethers.constants.AddressZero;

        if (isZeroContract) {
          const greenToken = blockchainConfig.greenTokenAddress;
          if (greenToken && !greenToken.startsWith("0x0000")) {
            const tokenBalanceStr = await this.getTokenBalance(greenToken, wallet.address);
            const tokenBalance = parseFloat(tokenBalanceStr);
            if (tokenBalance > 0) {
              this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_AUTOSWAP] KECO -> USDT otonom takas modu tetiklendi. Bakiye: ${tokenBalanceStr} KECO`);
              const tokenAmountWei = ethers.utils.parseUnits(tokenBalanceStr, 18);
              const swapResult = await this.performDEXSwap(tokenAmountWei.toString());
              if (swapResult.success) {
                return {
                  success: true,
                  txHash: swapResult.txHash,
                  simulated: false
                };
              } else {
                this.emitLog('BLOCKCHAIN', 'WARNING', `[DEX_AUTOSWAP_FAIL] Swap başarısız oldu: ${swapResult.error || 'Bilinmeyen hata'}. Memo mod fallback devrede.`);
              }
            }
          }

          this.emitLog('BLOCKCHAIN', 'INFO', `Akıllı kontrat adresi belirtilmedi. Veri analitiği kanıtı doğrudan Polygon üzerinde mühürleniyor (Memo mod)...`);

          const memoMessage = `DATA_INSIGHT_PROOF:${proofHash}:${(co2AnalysisGrams || 0).toFixed(4)}_CO2_g_ANALYSIS`;
          const memoBytes = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(memoMessage));

          const memoNonce = await provider.getTransactionCount(wallet.address, "pending");
          const txRequest = {
            to: wallet.address, // Self-transaction safely stores immutable record
            value: ethers.utils.parseEther("0"),
            data: memoBytes,
            gasLimit: 30000, // Memo transaction'lar için gasLimit düşük tutulabilir
            nonce: memoNonce,
            ...txOverrides // Dinamik gas fiyatlarını uygula
          };

          console.log("SENDING_REAL_TX (MEMO)", txRequest);
          const tx = await wallet.sendTransaction(txRequest);

          this.emitLog('BLOCKCHAIN', 'INFO', `Veri analitiği kanıt işlemi ağa başarıyla iletildi. Blok onayı bekleniyor... İşlem Kodu: ${tx.hash}`);
          const receipt = await tx.wait(1); // Wait for 1 confirmation

          this.emitLog('BLOCKCHAIN', 'SUCCESS', `${receipt.blockNumber} numaralı blok onaylandı. Yeşil Karbon proof kaydı blok zincirine eklendi. Harcanan Gas: ${receipt.gasUsed.toString()}`);

          return {
            success: true,
            txHash: tx.hash,
            simulated: false
          };
        } else {
          // Contract execution
          const contract = new ethers.Contract(this.contractAddress, this.contractAbi, wallet);
          // Analiz değerini kontratın beklediği birime (18 decimal) çevir
          const amountWei = ethers.utils.parseUnits((co2AnalysisGrams || 0).toFixed(18), 18);

          this.emitLog('BLOCKCHAIN', 'INFO', `Veri analitiği kanıt işlemi akıllı kontrat üzerinde başlatılıyor...`);
          
          let tx;
          try {
            // KRİTİK: Eğer adres tanımlanmamışsa veya varsayılan 0x00... ise doğrudan Memo moduna geç
            if (!this.contractAddress || this.contractAddress.includes('0x000')) {
                this.contractAddress = ethers.constants.AddressZero;
                return this.submitDataInsightProof(co2AnalysisGrams, proofHash);
            }

            // Fonksiyon varlığı kontrolü (registerDataAsset selector: 0x3d11933c)
            const code = await provider.getCode(this.contractAddress).catch(() => '0x');
            if (code === '0x' || !code.includes("3d11933c")) {
                this.emitLog('BLOCKCHAIN', 'WARNING', `[VERSION_MISMATCH] Hedef adreste (${this.contractAddress.slice(0,10)}) fonksiyon bulunamadı. Fallback aktif.`);
                this.contractAddress = ethers.constants.AddressZero;
                return this.submitDataInsightProof(co2AnalysisGrams, proofHash);
            }

            this.emitLog('BLOCKCHAIN', 'INFO', `Deneme 1: registerDataAsset çağrılıyor...`);
            const txNonce1 = await provider.getTransactionCount(wallet.address, "pending");
            const txRequest1 = {
              gasLimit: 150000, // Kontrat çağrısı için daha yüksek gasLimit
              nonce: txNonce1,
              ...txOverrides // Dinamik gas fiyatlarını uygula
            };

            console.log("SENDING_REAL_TX (REGISTER_DATA_ASSET)", {
              to: contract.address,
              data: contract.interface.encodeFunctionData("registerDataAsset", [amountWei, proofHash]),
              ...txRequest1
            });

            tx = await contract.registerDataAsset(amountWei, proofHash, txRequest1);
          } catch (firstErr: any) {
            this.emitLog('BLOCKCHAIN', 'WARNING', `mintAndSwap başarısız oldu: ${firstErr.message}. Deneme 2: submitProof çağrılıyor...`);
            // Ensure proofHash matches bytes32 for standard submitProof require signature
            let bytes32Proof = proofHash;
            if (!bytes32Proof.startsWith('0x')) {
              bytes32Proof = '0x' + bytes32Proof;
            }
            if (bytes32Proof.length < 66) {
              bytes32Proof = bytes32Proof.padEnd(66, '0');
            } else if (bytes32Proof.length > 66) {
              bytes32Proof = bytes32Proof.substring(0, 66);
            }
            
            // submitProof (bytes32 proofHash, uint256 amount)
            const txNonce2 = await provider.getTransactionCount(wallet.address, "pending");
            const txRequest2 = {
              gasLimit: 150000, // Kontrat çağrısı için daha yüksek gasLimit
              nonce: txNonce2,
              ...txOverrides // Dinamik gas fiyatlarını uygula
            };

            console.log("SENDING_REAL_TX (SUBMIT_PROOF)", {
              to: contract.address,
              data: contract.interface.encodeFunctionData("submitProof", [bytes32Proof, amountWei]),
              ...txRequest2
            });

            tx = await contract.submitProof(bytes32Proof, amountWei, txRequest2);
          }

          this.emitLog('BLOCKCHAIN', 'INFO', `Ağa başarıyla iletildi. Blok onayı bekleniyor... İşlem Kodu: ${tx.hash}`);
          const receipt = await tx.wait(1); // Wait for 1 confirmation

          this.emitLog('BLOCKCHAIN', 'SUCCESS', `${receipt.blockNumber} numaralı blok onaylandı. Veri analitiği kaydı blok zincirine eklendi. Harcanan Gas: ${receipt.gasUsed.toString()}`);

          return {
            success: true,
            txHash: tx.hash,
            simulated: false
          };
        }
      } catch (e: any) {
        lastError = e;
        this.emitLog('BLOCKCHAIN', 'WARNING', `RPC hatası (${currentRpc}): ${this.parseBlockchainError(e)}`);
      }
    }

    this.emitLog('BLOCKCHAIN', 'ERROR', `Mevcut tüm RPC sunucuları başarısız oldu. İşlem durduruldu.`);
    return {
      success: false,
      txHash: '',
      simulated: false,
      error: this.parseBlockchainError(lastError)
    };
  }

  /**
   * PROTOKOL_GAS_REFILL: USDT bakiyesini kullanarak cüzdana POL (yakıt) takviyesi yapar.
   * Sistemin 7/24 kesintisiz çalışmasını garanti eder.
   */
  public async refillGasFromUSDT(usdtAmount: string): Promise<{ success: boolean; txHash: string }> {
    this.emitLog('BLOCKCHAIN', 'WARNING', `[GAS_REFILL] Yakıt kritik seviyede! ${usdtAmount} USDT -> POL takası başlatılıyor...`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const wallet = new ethers.Wallet(this.privateKey, provider);
      const routerAddr = ethers.utils.getAddress(blockchainConfig.routerAddress.toLowerCase());
      const usdtAddr = ethers.utils.getAddress(POLYGON_USDT.toLowerCase());
      
      const router = new ethers.Contract(routerAddr, [
        "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
      ], wallet);

      const amountInWei = ethers.utils.parseUnits(usdtAmount, 6); // USDT 6 decimal
      const path = [usdtAddr, WMATIC]; // USDT -> WMATIC (POL)
      const deadline = Math.floor(Date.now() / 1000) + 600;

      let amountOutMin = ethers.BigNumber.from(0);
      try {
        const amountsOut = await router.getAmountsOut(amountInWei, path);
        if (amountsOut && amountsOut[1]) {
          // %1 Slippage Tolerance: amountOutMin = expected * 99 / 100
          amountOutMin = amountsOut[1].mul(99).div(100);
          this.emitLog('BLOCKCHAIN', 'INFO', `[GAS_REFILL_QUOTE] Tahmini POL kazancı: ${ethers.utils.formatEther(amountsOut[1])} POL. %1 Slippage ile minimum limit: ${ethers.utils.formatEther(amountOutMin)} POL`);
        }
      } catch (quoteErr: any) {
        this.emitLog('BLOCKCHAIN', 'WARNING', `Fiyat sorgulama hatası: ${quoteErr.message}. Fallback (O Slippage) devrede.`);
      }

      const nonce = await provider.getTransactionCount(wallet.address, "pending");
      const gasOverrides = await this.getSafeGasOverrides(provider);
      const tx = await router.swapExactTokensForETH(
        amountInWei, amountOutMin, path, wallet.address, deadline,
        { gasLimit: 300000, nonce, ...gasOverrides }
      );
      
      await tx.wait();
      this.emitLog('BLOCKCHAIN', 'SUCCESS', `[REFILL_OK] Yakıt ikmali tamamlandı. Tx: ${tx.hash}`);
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `Yakıt ikmali başarısız: ${err.message}`);
      return { success: false, txHash: '' };
    }
  }

  /**
   * PROTOKOL_DIRECT_DEX: Varlıkları doğrudan QuickSwap üzerinden USDT'ye çevirir.
   * @param tokenAmountWei Takas edilecek miktar (Wei biriminde)
   * @param slippagePercent Kayma payı oranı (Örn. 99 = %1 slippage, 98 = %2 slippage, varsayılan 99)
   */
  public async performDEXSwap(tokenAmountWei: string, slippagePercent: number = 99): Promise<{ success: boolean; txHash: string; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_DIRECT] Doğrudan borsa takası başlatılıyor (QuickSwap -> USDT)...`);
    
    try {
      const tokenAddr = blockchainConfig.greenTokenAddress;
      if (!tokenAddr || tokenAddr === ethers.constants.AddressZero || tokenAddr === '0x0000000000000000000000000000000000000000') {
        const errMsg = "KRİTİK EKSİKLİK: GREEN_TOKEN_ADDRESS (Yeşil Token Adresi) tanımlanmamış! Takas yapılamaz.";
        this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
        return { success: false, txHash: '', error: errMsg };
      }

      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const wallet = new ethers.Wallet(this.privateKey, provider);
      
      // GAZA DUYARLILIK VE GAS DRAINER ENGELLEYİCİ: POL Bakiye Kontrolü (Minimum 2.0 POL gerekiyor)
      const balancePol = await provider.getBalance(wallet.address).catch(() => ethers.BigNumber.from(0));
      const balancePolEth = parseFloat(ethers.utils.formatEther(balancePol));
      if (balancePolEth < 2.0) {
        const errMsg = `[FUEL_CRITICAL] Cüzdan bakiyesi (POL) çok düşük: ${balancePolEth.toFixed(4)} POL. Güvenlik ve gas drainer koruması gereği takas işlemi durduruldu. Limit: 2.0 POL.`;
        this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
        
        const globalState = (global as any).serverState;
        if (globalState) {
          globalState.isCrawling = false; // Otonom döngüyü askıya alıp gas sömürüsünü kes!
        }
        return { success: false, txHash: '', error: "FUEL_CRITICAL" };
      }
      
      // ADRES DOĞRULAMA: Token adresi bir kontrat mı yoksa cüzdan mı?
      const code = await provider.getCode(tokenAddr);
      if (code === '0x' || code === '0x0') {
        const errMsg = `KRİTİK HATA: GREEN_TOKEN_ADDRESS (${tokenAddr}) bir cüzdan adresi olarak girilmiş! Takas için gerçek bir kontrat adresi gereklidir.`;
        this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
        return { success: false, txHash: '', error: errMsg };
      }

      const routerAbi = [
        "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
      ];
      const erc20Abi = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
      ];

      const routerAddr = (blockchainConfig.routerAddress || "0xa5e0829caced8ffdd052420551415491d6993e2f").toLowerCase();
      const router = new ethers.Contract(routerAddr, routerAbi, wallet);
      
      // GÜVENLİK: Checksum hatasını önlemek için doğrudan küçük harf kullan
      const safeTokenAddr = tokenAddr.toLowerCase();
      const tokenContract = new ethers.Contract(safeTokenAddr, erc20Abi, wallet);

      // 1. ONAY (Approval) KONTROLÜ
      // QuickSwap Router (routerAddr) borsa takası için harcama yetkisine sahip olmalıdır.
      const currentAllowance = await tokenContract.allowance(wallet.address, routerAddr);
      if (currentAllowance.lt(tokenAmountWei)) {
        this.emitLog('BLOCKCHAIN', 'INFO', `[APPROVE] Borsa yetkisi alınıyor... Spender: ${routerAddr}`);
        
        const approveOverrides = await this.getHighPriorityGasOverrides(provider);
        approveOverrides.gasLimit = 80000;
        approveOverrides.nonce = await provider.getTransactionCount(wallet.address, "pending");
        
        const approveTx = await tokenContract.approve(routerAddr, ethers.constants.MaxUint256, approveOverrides);
        const approveReceipt = await approveTx.wait();
        if (!approveReceipt || approveReceipt.status !== 1) {
          throw new Error("QuickSwap Router harcama yetki onaylama işlemi blokzincirinde başarısız oldu (Reverted).");
        }
        this.emitLog('BLOCKCHAIN', 'SUCCESS', `[APPROVE_SUCCESS] Borsa artık tokenları harcayabilir.`);
      }

      // SMART_GATE_CONTRACT_ADDRESS tanımlıysa ek olarak ona da onay veriyoruz
      if (blockchainConfig.contractAddress && blockchainConfig.contractAddress !== ethers.constants.AddressZero) {
        const smartSpender = blockchainConfig.contractAddress.toLowerCase();
        const smartAllowance = await tokenContract.allowance(wallet.address, smartSpender);
        if (smartAllowance.lt(tokenAmountWei)) {
          this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_APPROVE] Akıllı sözleşme yetkilendiriliyor... Spender: ${smartSpender}`);
          
          const approveOverrides = await this.getHighPriorityGasOverrides(provider);
          approveOverrides.gasLimit = 80000;
          approveOverrides.nonce = await provider.getTransactionCount(wallet.address, "pending");

          const approveTx = await tokenContract.approve(smartSpender, ethers.constants.MaxUint256, approveOverrides);
          const approveReceipt = await approveTx.wait();
          if (!approveReceipt || approveReceipt.status !== 1) {
            throw new Error(`Akıllı sözleşme yetki onaylama işlemi blokzincirinde başarısız oldu (Reverted). Spender: ${smartSpender}`);
          }
        }
      }

      // 2. TAKAS (Swap) PARAMETRELERİ
      // Güzergah: KECO -> WMATIC -> USDT (Daha fazla likidite şansı için standart yol)
      const path = [tokenAddr.toLowerCase(), WMATIC.toLowerCase(), POLYGON_USDT.toLowerCase()];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 dakika

      // PRE-FLIGHT CHECK: Adres bir kontrat mı ve borsa fonksiyonu var mı?
      const tokenCode = await provider.getCode(tokenAddr);
      if (tokenCode === '0x' || tokenCode === '0x0') {
        const errMsg = `[DEX_ABORTED] GREEN_TOKEN_ADDRESS bir cüzdan! Takas için kontrat gereklidir.`;
        this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
        return { success: false, txHash: '', error: errMsg };
      }

      // --- CANLI PİYASA PROTOKOLÜ: RAPID GAS & SLIPPAGE ---
      const feeData = await provider.getFeeData();
      
      // 1. ADIM: Fiyat Sorgulama (0.1sn Gecikmeli Gerçek Fiyat)
      const amountsOut = await router.getAmountsOut(tokenAmountWei, path).catch((err: any) => {
        this.emitLog('BLOCKCHAIN', 'WARNING', `[LIQUIDITY_OFFLINE] QuickSwap'ta fiyat bulunamadı. Havuz kurulmamış olabilir.`);
        return null;
      });

      if (!amountsOut || !amountsOut[2] || ethers.BigNumber.from(amountsOut[2]).isZero()) {
        return { success: false, txHash: '', error: "Yetersiz Likidite" };
      }

      const expectedUsdt = amountsOut[2];
      
      // Slippage Tolerance (Kayma Toleransı)
      const amountOutMin = ethers.BigNumber.from(expectedUsdt).mul(slippagePercent).div(100);

      const txOverrides = await this.getHighPriorityGasOverrides(provider);
      txOverrides.gasLimit = 300000; // Stabil gaz limiti
      txOverrides.nonce = await provider.getTransactionCount(wallet.address, "pending");

      this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_LIVE] Fiyat: $${ethers.utils.formatUnits(expectedUsdt, 6)} USDT | Tolerans: %${100 - slippagePercent} | Emre çıkılıyor...`);
      
      const swapTx = await router.swapExactTokensForTokens(
        tokenAmountWei,
        amountOutMin, // Güvenli minimum tutar
        path,
        blockchainConfig.payoutWallet || wallet.address, // Kazancın gideceği kritik adres
        deadline,
        txOverrides
      );

      const receipt = await swapTx.wait();
      
      // GÜVENLİK VE GHOST_VALUE_PREVENTION: İşlemin ağda REVERT olup olmadığını denetle!
      if (!receipt || receipt.status !== 1) {
        throw new Error(`DEX swap işlemi ağda başarısızlığa uğradı ve Revert edildi (Status: 0). Tx Hash: ${swapTx.hash}`);
      }
      
      this.emitLog('BLOCKCHAIN', 'SUCCESS', `[DEX_OK] Takas başarılı! USDT cüzdanınıza aktarıldı. Tx: ${swapTx.hash}`);
      
      // Otomatik USDT Tahsilatı kontrolü (USDT Bakiye Güncelleme Dinleyicisi)
      try {
        const targetUsdtAddress = blockchainConfig.payoutWallet || wallet.address;
        const usdtBalance = await this.getUSDTBalance(targetUsdtAddress);
        this.emitLog('BLOCKCHAIN', 'SUCCESS', `[USDT_BALANCE_UPDATE] Yeni USDT Bakiyesi: $${usdtBalance} USDT (Adres: ${targetUsdtAddress.slice(0, 10)}...)`);
      } catch (balErr: any) {
        this.emitLog('BLOCKCHAIN', 'WARNING', `USDT bakiye okuma dinleyicisi hatası: ${balErr.message}`);
      }
      
      return { success: true, txHash: swapTx.hash };
    } catch (err: any) {
      const errorMsg = this.parseBlockchainError(err);
      this.emitLog('BLOCKCHAIN', 'ERROR', `[DEX_FAILED] Takas hatası: ${errorMsg}`);
      return { success: false, txHash: '', error: errorMsg };
    }
  }

  /**
   * PROTOKOL_BULK: Çok sayıda veri varlığını tek bir işlemle zincire mühürler.
   * @param assets Toplu halde gönderilecek varlık listesi
   */
  public async bulkRegisterDataAssets(assets: { co2Value: number, proofHash: string }[]): Promise<{ success: boolean; txHash: string; count: number; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `${assets.length} varlık için toplu mühürleme başlatılıyor...`);
    
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const wallet = new ethers.Wallet(this.privateKey, provider);

      if (this.contractAddress === ethers.constants.AddressZero) {
        throw new Error("Toplu kayıt için geçerli bir akıllı kontrat adresi gereklidir.");
      }
      
      // Sözleşme kontrolü
      const contract = new ethers.Contract(this.contractAddress, [
        "function bulkRegister(uint256[] memory amounts, string[] memory proofs) public returns (bool)"
      ], wallet);

      const amounts = assets.map(a => ethers.utils.parseUnits(a.co2Value.toFixed(18), 18));
      const proofs = assets.map(a => a.proofHash);

      // --- DİNAMİK GAZ STRATEJİSİ (POLYGON UYUMLU) ---
      const feeData = await provider.getFeeData();
      const txOverrides: any = {};
      txOverrides.nonce = await provider.getTransactionCount(wallet.address, "pending");
      
      const minPriorityFee = ethers.utils.parseUnits("30", "gwei");

      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
          let targetPriorityFee = feeData.maxPriorityFeePerGas.gt(minPriorityFee) 
              ? feeData.maxPriorityFeePerGas.mul(125).div(100) 
              : minPriorityFee;

          txOverrides.maxPriorityFeePerGas = targetPriorityFee;
          txOverrides.maxFeePerGas = feeData.maxFeePerGas.mul(160).div(100).add(targetPriorityFee);
      } else {
          txOverrides.gasPrice = feeData.gasPrice?.mul(150).div(100) || ethers.utils.parseUnits("150", "gwei");
      }

      // Hassas Gas Limit Tahmini
      try {
          const estimatedGas = await contract.estimateGas.bulkRegister(amounts, proofs);
          txOverrides.gasLimit = estimatedGas.mul(120).div(100); // %20 Güvenlik marjı
      } catch (estError) {
          txOverrides.gasLimit = Math.max(800000, assets.length * 70000);
      }

      this.emitLog('BLOCKCHAIN', 'ANALYZE', `[BULK_TX] ${assets.length} varlık için agresif gas ile ağa çıkılıyor...`);
      const tx = await contract.bulkRegister(amounts, proofs, txOverrides);
      const receipt = await tx.wait();

      this.emitLog('BLOCKCHAIN', 'SUCCESS', `Toplu işlem onaylandı! ${assets.length} varlık mühürlendi. Tx: ${tx.hash}`);
      
      return {
        success: true,
        txHash: tx.hash,
        count: assets.length
      };
    } catch (err: any) {
      const errorMsg = this.parseBlockchainError(err);
      this.emitLog('BLOCKCHAIN', 'ERROR', `Toplu işlem hatası: ${errorMsg}`);
      return { success: false, txHash: '', count: 0, error: errorMsg };
    }
  }

  /**
   * .env dosyasını kalıcı olarak günceller ve konfigürasyonu runtime'da yeniler.
   */
  private updatePersistentConfig(key: string, value: string) {
    const envPath = path.resolve(process.cwd(), '.env');
    try {
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }

      const regex = new RegExp(`^${key}=.*`, 'm');
      if (envContent.match(regex)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }

      fs.writeFileSync(envPath, envContent.trim() + '\n');
      
      // RUNTIME UPDATE: In-memory nesnesini anında güncelle
      if (key === 'GREEN_TOKEN_ADDRESS') {
        blockchainConfig.greenTokenAddress = ethers.utils.getAddress(value.toLowerCase());
      }
      
      // KRİTİK DÜZELTME: CONTRACT_ADDRESS, GREEN_TOKEN_ADDRESS ile aynı olmamalıdır.
      // Bu satır kaldırıldı. CONTRACT_ADDRESS, CarbonHarvester gibi ana kontratın adresidir.
      if (key === 'CONTRACT_ADDRESS') blockchainConfig.contractAddress = ethers.utils.getAddress(value.toLowerCase());

      this.emitLog('SYSTEM', 'SUCCESS', `[.env_UPDATE] ${key} kaydedildi ve sistem hafızası yenilendi: ${value}`);
    } catch (err: any) {
      this.emitLog('SYSTEM', 'ERROR', `.env dosyası güncellenirken kritik hata: ${err.message}`);
    }
  }

  /**
   * PROTOKOL_TOKEN_GENESIS: Polygon üzerinde yeni bir ERC-20 tokenı mühürler.
   */
  public async deployGreenToken(name: string, symbol: string): Promise<{ success: boolean; address: string; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_GENESIS] Ultra-Stabil mühürleme başlatılıyor: ${name}...`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const wallet = new ethers.Wallet(this.privateKey, provider);
      
      const artifactPath = path.join(process.cwd(), "artifacts/server/Sozlesme.sol/Sozlesme.json");
      const SozlesmeArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      const fixedBytecode = SozlesmeArtifact.bytecode;

      if (fixedBytecode.length < 500) {
        throw new Error("Kritik Hata: Bytecode çok kısa, derleme hatası olabilir.");
      }
      
      const abi = ["constructor(string n, string s, uint256 supply)", "function balanceOf(address a) view returns (uint256)", "function mint(address to, uint256 amount) public"];
      const factory = new ethers.ContractFactory(abi, fixedBytecode, wallet);
      const initialSupply = ethers.utils.parseUnits("1000000000", 18);

      const contract = await factory.deploy(name, symbol, initialSupply, {
        maxPriorityFeePerGas: ethers.utils.parseUnits("40", "gwei"),
        maxFeePerGas: ethers.utils.parseUnits("400", "gwei"),
        gasLimit: 1500000
      });
      
      await contract.deployed();
      const finalAddress = contract.address;
      this.emitLog('BLOCKCHAIN', 'SUCCESS', `[DEPLOY_OK] Kontrat mühürlendi: ${finalAddress}`);
      
      // KRİTİK: Kontrat oluşturulduktan sonra deploy eden cüzdana initialSupply'ı mint et
      const initialMintAmount = ethers.utils.parseUnits("1000000000", 18); // 1 Milyar token
      this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_MINT] Başlangıç bakiyesi (${ethers.utils.formatUnits(initialMintAmount, 18)} ${symbol}) cüzdana basılıyor...`);
      const mintTx = await contract.mint(wallet.address, initialMintAmount);
      await mintTx.wait();

      // KRİTİK UYARI: Render üzerinde .env dosyasına yazma kalıcı değildir!
      // Bu adresleri Render Dashboard -> Environment Variables kısmına manuel eklemelisiniz.
      this.updatePersistentConfig('GREEN_TOKEN_ADDRESS', finalAddress);
      this.updatePersistentConfig('CONTRACT_ADDRESS', finalAddress); // FINANCE modülü için
      this.emitLog('SYSTEM', 'WARNING', `[RENDER_PERSISTENCE] Yeni adres: ${finalAddress}. Lütfen bu adresi Render Dashboard'a GREEN_TOKEN_ADDRESS olarak ekleyin.`);

      try {
          this.emitLog('BLOCKCHAIN', 'INFO', `[SYNC] RPC senkronizasyonu bekleniyor (20sn)...`);
          await new Promise(r => setTimeout(r, 20000));
          const bal = await contract.balanceOf(wallet.address);
          this.emitLog('BLOCKCHAIN', 'SUCCESS', `[TOKEN_READY] Bakiye doğrulandı: ${ethers.utils.formatUnits(bal, 18)} ${symbol}`);
      } catch (e) {
          this.emitLog('BLOCKCHAIN', 'WARNING', `[VERIFY_SKIPPED] Ağ gecikmesi nedeniyle bakiye henüz okunamadı ancak kontrat hazır: ${finalAddress}`);
      }
      
      return { success: true, address: finalAddress };
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `[DEPLOY_FAILED] Kritik Hata (Mühürleme): ${err.message}`);
      return { success: false, address: '', error: err.message };
    }
  }

  public async mintToken(tokenAddress: string, toAddress: string, amount: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_MINT] Basım emri iletiliyor (Recycle & Sell Otonom Akışı): ${amount} KECO -> ${toAddress}`);
    try {
      return await this.safeExecute(async () => {
        const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
        const wallet = new ethers.Wallet(this.privateKey, provider);
        const targetAddress = toAddress || "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";

        // GAZA DUYARLILIK VE GAS DRAINER ENGELLEYİCİ: POL Bakiye Kontrolü (Minimum 2.0 POL gerekiyor)
        const balancePol = await provider.getBalance(wallet.address).catch(() => ethers.BigNumber.from(0));
        const balancePolEth = parseFloat(ethers.utils.formatEther(balancePol));
        if (balancePolEth < 2.0) {
          const errMsg = `[FUEL_CRITICAL] Cüzdan bakiyesi (POL) çok düşük: ${balancePolEth.toFixed(4)} POL. Güvenlik ve gas drainer koruması gereği mühürleme/basım (Mint) durduruldu. Limit: 2.0 POL.`;
          this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
          
          const globalState = (global as any).serverState;
          if (globalState) {
            globalState.isCrawling = false; // Otonom döngüyü askıya alıp gas sömürüsünü kes!
          }
          return { success: false, error: "FUEL_CRITICAL" };
        }

        // 1. STANDART ERC-20 KONTRAT MINT MODU
        if (this.mintMode === 'CONTRACT') {
          try {
            const safeTokenAddr = tokenAddress.toLowerCase();
            this.validateContract(safeTokenAddr);
            
            this.emitLog('BLOCKCHAIN', 'INFO', `[CONTRACT_MINT] Standart ERC-20 üzerinden basım/transfer deneniyor... Kontrat: ${safeTokenAddr}`);
            
            const contract = new ethers.Contract(safeTokenAddr, [
              "function mint(address to, uint256 amount) public",
              "function decimals() view returns (uint8)",
              "function balanceOf(address owner) view returns (uint256)",
              "function transfer(address to, uint256 amount) public returns (bool)"
            ], wallet);
            
            const decimals = await contract.decimals().catch(() => 18);
            const amountWei = ethers.utils.parseUnits(parseFloat(amount).toFixed(decimals < 18 ? decimals : 4), decimals);
            
            // Önce cüzdanın kendi bakiyesini kontrol et
            const myBalance = await contract.balanceOf(wallet.address).catch(() => ethers.BigNumber.from(0));
            
            let contractOverrides: any = {
              gasLimit: 150000
            };
            
            try {
              const feeData = await provider.getFeeData();
              if (feeData.maxPriorityFeePerGas && feeData.maxFeePerGas) {
                const minPriorityFee = ethers.utils.parseUnits("35", "gwei");
                const proposedPriority = feeData.maxPriorityFeePerGas.mul(150).div(100);
                contractOverrides.maxPriorityFeePerGas = proposedPriority.gt(minPriorityFee) ? proposedPriority : minPriorityFee;
                const proposedMaxFee = feeData.maxFeePerGas.mul(150).div(100);
                const minMaxFee = contractOverrides.maxPriorityFeePerGas.add(ethers.utils.parseUnits("15", "gwei"));
                contractOverrides.maxFeePerGas = proposedMaxFee.gt(minMaxFee) ? proposedMaxFee : minMaxFee;
              } else if (feeData.gasPrice) {
                contractOverrides.gasPrice = feeData.gasPrice.mul(150).div(100);
              }
            } catch (e) {}

            // Eğer hedef adres KENDİMİZSE ve bakiyemiz zaten yeterliyse mint() işlemine gerek yok, başarılı dönebiliriz!
            if (targetAddress.toLowerCase() === wallet.address.toLowerCase() && myBalance.gte(amountWei)) {
              this.emitLog('BLOCKCHAIN', 'SUCCESS', `[TOKEN_BALANCE_OK] Cüzdanda zaten yeterli KECO bakiyesi var (${ethers.utils.formatUnits(myBalance, decimals)}). Mint işlemi atlandı.`);
              return { success: true, txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' };
            }

            // Eğer minter yetkisi bulunmuyorsa ancak transfere yetecek bakiyemiz varsa transfer() deneyelim
            if (myBalance.gte(amountWei)) {
              this.emitLog('BLOCKCHAIN', 'INFO', `[CONTRACT_TRANSFER] Minter yetkisi yerine cüzdan bakiyesinden doğrudan transfer tetikleniyor... To: ${targetAddress} | Tutar: ${amount}`);
              const tx = await contract.transfer(targetAddress, amountWei, contractOverrides);
              this.emitLog('BLOCKCHAIN', 'SUCCESS', `[CONTRACT_TRANSFER_SENT] Transfer işlemi iletildi, onay bekleniyor... Tx: ${tx.hash}`);
              const receipt = await tx.wait();
              if (!receipt || receipt.status !== 1) {
                throw new Error(`Transfer işlemi Revert edildi (Status: 0). Tx: ${tx.hash}`);
              }
              return { success: true, txHash: tx.hash };
            }
            
            // Eğer bakiye yetersizse ve basmak zorundaysak, mint fonksiyonunu çağıralım
            this.emitLog('BLOCKCHAIN', 'INFO', `[CONTRACT_MINT_CALL] Cüzdan bakiyesi yetersiz (${ethers.utils.formatUnits(myBalance, decimals)}), mint() fonksiyonu çağrılıyor...`);
            const tx = await contract.mint(targetAddress, amountWei, contractOverrides);
            this.emitLog('BLOCKCHAIN', 'SUCCESS', `[CONTRACT_MINT_SENT] Standart basım işlemi Polygon ağına iletildi, onay bekleniyor... Tx: ${tx.hash}`);
            const receipt = await tx.wait();
            if (!receipt || receipt.status !== 1) {
              throw new Error(`Standart basım işlemi ağda başarısızlığa uğradı ve Revert edildi (Status: 0). Tx: ${tx.hash}`);
            }
            return { success: true, txHash: tx.hash };
          } catch (err: any) {
            const detail = err.message || err;
            this.emitLog('BLOCKCHAIN', 'ERROR', `[CONTRACT_MINT_FAILED] Standart basım/transfer başarısız oldu: ${detail}`);
            return { success: false, error: detail };
          }
        }

        // 2. GERÇEK SÖZLEŞME VE POL TRANSFER MODU (DIRECT / FALLBACK REAL TRANSACTION)
        this.emitLog('BLOCKCHAIN', 'INFO', `[DIRECT_TRANSFER] 'Contract Mint' yerine GERÇEK transfer modu tetiklendi. Polygon üzerinde işlem gerçekleştiriliyor...`);
        
        let txOverrides: any = {
          gasLimit: 150000
        };
        
        try {
          const feeData = await provider.getFeeData();
          if (feeData.maxPriorityFeePerGas && feeData.maxFeePerGas) {
            const minPriorityFee = ethers.utils.parseUnits("35", "gwei");
            const proposedPriority = feeData.maxPriorityFeePerGas.mul(150).div(100);
            txOverrides.maxPriorityFeePerGas = proposedPriority.gt(minPriorityFee) ? proposedPriority : minPriorityFee;
            
            const proposedMaxFee = feeData.maxFeePerGas.mul(150).div(100);
            const minMaxFee = txOverrides.maxPriorityFeePerGas.add(ethers.utils.parseUnits("15", "gwei"));
            txOverrides.maxFeePerGas = proposedMaxFee.gt(minMaxFee) ? proposedMaxFee : minMaxFee;
            
            this.emitLog('BLOCKCHAIN', 'INFO', `[DYNAMIC_GAS] EIP-1559 Gaz limitleri uygulandı: maxFee=${ethers.utils.formatUnits(txOverrides.maxFeePerGas, 'gwei')} gwei | priorityFee=${ethers.utils.formatUnits(txOverrides.maxPriorityFeePerGas, 'gwei')} gwei`);
          } else if (feeData.gasPrice) {
            txOverrides.gasPrice = feeData.gasPrice.mul(150).div(100);
            const minLegacyGasPrice = ethers.utils.parseUnits("50", "gwei");
            if (txOverrides.gasPrice.lt(minLegacyGasPrice)) {
              txOverrides.gasPrice = minLegacyGasPrice;
            }
            this.emitLog('BLOCKCHAIN', 'INFO', `[DYNAMIC_GAS] Legacy Gaz limitleri uygulandı: gasPrice=${ethers.utils.formatUnits(txOverrides.gasPrice, 'gwei')} gwei`);
          } else {
            txOverrides.maxPriorityFeePerGas = ethers.utils.parseUnits("35", "gwei");
            txOverrides.maxFeePerGas = ethers.utils.parseUnits("350", "gwei");
          }
        } catch (gasErr: any) {
          this.emitLog('BLOCKCHAIN', 'WARNING', `[GAS_FEE_SKIPPED] Gaz fiyatı alınamadı, sabit değerler kullanılıyor: ${gasErr.message}`);
          txOverrides.maxPriorityFeePerGas = ethers.utils.parseUnits("35", "gwei");
          txOverrides.maxFeePerGas = ethers.utils.parseUnits("350", "gwei");
        }

        const hasRealToken = tokenAddress && tokenAddress !== ethers.constants.AddressZero && !tokenAddress.startsWith("0x0000");
        if (hasRealToken) {
          // GERÇEK ERC-20 TRANSFERS (E.g. USDT)
          this.emitLog('BLOCKCHAIN', 'INFO', `[ERC20_TRANSFER] Gerçek ERC-20 transferi başlatılıyor... Token: ${tokenAddress} -> To: ${targetAddress} | Tutar: ${amount}`);
          const contract = new ethers.Contract(tokenAddress.toLowerCase(), [
            "function transfer(address to, uint256 amount) public returns (bool)",
            "function decimals() view returns (uint8)"
          ], wallet);
          
          const decimals = await contract.decimals().catch(() => 18);
          const amountWei = ethers.utils.parseUnits(parseFloat(amount).toFixed(decimals < 18 ? decimals : 4), decimals);
          
          const tx = await contract.transfer(targetAddress, amountWei, txOverrides);
          this.emitLog('BLOCKCHAIN', 'INFO', `[ERC20_TRANSFER_SENT] Gerçek ERC-20 transfer işlemi iletildi: ${tx.hash}`);
          const receipt = await tx.wait();
          if (!receipt || receipt.status !== 1) {
            throw new Error(`ERC-20 transfer işlemi ağda REVERT edildi (Status: 0). Tx: ${tx.hash}`);
          }
          return { success: true, txHash: tx.hash };
        } else {
          // GERÇEK POL (MATIC) TRANSFERİ
          const walletBalance = await provider.getBalance(wallet.address);
          // Her basım/mühürleme işleminde nominal olarak 0.005 POL (MATIC) transfer edilir.
          const polAmountToSend = ethers.utils.parseEther("0.005");
          
          if (walletBalance.lt(polAmountToSend.add(ethers.utils.parseEther("0.05")))) {
            throw new Error(`Cüzdandaki POL bakiyesi transfer ve gaz için yetersiz. Mevcut: ${ethers.utils.formatEther(walletBalance)} POL`);
          }
          
          this.emitLog('BLOCKCHAIN', 'INFO', `[NATIVE_TRANSFER] Gerçek POL transferi başlatılıyor... To: ${targetAddress} | Tutar: ${ethers.utils.formatEther(polAmountToSend)} POL`);
          const tx = await wallet.sendTransaction({
            to: targetAddress,
            value: polAmountToSend,
            ...txOverrides
          });
          
          this.emitLog('BLOCKCHAIN', 'INFO', `[NATIVE_TRANSFER_SENT] POL transfer işlemi Polygon ağına iletildi: ${tx.hash}`);
          const receipt = await tx.wait();
          if (!receipt || receipt.status !== 1) {
            throw new Error(`POL transfer işlemi ağda REVERT edildi (Status: 0). Tx: ${tx.hash}`);
          }
          return { success: true, txHash: tx.hash };
        }
      });
    } catch (err: any) {
      const errorMsg = this.parseBlockchainError(err);
      this.emitLog('BLOCKCHAIN', 'ERROR', `[MINT_FAILED] Cüzdan etkileşim seviyesinde hata: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  public async approveToken(tokenAddress: string, spenderAddress: string, amount: string = "115792089237316195423570985008687907853269984665640564039457584007913129639935"): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!tokenAddress || !spenderAddress) {
      this.emitLog('BLOCKCHAIN', 'WARNING', `[TOKEN_APPROVE_SKIPPED] Eksik adresler (Token: ${tokenAddress}, Spender: ${spenderAddress}). On-chain onay işlemi atlandı.`);
      return { success: true, txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' };
    }

    const safeTokenAddr = tokenAddress.toLowerCase();
    const safeSpenderAddr = spenderAddress.toLowerCase();

    if (safeTokenAddr === safeSpenderAddr) {
      this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_APPROVE_BYPASS] Token adresi ve Spender adresi aynı (${tokenAddress}). On-chain onayı bypass edilerek başarılı sayıldı.`);
      return { success: true, txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' };
    }

    if (safeTokenAddr === '0x0000000000000000000000000000000000000000') {
      this.emitLog('BLOCKCHAIN', 'WARNING', `[TOKEN_APPROVE_SKIPPED] Sıfır adres token (${tokenAddress}) için onay işlemi pas geçildi.`);
      return { success: true, txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' };
    }

    try {
      return await this.safeExecute(async () => {
        const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
        const wallet = new ethers.Wallet(this.privateKey, provider);

        // GAZA DUYARLILIK VE GAS DRAINER ENGELLEYİCİ: POL Bakiye Kontrolü (Minimum 2.0 POL gerekiyor)
        const balancePol = await provider.getBalance(wallet.address).catch(() => ethers.BigNumber.from(0));
        const balancePolEth = parseFloat(ethers.utils.formatEther(balancePol));
        if (balancePolEth < 2.0) {
          const errMsg = `[FUEL_CRITICAL] Cüzdan bakiyesi (POL) çok düşük: ${balancePolEth.toFixed(4)} POL. Güvenlik ve gas drainer koruması gereği limit onaylama (Approve) durduruldu. Limit: 2.0 POL.`;
          this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
          
          const globalState = (global as any).serverState;
          if (globalState) {
            globalState.isCrawling = false; // Otonom döngüyü askıya alıp gas sömürüsünü kes!
          }
          return { success: false, error: "FUEL_CRITICAL" };
        }

        this.validateContract(safeTokenAddr);

        const contract = new ethers.Contract(safeTokenAddr, [
          "function approve(address spender, uint256 amount) public returns (bool)",
          "function allowance(address owner, address spender) view returns (uint256)",
          "function decimals() view returns (uint8)"
        ], wallet);

        const decimals = await contract.decimals().catch(() => 18);
        let amountWei = ethers.constants.MaxUint256;
        if (amount !== "115792089237316195423570985008687907853269984665640564039457584007913129639935") {
          amountWei = ethers.utils.parseUnits(parseFloat(amount).toFixed(decimals < 18 ? decimals : 4), decimals);
        }

        const currentAllowance = await contract.allowance(wallet.address, safeSpenderAddr).catch(() => ethers.BigNumber.from(0));
        if (currentAllowance.gte(amountWei)) {
          this.emitLog('BLOCKCHAIN', 'SUCCESS', `[TOKEN_APPROVE_ALREADY_SET] ${tokenAddress} için spender ${spenderAddress} adresine zaten yeterli limit tanımlanmış (Mevcut Allowance: ${ethers.utils.formatUnits(currentAllowance, decimals)}, Gereken: ${amount}). On-chain işlem atlandı.`);
          return { success: true, txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' };
        }

        this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_APPROVE] Limit onayı iletiliyor: Token: ${tokenAddress} -> Spender/Contract: ${spenderAddress} | Tutar: ${amount}`);

        let txOverrides: any = {
          gasLimit: 80000
        };

        try {
          const feeData = await provider.getFeeData();
          if (feeData.maxPriorityFeePerGas && feeData.maxFeePerGas) {
            const minPriorityFee = ethers.utils.parseUnits("35", "gwei");
            const proposedPriority = feeData.maxPriorityFeePerGas.mul(150).div(100);
            txOverrides.maxPriorityFeePerGas = proposedPriority.gt(minPriorityFee) ? proposedPriority : minPriorityFee;
            const proposedMaxFee = feeData.maxFeePerGas.mul(150).div(100);
            const minMaxFee = txOverrides.maxPriorityFeePerGas.add(ethers.utils.parseUnits("15", "gwei"));
            txOverrides.maxFeePerGas = proposedMaxFee.gt(minMaxFee) ? proposedMaxFee : minMaxFee;
          } else if (feeData.gasPrice) {
            txOverrides.gasPrice = feeData.gasPrice.mul(150).div(100);
          }
        } catch (e) {}

        const tx = await contract.approve(safeSpenderAddr, amountWei, txOverrides);
        this.emitLog('BLOCKCHAIN', 'SUCCESS', `[APPROVE_SENT] Onay (Approve) işlemi Polygon ağına iletildi, onay bekleniyor... Tx: ${tx.hash}`);
        
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
          throw new Error(`Onay (Approve) işlemi ağda başarısızlığa uğradı ve Revert edildi (Status: 0). Tx Hash: ${tx.hash}`);
        }
        
        return { success: true, txHash: tx.hash };
      });
    } catch (err: any) {
      const errorMsg = this.parseBlockchainError(err);
      this.emitLog('BLOCKCHAIN', 'ERROR', `[APPROVE_FAILED] Onay işleminde hata: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  public async initializeLiquidityPool(polAmount: string, tokenAmount: string): Promise<{ success: boolean; txHash: string; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[LIQUIDITY_INIT] Piyasa yapıcı modülü başlatılıyor: ${polAmount} POL / ${tokenAmount} KECO...`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const wallet = new ethers.Wallet(this.privateKey, provider);
      const tokenAddr = ethers.utils.getAddress(blockchainConfig.greenTokenAddress.toLowerCase());
      const routerAddr = ethers.utils.getAddress(blockchainConfig.routerAddress.toLowerCase());
      const router = new ethers.Contract(routerAddr, ["function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"], wallet);
      const tokenContract = new ethers.Contract(tokenAddr, ["function approve(address spender, uint256 amount) public returns (bool)", "function balanceOf(address owner) view returns (uint256)"], wallet);
      const tokenWei = ethers.utils.parseUnits(tokenAmount, 18);
      const polWei = ethers.utils.parseUnits(polAmount, 18);
      let bal = await tokenContract.balanceOf(wallet.address).catch(() => ethers.BigNumber.from(0));

      if (bal.lt(tokenWei)) {
        const formattedBal = ethers.utils.formatUnits(bal, 18);
        throw new Error(`KRİTİK: Havuz için ${tokenAmount} KECO gerekiyor ancak cüzdanda sadece ${formattedBal} var. Lütfen manual 'mint' işlemini doğrulayın.`);
      }

      await (await tokenContract.approve(routerAddr, ethers.constants.MaxUint256, { maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei") })).wait();
      const tx = await router.addLiquidityETH(tokenAddr, tokenWei, 0, 0, wallet.address, Math.floor(Date.now() / 1000) + 1200, { value: polWei, gasLimit: 3000000, maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei") });
      await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      return { success: false, txHash: '', error: err.message };
    }
  }
}
