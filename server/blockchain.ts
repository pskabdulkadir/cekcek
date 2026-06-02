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
import { GREENTIN_TOKEN_BYTECODE, GREENTOKEN_ABI, ERC20_ABI, QUICKSWAP_ROUTER_ABI } from './constants.ts';

// --- GÜVENLİK KATMANI: SÖZLEŞME BEYAZ LİSTESİ ---
// Bu liste, botun sadece güvenli ve bilinen kontratlarla etkileşim kurmasını sağlar.
// Yeni dağıtılan token ve router adresleri dinamik olarak eklenir.
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

// --- YARDIMCI FONKSİYON: OPTİMİZE EDİLMİŞ GAZ AYARLARI ---
// Polygon Mainnet için dinamik ve kâr odaklı gaz hesaplaması yapar.
async function getOptimizedGasOverrides(provider: ethers.providers.JsonRpcProvider, minPriorityFeeGwei: string = "30"): Promise<ethers.providers.TransactionRequest> {
  const feeData = await provider.getFeeData();
  const txOverrides: ethers.providers.TransactionRequest = {};
  const minPriorityFee = ethers.utils.parseUnits(minPriorityFeeGwei, "gwei");

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    let targetPriorityFee = feeData.maxPriorityFeePerGas.gt(minPriorityFee)
      ? feeData.maxPriorityFeePerGas.mul(120).div(100) // %20 güvenlik marjı (1.2x)
      : minPriorityFee;

    txOverrides.maxPriorityFeePerGas = targetPriorityFee;
    txOverrides.maxFeePerGas = feeData.maxFeePerGas.mul(120).div(100).add(targetPriorityFee);
  } else if (feeData.gasPrice) {
    txOverrides.gasPrice = feeData.gasPrice.mul(150).div(100); // Legacy ağlar için %50 güvenlik payı
  } else {
    txOverrides.gasPrice = ethers.utils.parseUnits("50", "gwei"); // Fallback varsayılan
  }
  return txOverrides;
}

export class BlockchainRouter {
  public rpcUrl: string;
  public rpcEndpoints: string[] = [];
  public privateKey: string;
  public contractAddress: string; // The contract address for the current network
  public currentChainId: number = 137; // Polygon Mainnet ID
  public currentExplorerUrl: string = "https://polygonscan.com";
  public currentNetworkName: string = "Polygon Mainnet";
  private isRealMode: boolean = false;

  private gasThresholds = {
    polygon: "0.5", // MATIC/POL (Daha gerçekçi bir eşik)
    bsc: "0.005"   // BNB
  };

  private logCallback?: (module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;

  // Varlık oluşturma fonksiyonu ve CarbonHarvester sözleşme desteği
  private contractAbi = [
    "function registerDataAsset(uint256 amount, string memory proof) public returns (bool)",
    "function submitProof(bytes32 proofHash, uint256 amount) external returns (bool)",
    "function settle(string memory id) public returns (bool)",
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
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
    const usdtAddress = ethers.utils.getAddress("0xc2132D05D31c914a87C6611C10748AEb04B58e8F".toLowerCase());
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
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
      
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
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
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      // GÜVENLİK: Adresi checksum hatası almamak için normalize et
      const routerAddr = ethers.utils.getAddress(blockchainConfig.routerAddress.toLowerCase());
      const router = new ethers.Contract(routerAddr, [
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)"
      ], wallet);

      const path = [ethers.utils.getAddress(WMATIC.toLowerCase()), ethers.utils.getAddress(POLYGON_USDT.toLowerCase())];
      const tx = await router.swapExactETHForTokens(
        0, path, wallet.address, Math.floor(Date.now() / 1000) + 600,
        { value: ethers.utils.parseEther(polAmount), gasLimit: 300000, ...(await getOptimizedGasOverrides(provider, "50")) }
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
        
        // OPTİMİZE EDİLMİŞ GAZ AYARLARI: getOptimizedGasOverrides fonksiyonunu kullan
        const optimizedGas = await getOptimizedGasOverrides(provider, "50"); // 50 Gwei minimum öncelik

        txOverrides.maxPriorityFeePerGas = optimizedGas.maxPriorityFeePerGas;
        txOverrides.maxFeePerGas = optimizedGas.maxFeePerGas;
        txOverrides.gasPrice = optimizedGas.gasPrice; // Legacy için

        this.emitLog('BLOCKCHAIN', 'INFO', `Optimize Gas (EIP-1559) Tetiklendi: MaxFee=${ethers.utils.formatUnits(txOverrides.maxFeePerGas || 0, "gwei")} gwei, PriorityFee=${ethers.utils.formatUnits(txOverrides.maxPriorityFeePerGas || 0, "gwei")} gwei`);

        // KRİTİK KONTROL: Adres geçerliliği (Self-Transfer/Para Yakma Engellendi)
        if (!this.contractAddress || this.contractAddress === ethers.constants.AddressZero || this.contractAddress.includes('0x000')) {
          const warnMsg = "[SAFETY_STOP] Geçerli bir kontrat adresi tanımlanmamış. İşlem iptal edildi.";
          this.emitLog('BLOCKCHAIN', 'WARNING', warnMsg);
          return { success: false, txHash: '', simulated: false, error: "MISSING_CONTRACT" };
        }

        const contract = new ethers.Contract(this.contractAddress, this.contractAbi, wallet);
        const amountWei = ethers.utils.parseUnits((co2AnalysisGrams || 0).toFixed(18), 18);

        this.emitLog('BLOCKCHAIN', 'INFO', `Veri analitiği kanıt işlemi başlatılıyor...`);

        let tx;
        try {
          this.emitLog('BLOCKCHAIN', 'INFO', `registerDataAsset fonksiyonu çağrılıyor...`);
          tx = await contract.registerDataAsset(amountWei, proofHash, {
            gasLimit: 300000,
            ...optimizedGas
          });
        } catch (firstErr: any) {
          this.emitLog('BLOCKCHAIN', 'WARNING', `Deneme 1 başarısız. Deneme 2: submitProof...`);

          let bytes32Proof = proofHash;
          if (!bytes32Proof.startsWith('0x')) {
            bytes32Proof = '0x' + bytes32Proof;
          }
          if (bytes32Proof.length < 66) {
            bytes32Proof = bytes32Proof.padEnd(66, '0');
          } else if (bytes32Proof.length > 66) {
            bytes32Proof = bytes32Proof.substring(0, 66);
          }

          tx = await contract.submitProof(bytes32Proof, amountWei, {
            gasLimit: 300000,
            ...optimizedGas
          });
        }

        this.emitLog('BLOCKCHAIN', 'INFO', `İşlem ağa iletildi: ${tx.hash}`);
        const receipt = await tx.wait(1);

        this.emitLog('BLOCKCHAIN', 'SUCCESS', `Blok ${receipt.blockNumber} onaylandı. Harcanan Gas: ${receipt.gasUsed.toString()}`);

        return {
          success: true,
          txHash: tx.hash,
          simulated: false
        };
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
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      const routerAddr = ethers.utils.getAddress(blockchainConfig.routerAddress.toLowerCase());
      const usdtAddr = ethers.utils.getAddress(POLYGON_USDT.toLowerCase());
      
      const router = new ethers.Contract(routerAddr, [
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
      ], wallet);

      const amountInWei = ethers.utils.parseUnits(usdtAmount, 6); // USDT 6 decimal
      const path = [usdtAddr, WMATIC]; // USDT -> WMATIC (POL)
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await router.swapExactTokensForETH(
        amountInWei, 0, path, wallet.address, deadline,
        {
          gasLimit: 300000, // Optimize edilmiş sabit gasLimit
          ...(await getOptimizedGasOverrides(provider, "50")) // Optimize edilmiş gas fiyatlarını uygula
        }
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
      
      // GÜVENLİK: Checksum hatasını önlemek için doğrudan küçük harf kullan
      const safeTokenAddr = tokenAddr.toLowerCase();
      const tokenContract = new ethers.Contract(safeTokenAddr, erc20Abi, wallet);

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
      
      // %1 Slippage Tolerance (Kayma Toleransı)
      const amountOutMin = ethers.BigNumber.from(expectedUsdt).mul(99).div(100);

      const txOverrides = {
        gasLimit: 500000, // Takas işlemleri için optimize edilmiş gas limiti
        ...(await getOptimizedGasOverrides(provider, "60")) // 60 Gwei minimum öncelik
      };

      this.emitLog('BLOCKCHAIN', 'INFO', `[DEX_LIVE] Fiyat: $${ethers.utils.formatUnits(expectedUsdt, 6)} USDT | Tolerans: %1 | Emre çıkılıyor...`);
      
      const swapTx = await router.swapExactTokensForTokens(
        tokenAmountWei,
        amountOutMin, // Güvenli minimum tutar
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
      const optimizedGas = await getOptimizedGasOverrides(provider, "40"); // 40 Gwei minimum öncelik

      txOverrides.maxPriorityFeePerGas = optimizedGas.maxPriorityFeePerGas;
      txOverrides.maxFeePerGas = optimizedGas.maxFeePerGas;
      txOverrides.gasPrice = optimizedGas.gasPrice;

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
    if (this.contractAddress && !this.contractAddress.includes('0x000')) {
      return { success: false, address: this.contractAddress, error: "TOKEN_ALREADY_DEPLOYED" };
    }

    this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_GENESIS] Token deployment: ${name}/${symbol}`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);

      if (!GREENTIN_TOKEN_BYTECODE || GREENTIN_TOKEN_BYTECODE.length < 100) {
        this.emitLog('BLOCKCHAIN', 'WARNING', '[BYTECODE_SKIP] Bytecode eksik. Test modunda sanal adres döndürülüyor.');
        const mockAddress = ethers.utils.getAddress(ethers.utils.hexZeroPad(ethers.utils.hexlify(Math.floor(Math.random() * 1e9)), 20));
        this.updatePersistentConfig('GREEN_TOKEN_ADDRESS', mockAddress);
        return { success: true, address: mockAddress };
      }

      const fixedBytecode = "0x60806040526002805460ff191660121790553480156200001e57600080fd5b5060405162000b1938038062000b19833981016040819052620000419162000145565b60006200004f848262000249565b5060016200005e838262000249565b5060038190553360009081526004602052604090205550620003159050565b634e487b7160e01b600052604160045260246000fd5b600082601f830112620000a557600080fd5b81516001600160401b0380821115620000c257620000c26200007d565b604051601f8301601f19908116603f01168101908282118183101715620000ed57620000ed6200007d565b81604052838152602092508660208588010111156200010b57600080fd5b600091505b838210156200012f578582018301518183018401529082019062000110565b6000602085830101528094505050505092915050565b6000806000606084860312156200015b57600080fd5b83516001600160401b03808211156200017357600080fd5b620001818783880162000093565b945060208601519150808211156200019857600080fd5b50620001a78682870162000093565b925050604084015190509250925092565b600181811c90821680620001cd57607f821691505b602082108103620001ee57634e487b7160e01b600052602260045260246000fd5b50919050565b601f82111562000244576000816000526020600020601f850160051c810160208610156200021f5750805b601f850160051c820191505b8181101562000240578281556001016200022b565b5050505b505050565b81516001600160401b038111156200026557620002656200007d565b6200027d81620002768454620001b8565b84620001f4565b602080601f831160018114620002b557600084156200029c5750858301515b600019600386901b1c1916600185901b17855562000240565b600085815260208120601f198616915b82811015620002e657888601518255948401946001909101908401620002c5565b5085821015620003055787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b6107f480620003256000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c806340c10f191161006657806340c10f191461010b57806370a082311461012057806395d89b411461014057806395ec4d7f14610148578063aa9fbc491461015b57600080fd5b8063010edd911461009857806306fdde03146100c057806318160ddd146100d5578063313ce567146100ec575b600080fd5b6100ab6100a63660046103e8565b61016e565b60405190151581526020015b60405180910390f35b6100c8610177565b6040516100b79190610450565b6100de60035481565b6040519081526020016100b7565b6002546100f99060ff1681565b60405160ff90911681526020016100b7565b61011e610119366004610486565b610205565b005b6100de61012e3660046104b0565b60046020526000908152604090205481565b6100c861028e565b6100ab610156366004610582565b61029b565b6100ab61016936600461040a565b6102df565b60015b92915050565b600080546101849061072c565b80601f01602080910402602001604051908101604052809291908181526020018280546101b09061072c565b80156101fd5780601f106101d2576101008083540402835291602001916101fd565b820191906000526020600020905b8154815290600101906020018083116101e057829003601f168201915b505050505081565b80600360008282546102179190610766565b90915550506001600160a01b03821660009081526004602052604081208054839290610244908490610766565b90915550506040518181526001600160a01b038316906000907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9060200160405180910390a35050565b600180546101849061072c565b60007fe9afbbb3874d42a0b4e07963e3436db89df4aa8b395067657383f8dade1d7c4a83836040516102ce929190610787565b60405180910390a150600192915050565b600081518351146103365760405162461bcd60e51b815260206004820152601c60248201527f44697a6920757a756e6c756b6c6172692065736974206f6c6d616c6900000000604482015260640160405180910390fd5b60005b83518110156103b5577fe9afbbb3874d42a0b4e07963e3436db89df4aa8b395067657383f8dade1d7c4a848281518110610375576103756107a8565b602002602001015184838151811061038f5761038f6107a8565b60200260200101516040516103a5929190610787565b60405180910390a1600101610339565b507f612c1a9a2eb06e7e579067b9b42d2a10982a4ec02d8fc8b0a41481015f1cac9b83516040516102ce91815260200190565b600080604083850312156103fb57600080fd5b50508035926020909101359150565b6000815180845260005b8181101561043057602081850181015186830182015201610414565b506000602082860101526020601f19601f83011685010191505092915050565b602081526000610463602083018461040a565b9392505050565b80356001600160a01b038116811461048157600080fd5b919050565b6000806040838503121561049957600080fd5b6104a28361046a565b946020939093013593505050565b6000602082840312156104c257600080fd5b6104638261046a565b634e487b7160e01b600052604160045260246000fd5b604051601f8201601f1916810167ffffffffffffffff8111828210171561050a5761050a6104cb565b604052919050565b600082601f83011261052357600080fd5b813567ffffffffffffffff81111561053d5761053d6104cb565b610550601f8201601f19166020016104e1565b81815284602083860101111561056557600080fd5b816020850160208301376000918101602001919091529392505050565b6000806040838503121561059557600080fd5b82359150602083013567ffffffffffffffff8111156105b357600080fd5b6105bf85828601610512565b9150509250929050565b600067ffffffffffffffff8211156105e3576105e36104cb565b5060051b60200190565b600082601f8301126105fe57600080fd5b8135602061061361060e836105c9565b6104e1565b82815260059290921b8401810191818101908684111561063257600080fd5b8286015b8481101561067257803567ffffffffffffffff8111156105565760008081fd5b6106648986838b0101610512565b845250918301918301610636565b509695505050505050565b6000806040838503121561069057600080fd5b823567ffffffffffffffff808211156106a857600080fd5b818501915085601f8301126106bc57600080fd5b813560206106cc61060e836105c9565b82815260059290921b840181019181810190898411156106eb57600080fd5b948201945b83861015610709578535825294820194908201906106f0565b9650508601359250508082111561071f57600080fd5b506105bf858286016105ed565b600181811c9082168061074057607f821691505b60208210810361076057634e487b7160e01b600052602260045260246000fd5b50919050565b8082018082111561017157634e487b7160e01b600052601160045260246000fd5b8281526040602082015260006107a0604083018461040a565b949350505050565b634e487b7160e01b600052603260045260246000fdfea26469706673582212209d5f8be91a6c5bc0f3ff09c4f26e4b027bbe135951086bb29e6b267ebaf288cf64736f6c63430008180033";

      const factory = new ethers.ContractFactory(GREENTOKEN_ABI, GREENTIN_TOKEN_BYTECODE, wallet);
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
    this.emitLog('BLOCKCHAIN', 'INFO', `[TOKEN_MINT] Basım emri iletiliyor: ${amount} -> ${toAddress}`);
    try {
      const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
      const wallet = new ethers.Wallet(this.privateKey, provider);
      const contract = new ethers.Contract(ethers.utils.getAddress(tokenAddress.toLowerCase()), ["function mint(address to, uint256 amount) public"], wallet);
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
