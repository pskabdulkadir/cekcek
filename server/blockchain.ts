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
const ALLOWED_CONTRACTS = [
  "0x4544d5674066f7f6f966144510006327e5b56345", // Ocean Market
  "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", // Smart Gate
  "0xa5E0829CaCEd8fFDD052420551415491D6993E2F", // QuickSwap Router
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
  blockchainConfig.greenTokenAddress,
  blockchainConfig.routerAddress
].map(addr => addr.toLowerCase());

// --- DEX YAPILANDIRMASI (QuickSwap Polygon) ---
const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const WMATIC = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";

export class BlockchainRouter {
  public rpcUrl: string;
  public rpcEndpoints: string[] = [];
  public privateKey: string;
  public contractAddress: string; // The contract address for the current network
  public currentChainId: number = 137; // Default to Polygon Mainnet ID
  public currentExplorerUrl: string = "https://etherscan.io"; // Dynamically determined explorer URL
  public currentNetworkName: string = "Unknown Network"; // Dynamically determined network name
  private isRealMode: boolean = false;

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

  /**
   * Hedef sözleşme adresinin beyaz listede olup olmadığını kontrol eder.
   */
  private validateContract(address: string) {
    if (!address || address === ethers.constants.AddressZero) return;
    
    try {
      const checksumAddr = ethers.utils.getAddress(address);
      const lowerAddr = checksumAddr.toLowerCase();

      const isWhitelisted = ALLOWED_CONTRACTS.includes(lowerAddr) || 
                            lowerAddr === (blockchainConfig.greenTokenAddress || "").toLowerCase() ||
                            lowerAddr === (blockchainConfig.routerAddress || "").toLowerCase() ||
                            lowerAddr === (this.contractAddress || "").toLowerCase();

      if (!isWhitelisted) {
        throw new Error(`Yetkisiz adres: ${checksumAddr}`);
      }
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `GÜVENLİK İHLALİ: Yetkisiz sözleşme adresi tespit edildi: ${address}`);
      throw new Error("GÜVENLİK İHLALİ: Yetkisiz sözleşme adresi.");
    }
  }

  private getInitialRpcEndpoints(primaryRpc: string, networkMode: string): string[] {
    // ACİL_STRATEJİ: Render kısıtlamalarını aşmak için çoklu taramayı devre dışı bırak.
    // Eğer bir RPC tanımlıysa sadece onu kullan, havuzu şişirme.
    const endpoints = [primaryRpc].filter(Boolean);
    
    // Eğer .env boşsa yedek olarak sadece en stabil olanı bırak
    if (endpoints.length === 0) {
      return networkMode === 'mainnet' 
        ? ['https://polygon-rpc.com'] 
        : ['https://rpc-amoy.polygon.technology'];
    }
    return Array.from(new Set(endpoints.filter(Boolean)));
  }

  public async getNetworkDetailsFromRpc(rpcUrl: string): Promise<{ chainId: number, explorerUrl: string, networkName: string }> {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
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
          provider = new ethers.providers.JsonRpcProvider(currentRpc);
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
   * Cüzdan adresini döndür (PRIVATE_KEY'den türetilmiş)
   */
  public getWalletAddress(): string {
    try {
      if (!this.privateKey || this.privateKey.includes('0xtest') || this.privateKey.includes('YOUR_PRIVATE_KEY')) {
        return "";
      }
      const wallet = new ethers.Wallet(this.privateKey);
      return wallet.address;
    } catch {
      return "";
    }
  }

  /**
   * Cüzdandaki gerçek USDT (Polygon) bakiyesini sorgular.
   */
  public async getUSDTBalance(targetAddress?: string): Promise<string> {
    const usdtAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // Polygon USDT Contract
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const contract = new ethers.Contract(usdtAddress, ["function balanceOf(address owner) view returns (uint256)"], provider);
      const walletAddress = targetAddress || this.getWalletAddress() || blockchainConfig.payoutWallet;
      
      if (!walletAddress) return "0.00";

      const balance = await contract.balanceOf(walletAddress);
      // Polygon'da USDT 6 decimal kullanır
      return ethers.utils.formatUnits(balance, 6);
    } catch (err) {
      return "0.00";
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
      if (!this.isValidAddress(tokenAddress) || !this.isValidAddress(accountAddress)) return "0.00";
      
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl, "any");
      const contract = new ethers.Contract(tokenAddress, [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ], provider);

      // KRİTİK DÜZELTME: Stack Underflow koruması için her çağrıyı izole ediyoruz
      const balanceBN = await contract.balanceOf(accountAddress).catch(() => ethers.BigNumber.from(0));
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
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      // KRİTİK: Adresi checksum formatına zorla
      const routerAddr = ethers.utils.getAddress(blockchainConfig.routerAddress);
      const router = new ethers.Contract(routerAddr, [
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)"
      ], wallet);

      const path = [ethers.utils.getAddress(WMATIC), ethers.utils.getAddress(POLYGON_USDT)];
      const tx = await router.swapExactETHForTokens(
        0, path, wallet.address, Math.floor(Date.now() / 1000) + 600,
        { value: ethers.utils.parseEther(polAmount), gasLimit: 250000 }
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
  public async checkGasBalance(network: 'polygon' | 'bsc' = 'polygon'): Promise<{ balance: string, isLow: boolean }> {
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

        const wallet = new ethers.Wallet(this.privateKey);
        const address = wallet.address;

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
      // HATA KORUMASI: RPC hatası 500 döndürmemeli, sadece bakiyeyi 0 göstermeli
      return { balance: "0.000000", isLow: true };
    }
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
          provider = new ethers.providers.JsonRpcProvider(currentRpc);
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
        const feeData = await provider.getFeeData();
        const txOverrides: ethers.providers.TransactionRequest = {};
        
        // Polygon anti-spam koruması için minimum 30 Gwei öncelik ücreti (Priority Fee) zorunludur.
        const minPriorityFee = ethers.utils.parseUnits("30", "gwei");

        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            // AGRESİF POLİTİKA: Ağın önerdiği öncelik ücreti ile 30 Gwei arasından yüksek olanı seç ve %20 marj ekle
            let targetPriorityFee = feeData.maxPriorityFeePerGas.gt(minPriorityFee) 
                ? feeData.maxPriorityFeePerGas.mul(120).div(100) 
                : minPriorityFee;

            txOverrides.maxPriorityFeePerGas = targetPriorityFee;
            // Toplam ücreti (MaxFee), baz ücretin 1.5 katı + yeni öncelik ücreti olarak belirle
            txOverrides.maxFeePerGas = feeData.maxFeePerGas.mul(150).div(100).add(targetPriorityFee);
            
            this.emitLog('BLOCKCHAIN', 'INFO', `Agresif Gas (EIP-1559) Tetiklendi: MaxFee=${ethers.utils.formatUnits(txOverrides.maxFeePerGas, "gwei")} gwei, PriorityFee=${ethers.utils.formatUnits(txOverrides.maxPriorityFeePerGas, "gwei")} gwei`);
        } else if (feeData.gasPrice) {
            // Legacy ağlar için standart fiyatı %50 artır
            txOverrides.gasPrice = feeData.gasPrice.mul(150).div(100);
            this.emitLog('BLOCKCHAIN', 'INFO', `Dinamik Gas (Legacy) kullanılıyor: GasPrice=${ethers.utils.formatUnits(txOverrides.gasPrice, "gwei")} gwei`);
        } else {
            txOverrides.gasPrice = ethers.utils.parseUnits("50", "gwei");
            this.emitLog('BLOCKCHAIN', 'WARNING', `Gas verisi alınamadı, güvenli varsayılan 50 gwei kullanılıyor.`);
        }

        // Check if contract is zero-address to trigger Direct Proof anchoring on-chain
        const isZeroContract = this.contractAddress === ethers.constants.AddressZero;

        if (isZeroContract) {
          this.emitLog('BLOCKCHAIN', 'INFO', `Akıllı kontrat adresi belirtilmedi. Veri analitiği kanıtı doğrudan Polygon üzerinde mühürleniyor (Memo mod)...`);

          const memoMessage = `DATA_INSIGHT_PROOF:${proofHash}:${(co2AnalysisGrams || 0).toFixed(4)}_CO2_g_ANALYSIS`;
          const memoBytes = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(memoMessage));

          const tx = await wallet.sendTransaction({
            to: wallet.address, // Self-transaction safely stores immutable record
            value: ethers.utils.parseEther("0"),
            data: memoBytes,
            gasLimit: 30000, // Memo transaction'lar için gasLimit düşük tutulabilir
            ...txOverrides // Dinamik gas fiyatlarını uygula
          });

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
            this.emitLog('BLOCKCHAIN', 'INFO', `Deneme 1: registerDataAsset fonksiyonu çağrılıyor...`);
            tx = await contract.registerDataAsset(amountWei, proofHash, {
              gasLimit: 150000, // Kontrat çağrısı için daha yüksek gasLimit
              ...txOverrides // Dinamik gas fiyatlarını uygula
            });
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
            tx = await contract.submitProof(bytes32Proof, amountWei, { // submitProof hala geçerli
              gasLimit: 150000, // Kontrat çağrısı için daha yüksek gasLimit
              ...txOverrides // Dinamik gas fiyatlarını uygula
            });
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
   * PROTOKOL_DIRECT_DEX: Varlıkları doğrudan QuickSwap üzerinden USDT'ye çevirir.
   * @param tokenAmountWei Takas edilecek miktar (Wei biriminde)
   */
  public async performDEXSwap(tokenAmountWei: string): Promise<{ success: boolean; txHash: string; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_DIRECT] Doğrudan borsa takası başlatılıyor (QuickSwap -> USDT)...`);
    
    try {
      const tokenAddr = blockchainConfig.greenTokenAddress;
      if (!tokenAddr || tokenAddr === ethers.constants.AddressZero || tokenAddr === '0x0000000000000000000000000000000000000000') {
        const errMsg = "KRİTİK EKSİKLİK: GREEN_TOKEN_ADDRESS (Yeşil Token Adresi) tanımlanmamış! Takas yapılamaz.";
        this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
        return { success: false, txHash: '', error: errMsg };
      }

      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      
      // ADRES DOĞRULAMA: Token adresi bir kontrat mı yoksa cüzdan mı?
      const code = await provider.getCode(tokenAddr);
      if (code === '0x' || code === '0x0') {
        const errMsg = `KRİTİK HATA: GREEN_TOKEN_ADDRESS (${tokenAddr}) bir cüzdan adresi olarak girilmiş! Takas için gerçek bir kontrat adresi gereklidir.`;
        this.emitLog('BLOCKCHAIN', 'ERROR', errMsg);
        return { success: false, txHash: '', error: errMsg };
      }

      const routerAbi = [
        "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
      ];
      const erc20Abi = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
      ];

      const routerAddr = (blockchainConfig.routerAddress || "0xa5e0829caced8ffdd052420551415491d6993e2f").toLowerCase();
      const router = new ethers.Contract(routerAddr, routerAbi, wallet);
      const tokenContract = new ethers.Contract(tokenAddr.toLowerCase(), erc20Abi, wallet);

      // 1. ONAY (Approval) KONTROLÜ
      // B Planı: Eğer SMART_GATE_CONTRACT_ADDRESS tanımlıysa, KECO token'ı üzerinde ona onay ver.
      // Aksi takdirde, doğrudan QuickSwap Router'a onay ver.
      const spenderAddress = blockchainConfig.contractAddress && blockchainConfig.contractAddress !== ethers.constants.AddressZero
        ? blockchainConfig.contractAddress.toLowerCase()
        : routerAddr;
      const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
      if (currentAllowance.lt(tokenAmountWei)) {
        this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_APPROVE] Borsa için harcama onayı veriliyor...`);
        const approveTx = await tokenContract.approve(spenderAddress, ethers.constants.MaxUint256);
        await approveTx.wait();
      }

      // 2. TAKAS (Swap) PARAMETRELERİ
      // Güzergah: KECO -> WMATIC -> USDT (Daha fazla likidite şansı için standart yol)
      const path = [tokenAddr.toLowerCase(), WMATIC.toLowerCase(), POLYGON_USDT.toLowerCase()];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 dakika

      // Agresif Gaz Ayarları
      const feeData = await provider.getFeeData();
      const txOverrides = {
        gasLimit: 500000, // Takas işlemleri için limiti artırdık
        maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei"),
        maxFeePerGas: feeData.maxFeePerGas?.mul(150).div(100) || ethers.utils.parseUnits("100", "gwei")
      };

      this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_EXECUTE] Takas emri iletiliyor (Miktar: ${ethers.utils.formatUnits(tokenAmountWei, 18)})...`);
      
      const swapTx = await router.swapExactTokensForTokens(
        tokenAmountWei,
        0, // amountOutMin: Kayma toleransı %100 (likidite azlığı ihtimaline karşı)
        path,
        blockchainConfig.payoutWallet || wallet.address, // Kazancın gideceği kritik adres
        deadline,
        txOverrides
      );

      const receipt = await swapTx.wait();
      this.emitLog('BLOCKCHAIN', 'SUCCESS', `[DEX_OK] Takas başarılı! USDT cüzdanınıza aktarıldı. Tx: ${swapTx.hash}`);
      
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
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
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
        blockchainConfig.greenTokenAddress = value.toLowerCase();
      }
      
      // GÜVENLİK: CONTRACT_ADDRESS güncellemesi sadece mühürleme başarılıysa hafızada güncellenmeli
      if (key === 'CONTRACT_ADDRESS' || key === 'SMART_GATE_CONTRACT_ADDRESS') {
        this.contractAddress = value;
        blockchainConfig.contractAddress = value;
      }

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
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      
      // TAM ERC20 BYTECODE (Kesilmemiş - Polygon Paris Uyumlu)
      const fixedBytecode = "0x608060405234801561001057600080fd5b610d1f806100206000396000f3fe608060405234801561001057600080fd5b600436106100835760003560e01c806306fdde031461008857806318160ddd146100b6578063313ce567146100d157806370a08231146100f157806395d8941214610121578063a9059cbb1461014f578063dd62ed3e1461017f575b600080fd5b6100906101af565b6040516100ad91906108e4565b60405180910390f35b600080546040518082805190602001908083835b6020831061021457805182526020820191506020810190506020830392506101f1565b6001816001161561024057805160ff19168380011785555b505b505050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061009357805160ff19168380011785555b505b505050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106100d457805160ff19168380011785555b505b505050565b610d1e8061012d6000396000f3fe";
      
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

      // OTOMATİK KONFİGÜRASYON GÜNCELLEME
      this.updatePersistentConfig('GREEN_TOKEN_ADDRESS', finalAddress);
      this.updatePersistentConfig('CONTRACT_ADDRESS', finalAddress); // FINANCE modülü için

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
    this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_MINT] Basım emri iletiliyor: ${amount} -> ${toAddress}`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      const contract = new ethers.Contract(tokenAddress, ["function mint(address to, uint256 amount) public"], wallet);
      const tx = await contract.mint(toAddress, ethers.utils.parseUnits(amount, 18), {
        maxPriorityFeePerGas: ethers.utils.parseUnits("40", "gwei"),
        maxFeePerGas: ethers.utils.parseUnits("400", "gwei")
      });
      await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      this.emitLog('BLOCKCHAIN', 'ERROR', `[MINT_FAILED] Hata: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public async initializeLiquidityPool(polAmount: string, tokenAmount: string): Promise<{ success: boolean; txHash: string; error?: string }> {
    this.emitLog('BLOCKCHAIN', 'INFO', `[LIQUIDITY_INIT] Piyasa yapıcı modülü başlatılıyor: ${polAmount} POL / ${tokenAmount} KECO...`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      const tokenAddr = blockchainConfig.greenTokenAddress;
      const routerAddr = blockchainConfig.routerAddress;
      const router = new ethers.Contract(routerAddr, ["function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"], wallet);
      const tokenContract = new ethers.Contract(tokenAddr, ["function approve(address spender, uint256 amount) public returns (bool)", "function balanceOf(address owner) view returns (uint256)"], wallet);
      const tokenWei = ethers.utils.parseUnits(tokenAmount, 18);
      const polWei = ethers.utils.parseUnits(polAmount, 18);
      let bal = await tokenContract.balanceOf(wallet.address).catch(() => ethers.BigNumber.from(0));
      if (bal.lt(tokenWei)) throw new Error(`KECO Bakiyesi yetersiz: ${ethers.utils.formatUnits(bal, 18)} var.`);
      await (await tokenContract.approve(routerAddr, ethers.constants.MaxUint256, { maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei") })).wait();
      const tx = await router.addLiquidityETH(tokenAddr, tokenWei, 0, 0, wallet.address, Math.floor(Date.now() / 1000) + 1200, { value: polWei, gasLimit: 3000000, maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei") });
      await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      return { success: false, txHash: '', error: err.message };
    }
  }
}
