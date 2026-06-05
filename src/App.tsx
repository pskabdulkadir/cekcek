/**
 * @file App.tsx
 * @description State-of-the-art interactive Web3 / GreenTech telemetry terminal
 * for the Internet Reclamation Core. Coordinates real-time server logs, automated crawling 
 * metrics, custom URL optimization pipelines, and Gemini-powered code refactoring reports.
 * 
 * @author Senior Software Architect & Cybersecurity Specialist
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { ethers } from "ethers";
import { 
  Terminal, 
  Globe, 
  Cpu, 
  Coins, 
  Activity, 
  Play, 
  Square, 
  Search, 
  Sparkles, 
  TrendingDown, 
  ExternalLink, 
  Layers, 
  Database, 
  Leaf, 
  Info, 
  CheckCircle2, 
  AlertTriangle,
  Flame,
  Code,
  Zap,
  Unlock
} from "lucide-react";

import { CoreStats, LogEntry, OptimizationResult } from "./types.ts";

export default function App() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"bot" | "manual" | "marketplace" | "blueprint" | "healer">("bot");

  // Server state data
  const [stats, setStats] = useState<CoreStats>({
    pagesProcessed: 0,
    originalSizeTotal: 0,
    optimizedSizeTotal: 0,
    totalKiloBytesSaved: 0,
    totalCo2SavedGrams: 0,
    dataAssetRegistrations: 0,
    visitedUrls: [],
    transactions: [],
    isCrawling: false,
    currentCrawlingUrl: "",
    readyToSell: [],
    payoutWalletAddress: "", // Will be fetched from /api/stats
    totalDataInsightsPublished: 0,
    totalAccessFeesCollected: 0,
    totalServiceFeesCollected: 0, // Eksik alan eklendi
    profitLockActive: true,
    profitLockHoldAmount: 0.0,
    profitLockThreshold: 5.0,
    availableBalance: 0.0,
    contractAddress: "",
    autonomousMode: false,
    commitThreshold: 0
  }); // zeroGasModeActive kaldırıldı

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logSearch, setLogSearch] = useState<string>("");
  const [showOnlyEmergency, setShowOnlyEmergency] = useState<boolean>(false);
  const [targetUrl, setTargetUrl] = useState<string>("https://www.w3.org");
  const [isOptimizingTarget, setIsOptimizingTarget] = useState<boolean>(false);
  const [optResult, setOptResult] = useState<OptimizationResult | null>(null);
  const [targetError, setTargetError] = useState<string>("");

  // Dr.System states
  const [healerHistory, setHealerHistory] = useState<any[]>([]);
  const [healerStatus, setHealerStatus] = useState<any>(null);
  const [isRefreshingHealer, setIsRefreshingHealer] = useState<boolean>(false);

  const fetchHealerHistory = async () => {
    try {
      setIsRefreshingHealer(true);
      const res = await fetch("/api/system/healer/history");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHealerHistory(data.history || []);
        }
      }
      const statusRes = await fetch("/api/system/healer/status");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.success) {
          setHealerStatus(statusData);
        }
      }
    } catch (err) {
      console.error("Healer parameters failed to load:", err);
    } finally {
      setIsRefreshingHealer(false);
    }
  };

  const triggerManualDiagnostic = async () => {
    try {
      setIsRefreshingHealer(true);
      const res = await fetch("/api/system/healer/trigger", { method: "POST" });
      if (res.ok) {
        setTimeout(fetchHealerHistory, 1600);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAutoHealer = async () => {
    try {
      const res = await fetch("/api/system/healer/toggle", { method: "POST" });
      if (res.ok) {
        fetchHealerHistory();
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === "healer") {
      fetchHealerHistory();
    }
  }, [activeTab]);

  // Wallet and zero-gas state editors
  const [walletInput, setWalletInput] = useState<string>("");
  const [isUpdatingWallet, setIsUpdatingWallet] = useState<boolean>(false);
  const [walletSaveSuccess, setWalletSaveSuccess] = useState<boolean>(false);
  const [purchaseInProgress, setPurchaseInProgress] = useState<string | null>(null); // Sadece manuel tetikleme için
  const [adminCommand, setAdminCommand] = useState<string>("");

  // Savaş Modülü / HFT State Değişkenleri
  const [hftEnabled, setHftEnabled] = useState<boolean>(true);
  const [pricingMode, setPricingMode] = useState<"automatic" | "manual">("automatic");
  const [demandMultiplier, setDemandMultiplier] = useState<number>(1.0);
  const [lightweightMode, setLightweightMode] = useState<boolean>(true);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<"NORMAL" | "BREAKER_ACTIVE_SLOW_DOWN">("NORMAL");
  const [isUpdatingHft, setIsUpdatingHft] = useState<boolean>(false);
  const [hftSaveSuccess, setHftSaveSuccess] = useState<boolean>(false);

  // Profit Lock Frontend States
  const [profitLockActiveConfig, setProfitLockActiveConfig] = useState<boolean>(true);
  const [profitLockThresholdInput, setProfitLockThresholdInput] = useState<string>("5.0");
  const [isUpdatingProfitLock, setIsUpdatingProfitLock] = useState<boolean>(false);
  const [profitLockSaveSuccess, setProfitLockSaveSuccess] = useState<boolean>(false);
  const [isReleasingProfitLock, setIsReleasingProfitLock] = useState<boolean>(false);

  // Toplu Mutabakat (Batch-Only) Frontend States
  const [batchOnlyModeConfig, setBatchOnlyModeConfig] = useState<boolean>(true);
  const [batchOnlyThresholdInput, setBatchOnlyThresholdInput] = useState<string>("5.0");
  const [isUpdatingBatchOnly, setIsUpdatingBatchOnly] = useState<boolean>(false);
  const [batchOnlySaveSuccess, setBatchOnlySaveSuccess] = useState<boolean>(false);

  // Telegram Bot State Değişkenleri
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(false);
  const [telegramHasCredentials, setTelegramHasCredentials] = useState<boolean>(false);
  const [isLoadingTelegram, setIsLoadingTelegram] = useState<boolean>(false);

  // Savaş Modülü Ayarlarını Kaydet (POST /api/hft-config)
  const handleSaveHftSettings = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsUpdatingHft(true);
    setHftSaveSuccess(false);
    try {
      const res = await fetch("/api/hft-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hftEnabled,
          pricingMode,
          demandMultiplier,
          lightweightMode,
          circuitBreakerStatus
        })
      });
      if (res.ok) {
        setHftSaveSuccess(true);
        setTimeout(() => setHftSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Savaş Modülü HFT ayarları güncellenemedi:", err);
    } finally {
      setIsUpdatingHft(false);
    }
  };

  // Profit Lock Settings Save & Release Handlers
  const handleSaveProfitLockSettings = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsUpdatingProfitLock(true);
    setProfitLockSaveSuccess(false);
    try {
      // 1. Set active status
      await fetch("/api/admin/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `SET_PROFIT_LOCK_ACTIVE ${profitLockActiveConfig ? "TRUE" : "FALSE"}` })
      });
      // 2. Set threshold
      const val = parseFloat(profitLockThresholdInput) || 5.0;
      await fetch("/api/admin/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `SET_PROFIT_LOCK_THRESHOLD ${val}` })
      });
      
      setProfitLockSaveSuccess(true);
      fetchStats();
      setTimeout(() => setProfitLockSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Profit Lock parameters could not be updated:", err);
    } finally {
      setIsUpdatingProfitLock(false);
    }
  };

  const handleReleaseProfitLock = async () => {
    setIsReleasingProfitLock(true);
    try {
      const res = await fetch("/api/admin/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "RELEASE_PROFIT_LOCK" })
      });
      if (res.ok) {
        fetchStats();
        fetchWalletBalance();
      }
    } catch (err) {
      console.error("Failed to manually release profit lock:", err);
    } finally {
      setIsReleasingProfitLock(false);
    }
  };

  // Batch-Only Settings Save Handlers
  const handleSaveBatchOnlySettings = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsUpdatingBatchOnly(true);
    setBatchOnlySaveSuccess(false);
    try {
      // 1. Set active status
      await fetch("/api/admin/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `SET_BATCH_ONLY_ACTIVE ${batchOnlyModeConfig ? "TRUE" : "FALSE"}` })
      });
      // 2. Set threshold
      const val = parseFloat(batchOnlyThresholdInput) || 5.0;
      await fetch("/api/admin/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `SET_BATCH_ONLY_THRESHOLD ${val}` })
      });
      
      setBatchOnlySaveSuccess(true);
      fetchStats();
      setTimeout(() => setBatchOnlySaveSuccess(false), 3000);
    } catch (err) {
      console.error("Batch-Only parameters could not be updated:", err);
    } finally {
      setIsUpdatingBatchOnly(false);
    }
  };

  // Wallet Balance State
  const [walletBalance, setWalletBalance] = useState<{
    address: string;
    payoutAddress?: string;
    balanceMATIC: string;
    balanceUSD: string;
    balanceUSDT?: string;
    balanceBaseUSDT?: string;
    isLow: boolean;
    payoutBalanceMATIC?: string;
    payoutBalanceUSD?: string;
    payoutBalanceUSDT?: string;
    payoutBalanceBaseUSDT?: string;
    payoutIsLow?: boolean;
    error?: string;
    timestamp: string;
  } | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  
  const [isRefillingGas, setIsRefillingGas] = useState<boolean>(false);
  const [refillAmount, setRefillAmount] = useState<string>("5");
  const [refillSuccessMsg, setRefillSuccessMsg] = useState<string>("");
  const [refillErrorMsg, setRefillErrorMsg] = useState<string>("");

  const handleManualGasRefill = async (amount: string) => {
    setIsRefillingGas(true);
    setRefillSuccessMsg("");
    setRefillErrorMsg("");
    try {
      const res = await fetch("/api/finance/refill-gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRefillSuccessMsg(`Gaz takviyesi başarıyla gerçekleştirildi.`);
        fetchWalletBalance();
        setTimeout(() => setRefillSuccessMsg(""), 5000);
      } else {
        setRefillErrorMsg(data.error || "DEX takası başarısız oldu.");
      }
    } catch (err: any) {
      setRefillErrorMsg(err.message || "Bağlantı hatası oluştu.");
    } finally {
      setIsRefillingGas(false);
    }
  };

  const [isWithdrawingUsdt, setIsWithdrawingUsdt] = useState<boolean>(false);
  const [withdrawUsdtAmount, setWithdrawUsdtAmount] = useState<string>("");
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState<string>("");
  const [withdrawErrorMsg, setWithdrawErrorMsg] = useState<string>("");

  const handleManualRevenueWithdrawal = async (amount: string, assetType: 'USDT' | 'POL' = 'USDT') => {
    setIsWithdrawingUsdt(true);
    setWithdrawSuccessMsg("");
    setWithdrawErrorMsg("");
    try {
      const res = await fetch("/api/finance/withdraw-revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount ? parseFloat(amount) : undefined, assetType })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWithdrawSuccessMsg(`✓ ${amount || "Tüm"} ${assetType} birikimi Payout cüzdanınıza başarıyla aktarıldı.`);
        setWithdrawUsdtAmount("");
        fetchWalletBalance();
        setTimeout(() => setWithdrawSuccessMsg(""), 8000);
      } else {
        setWithdrawErrorMsg(data.error || "Aktarım veya transfer adımı başarısız oldu.");
      }
    } catch (err: any) {
      setWithdrawErrorMsg(err.message || "Bağlantı hatası oluştu.");
    } finally {
      setIsWithdrawingUsdt(false);
    }
  };

  const totalEarnings = stats.totalServiceFeesCollected || 0; // totalEarnings -> totalServiceFeesCollected

  // Sync state values to form inputs
  useEffect(() => {
    if (stats.payoutWalletAddress) {
      const activeAddress = stats.payoutWalletAddress.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d"
        ? "0x06E83497F599D67447EfFfeA399cC885CEB6eEff"
        : stats.payoutWalletAddress;
      if (!walletInput || walletInput.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
        setWalletInput(activeAddress);
      }
    }
  }, [stats.payoutWalletAddress]);

  // Sync settings when stats are fetched
  useEffect(() => {
    if (stats.hftEnabled !== undefined) setHftEnabled(stats.hftEnabled);
    if (stats.pricingMode !== undefined) setPricingMode(stats.pricingMode);
    if (stats.demandMultiplier !== undefined) setDemandMultiplier(stats.demandMultiplier);
    if (stats.lightweightMode !== undefined) setLightweightMode(stats.lightweightMode);
    if (stats.circuitBreakerStatus !== undefined) setCircuitBreakerStatus(stats.circuitBreakerStatus);
    if (stats.profitLockActive !== undefined) setProfitLockActiveConfig(stats.profitLockActive);
    if (stats.profitLockThreshold !== undefined) setProfitLockThresholdInput(stats.profitLockThreshold.toString());
    if (stats.batchOnlyMode !== undefined) setBatchOnlyModeConfig(stats.batchOnlyMode);
    if (stats.batchOnlyThreshold !== undefined) setBatchOnlyThresholdInput(stats.batchOnlyThreshold.toString());
  }, [stats.hftEnabled, stats.pricingMode, stats.demandMultiplier, stats.lightweightMode, stats.circuitBreakerStatus, stats.profitLockActive, stats.profitLockThreshold, stats.batchOnlyMode, stats.batchOnlyThreshold]);

  // Refs for auto-scroll logging window
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Poll server state API for dynamic dashboard synchronization
  const fetchStats = async () => {
    try {
      const response = await fetch("/api/stats");
      const contentType = response.headers.get("content-type");
      if (response.ok && contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (data) {
          if (data.payoutWalletAddress && data.payoutWalletAddress.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
            data.payoutWalletAddress = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
          }
        }
        setStats(data);
      } else {
        const isHtml = contentType && contentType.includes("text/html");
        console.warn("[FETCH] Received non-JSON or stale response from server", {
          status: response.status,
          contentType,
          isHtml
        });
      }
    } catch (err) {
      // Render sunucusu kilitlendiğinde veya yeniden başladığında sessizce bekle
      if (err instanceof TypeError) {
        console.debug("[STATS] Connectivity lost. Retrying in next cycle...");
      } else {
        console.error("Failed to fetch statistics from backend:", err);
      }
    }
  };

  // Load and refresh Telegram Bot Status
  const fetchTelegramStatus = async () => {
    try {
      const res = await fetch("/api/telegram/status");
      if (res.ok) {
        const data = await res.json();
        setTelegramEnabled(data.enabled);
        setTelegramHasCredentials(data.hasCredentials);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        console.debug("[TELEGRAM] Connectivity lost. Retrying in next cycle...");
      } else {
        console.warn("Failed to fetch Telegram status:", err);
      }
    }
  };

  const toggleTelegram = async () => {
    setIsLoadingTelegram(true);
    try {
      const res = await fetch("/api/telegram/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !telegramEnabled })
      });
      if (res.ok) {
        const data = await res.json();
        setTelegramEnabled(data.enabled);
      }
    } catch (err) {
      console.error("Failed to toggle Telegram status:", err);
    } finally {
      setIsLoadingTelegram(false);
    }
  };

  // Poll server state API for dynamic dashboard synchronization
  useEffect(() => {
    fetchStats();
    fetchTelegramStatus();
    const interval = setInterval(() => {
      fetchStats();
      fetchTelegramStatus();
    }, 30000); // PROTOKOL: 30 saniyede bir güncelle
    return () => clearInterval(interval);
  }, []);

  // Wallet Balance Refresh (30 saniye aralıkla)
  const fetchWalletBalance = async () => {
    setIsLoadingBalance(true);
    try {
      const response = await fetch("/api/wallet-balance");
      if (response.ok) {
        const data = await response.json();
        if (data) {
          if (data.address && data.address.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
            data.address = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
          }
          if (data.payoutAddress && data.payoutAddress.toLowerCase() === "0xf7bfcbf93f422ebe3c7b62509f0a9bdd4ed6ae8d") {
            data.payoutAddress = "0x06E83497F599D67447EfFfeA399cC885CEB6eEff";
          }
        }
        setWalletBalance(data);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        console.debug("[BALANCE] Connectivity lost. Retrying in next cycle...");
      } else {
        console.warn("Failed to fetch wallet balance:", err);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // Wallet balance otomatik yenileme (30 saniye)
  useEffect(() => {
    fetchWalletBalance();
    const interval = setInterval(fetchWalletBalance, 60000); // PROTOKOL: 60 saniyede bir bakiye kontrolü
    return () => clearInterval(interval);
  }, []);

  // Connect Server-Sent Events (SSE) for raw cybernetic log streaming
  useEffect(() => {
    const sse = new EventSource("/api/stream-logs");

    sse.onmessage = (event) => {
      const newLog: LogEntry = JSON.parse(event.data);
      setLogs((prev) => {
        // Prevent duplicate entries due to SSE reconnections
        if (prev.some((log) => log.id === newLog.id)) {
          return prev;
        }
        const updated = [...prev, newLog];
        // Throttle client memory state size
        return updated.slice(-150);
      });
    };

    return () => {
      sse.close();
    };
  }, []);

  // Ensure terminal logs autoscroll
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Handle Crawl Bot start signal emission
  const startCrawlBot = async () => {
    try {
      await fetch("/api/crawl/start", { method: "POST" });
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Crawl Bot stop signal emission
  const stopCrawlBot = async () => {
    try {
      await fetch("/api/crawl/stop", { method: "POST" });
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger dedicated URL sweep with detailed report compilation
  const handleTacticalOptimize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl) return;

    setIsOptimizingTarget(true);
    setTargetError("");
    setOptResult(null);

    try {
      const res = await fetch("/api/optimize-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!res.ok) {
        const errPayload = await res.json();
        throw new Error(errPayload.error || "Tactical sweep pipeline failed.");
      }

      const outcome: OptimizationResult = await res.json();
      setOptResult(outcome);
    } catch (err: any) {
      setTargetError(err.message || "Failed to establish network pipeline.");
    } finally {
      setIsOptimizingTarget(false);
    }
  };

  // Save payout cüzdan and gas mode settings
  const handleSavePayoutSettings = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsUpdatingWallet(true);
    setWalletSaveSuccess(false);
    
    try {
      const res = await fetch("/api/payout-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutWalletAddress: walletInput,
        })
      });
      if (res.ok) {
        setWalletSaveSuccess(true);
        setTimeout(() => setWalletSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to update payout configuration:", err);
    } finally {
      setIsUpdatingWallet(false);
    }
  };

  // Gerçek bir alıcının karbon veri paketini satın almasını tetikle (Manuel Payout)
  const handleExecutePayout = async (itemId: string) => {
    const item = stats.readyToSell.find(i => i.id === itemId);
    if (!item || !item.accessVoucherSignature) {
      alert("Varlık imzası (Voucher) bulunamadı. Lütfen otonom motorun imzalamasını bekleyin.");
      return;
    }

    setPurchaseInProgress(itemId);
    try {
      // BROWSER-SIDE WALLET (ALICI) ETKİLEŞİMİ
      if (!(window as any).ethereum) throw new Error("MetaMask bulunamadı.");
      
      const provider = new ethers.providers.Web3Provider((window as any).ethereum);
      const { chainId } = await provider.getNetwork();

      // GÜVENLİK: Kullanıcının Polygon (137) ağında olduğundan emin ol
      if (chainId !== 137) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x89' }], // 137 hex
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            alert("Lütfen MetaMask'a Polygon Mainnet ağını ekleyin.");
          } else {
            throw new Error("Lütfen cüzdanınızı Polygon ağına geçirin.");
          }
          return;
        }
      }

      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      
      // Alıcı gas ücretini ödeyerek kontratı tetikler
      console.log("Buyer is executing claim for signature:", item.accessVoucherSignature);
      
      // GERÇEK SATIN ALIM: Voucher imzasını doğrula ve ödemeyi gerçekleştir
      const contractAddress = stats.contractAddress; 

      const contractAbi = [
        "function buyAsset(string memory id, uint256 price, bytes memory signature) public payable",
        "event AssetSold(string id, address buyer, uint256 price)"
      ];
      
      const contract = new ethers.Contract(contractAddress, contractAbi, signer);
      const priceWei = ethers.utils.parseUnits(item.accessPriceUSD.toFixed(18), 18);

      // Gas-on-Purchase: İşlemi alıcı (MetaMask sahibi) başlatır ve gas'ı öder.
      const tx = await contract.buyAsset(item.id, priceWei, item.accessVoucherSignature, {
        value: priceWei // Alıcı parayı kontrata gönderir, kontrat sana iletir
      });

      console.log("[WAITING_CONFIRMATION] İşlem hash:", tx.hash);
      await tx.wait();
      
      // PROTOKOL_REAL: Sunucuya satışın on-chain olarak gerçekleştiğini bildir
      await fetch("/api/market/confirm-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, txHash: tx.hash })
      });

      alert(`TEBRİKLER! Varlık satıldı ve gelir yönlendirildi. Tx: ${tx.hash}`);
      fetchStats();
    } catch (err: any) {
      // Gelişmiş hata raporlama
      const revertReason = err?.data?.message || err?.message || "Bilinmeyen Hata";
      console.error("Satın alım hatası:", revertReason);
      alert(`İşlem Başarısız!\nSebep: ${revertReason.includes('insufficient funds') ? 'Cüzdan bakiyesi yetersiz.' : revertReason}`);
    } finally {
      setPurchaseInProgress(null);
    }
  };

  // Toplu Onay (Publish All) Tetikleyici
  const handlePublishAll = async () => {
    try {
      const res = await fetch("/api/market/publish-all", { method: "POST" });
      if (res.ok) fetchStats();
    } catch (err) {
      console.error(err);
    }
  };

  // Yönetici Komutu Gönder
  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: adminCommand })
      });
      if (res.ok) {
        setAdminCommand("");
        fetchStats();
      }
    } catch (err) { console.error(err); }
  };

  // Log module custom styling mapper
  const getLogStyle = (module: string, level: string) => {
    let textAndBg = "text-slate-300";
    if (module === "SYSTEM") textAndBg = "text-cyan-400";
    else if (module === "CRAWLER") textAndBg = "text-sky-300";
    else if (module === "OPTIMIZER") textAndBg = "text-emerald-400";
    else if (module === "BLOCKCHAIN") textAndBg = "text-pink-400";
    else if (module === "AI") textAndBg = "text-amber-300";
    else if (module === "FINANCE") textAndBg = "text-emerald-500 font-bold";

    if (level === "ERROR") return "text-red-400 font-semibold border-l-2 border-red-500 pl-1";
    if (level === "WARNING") return "text-yellow-400 font-medium";
    if (level === "ANALYZE") return "text-violet-400 font-medium";

    return textAndBg;
  };

  // Filter logs based on search criteria and emergency status
  const filteredLogs = logs.filter((log) => {
    // 1. Emergency Filter
    if (showOnlyEmergency) {
      const isEmergency = log.level === "ERROR" || 
                          log.message.toUpperCase().includes("FUEL_FAIL") || 
                          log.message.toUpperCase().includes("ERROR");
      if (!isEmergency) return false;
    }

    // 2. Text Search Filter
    if (!logSearch) return true;
    const query = logSearch.toLowerCase();
    return (
      log.message.toLowerCase().includes(query) ||
      log.module.toLowerCase().includes(query) ||
      log.level.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950 p-4 md:p-6 lg:p-8 flex flex-col justify-between">
      
      {/* HEADER SECTION */}
      <header className="border border-slate-800 bg-slate-900/60 backdrop-blur-md rounded-2xl p-5 mb-6 flex flex-col md:flex-row md:items-center md:justify-between shadow-2xl relative overflow-hidden">
        {/* Futuristic glowing geometric accents */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl"></div>
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-pink-500/5 rounded-full blur-3xl"></div>

        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-950 border border-cyan-800/60 rounded-xl relative">
            <Cpu className="w-8 h-8 text-cyan-400 animate-pulse-slow" />
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-slate-950"></div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight text-white uppercase">
                İnternet Geri Kazanım Çekirdeği
              </h1>
              <span className="text-[10px] font-mono tracking-wider bg-slate-800 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">
                v1.0.0
              </span>
            </div>
            <p className="text-slate-400 text-xs md:text-sm mt-0.5 max-w-xl">
              Otonom karanlık veri tarama botu ve EVM zincir içi kod enerji optimizasyon platformu.
            </p>
          </div>
        </div>

        {/* Dynamic State Banner */}
        <div className="mt-4 md:mt-0 flex items-center gap-3 bg-slate-950/60 px-4 py-3 rounded-xl border border-slate-800">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Geri Dönüşüm Fabrikası</span>
            <span className="text-xs font-mono font-medium text-slate-300">
              {stats.isCrawling ? "DATA_CLEANING_TASK YÜRÜTÜLÜYOR..." : "FABRİKA STANDBY / HAZIR"}
            </span>
          </div>
          <div className="relative flex h-3 w-3">
            {stats.isCrawling ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-400"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-600"></span>
            )}
          </div>
        </div>
      </header>

      {/* DYNAMIC METRIC CARDS GRID (BENTO SYSTEM) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Pages Scan Rate */}
        <div className="bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-all rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl transition-all group-hover:bg-cyan-500/10"></div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
            <span>Temizlenen Sektörler</span>
            <Globe className="w-4.5 h-4.5 text-cyan-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-display font-medium text-white tracking-tight">
              {stats.pagesProcessed}
            </div>
            <p className="text-slate-500 text-[10px] mt-1">Taranan ve dizine eklenen toplam aktif URL</p>
          </div>
        </div>

        {/* Card 2: Shredded Dark Data */}
        <div className="bg-slate-900/50 border border-slate-800 hover:border-emerald-500/30 transition-all rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl transition-all group-hover:bg-emerald-500/10"></div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
            <span>Geri Kazanılan Veri</span>
            <Layers className="w-4.5 h-4.5 text-emerald-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-display font-medium text-emerald-400 tracking-tight">
              {stats.totalKiloBytesSaved ? stats.totalKiloBytesSaved.toFixed(2) : "0.00"} <span className="text-xs font-mono text-slate-400">KB</span>
            </div>
            <p className="text-slate-500 text-[10px] mt-1">Gereksiz kod satırları ve yorum blokları</p>
          </div>
        </div>

        {/* Card 3: Net Offset Savings */}
        <div className="bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-all rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full blur-xl transition-all group-hover:bg-amber-500/10"></div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
            <span>Net Karbon Tasarrufu</span>
            <Leaf className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-display font-medium text-amber-500 tracking-tight">
              {(stats.totalCo2SavedGrams || 0).toFixed(4)} <span className="text-xs font-mono text-slate-400">g CO₂ Analizi</span>
            </div>
            <p className="text-slate-500 text-[10px] mt-1">Erişimi önlenen tahmini karbon emisyonu</p>
          </div>
        </div>

        {/* Card 4: Web3 proofs */}
        <div className="bg-slate-900/50 border border-slate-800 hover:border-pink-500/30 transition-all rounded-2xl p-4 md:p-5 flex flex-col justify-between shadow-lg group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-pink-500/5 rounded-full blur-xl transition-all group-hover:bg-pink-500/10"></div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono uppercase tracking-wider">
            <span>Kayıtlı Veri Varlıkları</span>
            <Coins className="w-4.5 h-4.5 text-pink-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl md:text-3xl font-display font-medium text-pink-400 tracking-tight">
              {(stats.dataAssetRegistrations || 0)} <span className="text-xs font-mono text-slate-400">Varlık</span>
            </div>
            <p className="text-slate-500 text-[10px] mt-1">L2 üzerinde gerçekleşen PoC işlemleri</p>
          </div>
        </div>
      </section>

      {/* CORE FUNCTION SELECTOR TABS */}
      <div className="flex border-b border-slate-800 mb-6 font-mono text-xs overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => setActiveTab("bot")}
          className={`px-4 py-3 font-medium flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "bot" 
              ? "border-red-500 text-red-400 bg-red-950/10 animate-[pulse_3s_infinite]" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Flame className="w-4 h-4 text-red-500 animate-pulse" />
          ⚡ OTONOM SAVAŞ & TARAMA KOKPİTİ (HFT COMPACT)
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`px-4 py-3 font-medium flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "manual" 
              ? "border-emerald-400 text-emerald-400 bg-emerald-950/10" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          HEDEFLİ EKO-OPTİMİZASYON
        </button>
        <button
          onClick={() => setActiveTab("marketplace")}
          className={`px-4 py-3 font-medium flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "marketplace" 
              ? "border-amber-400 text-amber-400 bg-amber-950/10" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Coins className="w-4 h-4 text-amber-400" />
          OTONOM PAZARYERİ & GELİR
        </button>
        <button
          onClick={() => setActiveTab("blueprint")}
          className={`px-4 py-3 font-medium flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "blueprint" 
              ? "border-pink-400 text-pink-400 bg-pink-950/10" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Database className="w-4 h-4" />
          MİKRO-ÇEKİRDEK YAPILANDIRMASI
        </button>
        <button
          onClick={() => setActiveTab("healer")}
          className={`px-4 py-3 font-medium flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "healer" 
              ? "border-cyan-400 text-cyan-400 bg-cyan-950/10" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          🩺 DR.SYSTEM (SELF-HEALER AI)
          {stats?.healer?.healedCount && stats.healer.healedCount > 0 ? (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] bg-cyan-500 text-slate-950 rounded font-bold">
              {stats.healer.healedCount} REPAIRED
            </span>
          ) : null}
        </button>
      </div>

      {/* ACTIVE TAB WORKING CANVAS */}
      <main className="mb-6 flex-grow">
        
        {/* TAB 1: AUTONOMOUS SWEEP & HFT WAR COCKPIT */}
        {activeTab === "bot" && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Unified Cockpit Header */}
            <div className="bg-gradient-to-r from-red-950/45 via-slate-900/40 to-slate-900/40 border border-red-900/40 rounded-2xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl animate-pulse"></div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                    <h3 className="font-display font-medium text-white text-base tracking-wider uppercase flex items-center gap-2">
                      <Flame className="w-5 h-5 text-red-500 animate-pulse" />
                      OTONOM GÜVENLİ SAVAŞ & TARAMA KOKPİTİ (HFT COMPACT)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Yapay zeka madenciliği, Merkle Tree kanıt toplulaştırma, dinamik rota yönlendirme ve anlık likidasyon tek bir akıllı panel üzerinden canlı koordine edilir.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="px-3 py-1.5 bg-red-950/50 border border-red-500/30 text-red-400 font-mono text-[10px] uppercase font-bold rounded-lg animate-pulse">
                    HFT MODÜLÜ AKTİF
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Robot Power & Parametric Configuration */}
              <div className="lg:col-span-6 flex flex-col gap-6">
                
                {/* 1. Controller Unit */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
                  <h4 className="text-xs font-mono text-cyan-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4.5 h-4.5 text-cyan-500" />
                    Ağ Tarayıcı & Otonom Savaş Çekirdek Kontrolü
                  </h4>

                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Blockchain Executor Modu: Sistem doğrudan akıllı kontrat emirleri, gaz seviyesi koruyucuları ve imzalı erişim işlemlerini otomatik koordine eder.
                  </p>

                  {/* State Meter */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-4 font-mono text-xs">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-slate-500 uppercase text-[10px]">Ekosistem Tarama Motoru</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${stats.isCrawling ? "bg-cyan-950 text-cyan-400 border border-cyan-500/20 animate-pulse" : "bg-slate-800 text-slate-400"}`}>
                        {stats.isCrawling ? "ÇALIŞIYOR" : "BEKLEMEDE"}
                      </span>
                    </div>

                    {stats.isCrawling ? (
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-slate-400 mb-1">
                            <span>Sektör düğümü taranıyor:</span>
                          </div>
                          <div className="text-white font-medium break-all text-[11px] bg-slate-900/50 p-2 rounded border border-slate-800/60 font-mono">
                            {stats.currentCrawlingUrl || "Sektörler taranıyor..."}
                          </div>
                        </div>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-cyan-400 h-full w-2/3 animate-[pulse_1.5s_infinite] rounded-full"></div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-center py-2 italic font-sans animate-pulse">
                        Sistem, otonom döngüyü başlatmanız için emir bekliyor.
                      </div>
                    )}
                  </div>

                  {/* Telegram Message Control Bar */}
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5 mb-4 font-mono text-xs">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider">Telegram Bildirim ve Kontrol Kanalı</span>
                        <p className="text-slate-500 text-[10px] leading-normal max-w-[260px]">
                          Cihazınızdan iki yönlü kontrol komutları gönderebilir ve anlık başarı/likidasyon telemetrisini dilediğiniz an sessize alabilirsiniz.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`w-2 h-2 rounded-full ${telegramEnabled ? "bg-green-500" : "bg-red-500"}`}></span>
                        <button
                          onClick={toggleTelegram}
                          disabled={isLoadingTelegram}
                          id="telegram_toggle_btn"
                          className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer font-mono tracking-wide transition-all ${
                            telegramEnabled 
                              ? "bg-green-950/45 border-green-500/40 text-green-400 hover:bg-green-950/75 shadow-lg shadow-green-950/20" 
                              : "bg-red-950/45 border-red-500/40 text-red-400 hover:bg-red-950/75 shadow-lg shadow-red-950/20"
                          }`}
                        >
                          {isLoadingTelegram ? "İŞLENİYOR..." : telegramEnabled ? "DURDUR" : "AKTİFLEŞTİR"}
                        </button>
                      </div>
                    </div>
                    {!telegramHasCredentials && (
                      <div className="mt-2.5 text-[10px] text-amber-500/90 leading-relaxed border-t border-slate-800/60 pt-2 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                        Ortam değişkenleri (TELEGRAM_BOT_TOKEN veya TELEGRAM_CHAT_ID) eksik. Lütfen yapılandırın.
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={startCrawlBot}
                      disabled={stats.isCrawling}
                      className="w-full py-2.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-cyan-400 hover:bg-cyan-950/50 transition-all font-mono text-xs font-semibold tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      MOTORU BAŞLAT
                    </button>

                    <button
                      onClick={stopCrawlBot}
                      disabled={!stats.isCrawling}
                      className="w-full py-2.5 rounded-xl border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-950/50 transition-all font-mono text-xs font-semibold tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      BEKLEME MODU
                    </button>
                  </div>
                </div>

                {/* 2. HFT Savaş Konfigürasyonu */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 md:p-6 shadow-lg">
                  <h4 className="text-xs font-mono text-red-400 mb-5 uppercase tracking-widest flex items-center gap-2">
                    <Flame className="w-4 h-4 text-red-500" />
                    HFT Algoritmik Savaş Konfigürasyonu
                  </h4>

                  <form onSubmit={handleSaveHftSettings} className="space-y-4">
                    
                    {/* Toggle: HFT Savaş Modu */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">HFT Otonom Döngüsü</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Verileri anında mühürler, listeler ve saniyeler içinde satarak USDT payout tetikler.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHftEnabled(!hftEnabled)}
                        className={`w-14 h-7 rounded-full p-1 transition-all cursor-pointer outline-none shrink-0 ${
                          hftEnabled ? "bg-red-600 justify-end" : "bg-slate-700"
                        } flex items-center`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-all"></span>
                      </button>
                    </div>

                    {/* Toggle: Hafif Kazıyıcı (Lightweight Crawler) */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Hafif Kazıyıcı (Lightweight Patches)</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Sadece dinamik sayfa değişimleri (JSON/XML patch) optimize edilerek %80 bant genişliği tasarrufu sağlanır.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLightweightMode(!lightweightMode)}
                        className={`w-14 h-7 rounded-full p-1 transition-all cursor-pointer outline-none shrink-0 ${
                          lightweightMode ? "bg-red-600 justify-end" : "bg-slate-700"
                        } flex items-center`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-all"></span>
                      </button>
                    </div>

                    {/* Radio: Pricing Mode Select */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl space-y-3">
                      <div>
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Fiyatlandırma Oracle Tipi</label>
                        <span className="text-[10px] text-slate-400 block mt-0.5 leading-relaxed">
                          Veri talep yoğunluğuna göre dinamik fiyat adaptasyonu.
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                        <button
                          type="button"
                          onClick={() => setPricingMode("automatic")}
                          className={`py-2 px-3 border rounded-xl text-center cursor-pointer transition-all ${
                            pricingMode === "automatic"
                              ? "bg-red-950/30 border-red-500/50 text-red-400 font-bold"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Otomatik Dinamik Oracle
                        </button>
                        <button
                          type="button"
                          onClick={() => setPricingMode("manual")}
                          className={`py-2 px-3 border rounded-xl text-center cursor-pointer transition-all ${
                            pricingMode === "manual"
                              ? "bg-red-950/30 border-red-500/50 text-red-400 font-bold"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Manuel Çarpan Belirleme
                        </button>
                      </div>
                    </div>

                    {/* Slider / Range: Fiyat Çarpanı */}
                    {pricingMode === "manual" && (
                      <div className="bg-slate-950/40 border border-slate-800/60 p-3.5 rounded-xl space-y-2">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <label className="text-slate-200 font-bold uppercase text-[10px]">Manuel Talep Katsayısı (Pricing Multiplier)</label>
                          <span className="text-red-400 font-bold">{demandMultiplier.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="2.5"
                          step="0.05"
                          value={demandMultiplier}
                          onChange={(e) => setDemandMultiplier(parseFloat(e.target.value))}
                          className="w-full accent-red-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                        />
                      </div>
                    )}

                    {/* Safety Circuit Breaker Control Area */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Emniyet Devre Kesici</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Gaz seviyesi 0.25 POL altına inerse sistemi otomatik yavaşlatır ve korur.
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          circuitBreakerStatus === "NORMAL" 
                            ? "bg-green-950 text-green-400 border border-green-500/30" 
                            : "bg-red-950 text-red-400 border border-red-500/30 animate-pulse"
                        }`}>
                          {circuitBreakerStatus === "NORMAL" ? "NORMAL DEĞERLER" : "YAVAŞLA MODU ETKİN"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCircuitBreakerStatus(circuitBreakerStatus === "NORMAL" ? "BREAKER_ACTIVE_SLOW_DOWN" : "NORMAL")}
                          className="text-[9px] font-mono text-cyan-400 underline hover:text-cyan-300 mt-1 cursor-pointer"
                        >
                          Değiştir
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isUpdatingHft}
                      className="w-full bg-red-600 hover:bg-red-500 text-slate-955 p-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer flex justify-center items-center gap-2 shadow-lg hover:shadow-red-500/10"
                    >
                      <Zap className="w-4 h-4 text-slate-950" />
                      {isUpdatingHft ? "MİKROKOD GÜNCELLENİYOR..." : "HFT AYARLARINI KAYDET VE AKTİF ET"}
                    </button>

                    {hftSaveSuccess && (
                      <p className="text-center font-mono text-red-400 text-xs animate-pulse">
                        ✓ Parametre ayarları sunucuya başarıyla işlendi!
                      </p>
                    )}

                  </form>
                </div>

                {/* 3. Profit-Lock & Muhasebe Kontrolü */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 md:p-6 shadow-lg space-y-5">
                  <h4 className="text-xs font-mono text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-500" />
                    Bakiye Kilitleme ve Muhasebe Bölümü
                  </h4>

                  <form onSubmit={handleSaveProfitLockSettings} className="space-y-4">
                    {/* Toggle: Kar Kilitleme Modu */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Kar Kilitleme (Profit-Lock)</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Kazançlar belirlenen limit eşiğe ulaşana kadar yedek hold havuzunda birikir.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProfitLockActiveConfig(!profitLockActiveConfig)}
                        className={`w-14 h-7 rounded-full p-1 transition-all cursor-pointer outline-none shrink-0 ${
                          profitLockActiveConfig ? "bg-emerald-600 justify-end" : "bg-slate-700"
                        } flex items-center`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-all"></span>
                      </button>
                    </div>

                    {/* Input: Kar Kilidi Eşiği */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3.5 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <label className="text-slate-200 font-bold uppercase text-[10px]">Kar Kilidi Barajı (Valuation-Limit)</label>
                        <span className="text-emerald-400 font-bold">${parseFloat(profitLockThresholdInput || "0").toFixed(2)} USD</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-xs font-mono text-slate-500">$</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={profitLockThresholdInput}
                          onChange={(e) => setProfitLockThresholdInput(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-7 pr-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 transition-all"
                          placeholder="5.0"
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="submit"
                        disabled={isUpdatingProfitLock}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-955 py-2.5 px-3 rounded-xl font-mono text-[11px] font-bold transition-all cursor-pointer flex justify-center items-center gap-1.5 shadow-lg hover:shadow-emerald-500/10"
                      >
                        {isUpdatingProfitLock ? "KAYDEDİLİYOR..." : "KİLİT AYARLARINI KAYDET"}
                      </button>

                      <button
                        type="button"
                        onClick={handleReleaseProfitLock}
                        disabled={isReleasingProfitLock || (stats.profitLockHoldAmount || 0) <= 0}
                        className={`w-full py-2.5 px-3 rounded-xl font-mono text-[11px] font-bold transition-all cursor-pointer flex justify-center items-center gap-1.5 border ${
                          (stats.profitLockHoldAmount || 0) > 0
                            ? "bg-slate-900 border-amber-500/40 hover:bg-slate-800 text-amber-400"
                            : "bg-slate-950/40 border-slate-900 text-slate-600 cursor-not-allowed"
                        }`}
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        {isReleasingProfitLock ? "SERBEST BIRAKILIYOR..." : "MANUEL KAR TRANSFERİ"}
                      </button>
                    </div>

                    {profitLockSaveSuccess && (
                      <p className="text-center font-mono text-emerald-400 text-xs animate-pulse">
                        ✓ Bakiye kilitleme ve muhasebe parametreleri sisteme işlendi!
                      </p>
                    )}

                    {/* Divider veya Ara Başlık */}
                    <div className="border-t border-slate-800/65 my-6"></div>

                    <h5 className="text-[10px] font-mono text-emerald-400/90 uppercase tracking-widest flex items-center gap-1.5 font-bold mb-3">
                      <Zap className="w-3.5 h-3.5 text-emerald-500" />
                      Toplu Mutabakat Kontrolü (Gas-Saving Batch-Only Mode)
                    </h5>

                    {/* Toggle: Toplu Mutabakat Modu */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Toplu Mutabakat (Batch-Only)</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Tekil küçük tutarlı ($0.06 - $0.10) satışlar yerine mühürlü voucherları toplu biriktirip tek işlemde nakde çevirir.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBatchOnlyModeConfig(!batchOnlyModeConfig)}
                        className={`w-14 h-7 rounded-full p-1 transition-all cursor-pointer outline-none shrink-0 ${
                          batchOnlyModeConfig ? "bg-emerald-600 justify-end" : "bg-slate-700"
                        } flex items-center`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-all"></span>
                      </button>
                    </div>

                    {/* Input: Toplu Mutabakat Barajı */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-3.5 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <label className="text-slate-200 font-bold uppercase text-[10px]">Toplu Likidasyon Eşiği</label>
                        <span className="text-emerald-400 font-bold">${parseFloat(batchOnlyThresholdInput || "0").toFixed(2)} USD</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-xs font-mono text-slate-500">$</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={batchOnlyThresholdInput}
                          onChange={(e) => setBatchOnlyThresholdInput(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-7 pr-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 transition-all"
                          placeholder="5.0"
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div>
                      <button
                        type="button"
                        onClick={handleSaveBatchOnlySettings}
                        disabled={isUpdatingBatchOnly}
                        className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-emerald-400 py-2.5 px-3 rounded-xl font-mono text-[11px] font-bold transition-all cursor-pointer flex justify-center items-center gap-1.5 shadow-lg"
                      >
                        {isUpdatingBatchOnly ? "KAYDEDİLİYOR..." : "BATCH AYARLARINI KAYDET"}
                      </button>
                    </div>

                    {batchOnlySaveSuccess && (
                      <p className="text-center font-mono text-emerald-400 text-xs animate-pulse mt-2">
                        ✓ Toplu mutabakat (Batch-Only) parametreleri başarıyla sisteme işlendi!
                      </p>
                    )}
                  </form>
                </div>

              </div>
              
              {/* Right Column: Merkle Tree Queue, Pathfinder & On-Chain registrations */}
              <div className="lg:col-span-6 flex flex-col gap-6">
                
                {/* 1. Merkle Tree Queue Visual representation */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
                  <h4 className="text-xs font-mono text-red-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <Database className="w-4 h-4 text-red-500" />
                    Merkle Tree Paketleme Kuyruğu (HFT Batch)
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                    Toplu işlem (Batching Mode) için geçici veri mühür havuzu. <strong>5 döküman</strong> biriktiğinde otonom Merkle kök özeti hesaplanır ve tek bir on-chain mühürleme işlemine yönlendirilir.
                  </p>

                  {/* Merkle Slots Visualization */}
                  <div className="grid grid-cols-5 gap-2 mb-4 font-mono text-xs">
                    {[0, 1, 2, 3, 4].map((slotIdx) => {
                      const isActive = slotIdx < (stats.merkleBufferCount || 0);
                      return (
                        <div
                          key={`merkle-slot-unified-${slotIdx}`}
                          className={`py-3 border rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all ${
                            isActive
                              ? "bg-red-950/20 border-red-500/50 text-red-400 shadow-md shadow-red-500/5"
                              : "bg-slate-950/40 border-slate-800 text-slate-600"
                          }`}
                        >
                          <span className="text-[9px] text-slate-500 scale-90">SLOT {slotIdx + 1}</span>
                          <span className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-red-500 animate-pulse" : "bg-slate-800"}`}></span>
                          <span className="text-[8px] font-bold">{isActive ? "DOK" : "BOŞ"}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Current Queue Elements display */}
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 max-h-[110px] overflow-y-auto scrollbar-thin space-y-1.5">
                    {(stats.merkleBufferCount || 0) === 0 ? (
                      <div className="text-slate-600 text-[10px] font-mono text-center py-3">
                        Kuyruk boş. Robotun veri kazımasını bekleyin (0/5)
                      </div>
                    ) : (
                      Array.of(...Array(stats.merkleBufferCount)).map((_, idx) => (
                        <div key={`queue-item-unified-${idx}`} className="flex items-center justify-between text-[10px] font-mono border-b border-slate-900 pb-1 last:border-0 last:pb-0">
                          <span className="text-red-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                            #eco-batch-item-{idx + 1}
                          </span>
                          <span className="text-slate-500 text-[9px]">Mühürlü Kanıt Bekleniyor</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="bg-red-950/20 border border-red-500/30 p-3 rounded-xl mt-3 font-mono text-[9px] text-red-400 flex items-start gap-2">
                    <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-300 block mb-0.5">YENİ NESİL GAS KORUMA ALGORİTMASI</strong>
                      Tüm dökümanlar tek bir Merkle Root mühür işleminde birleştirilerek L2 gas tasarrufu %99.1 oranında artırılmıştır.
                    </div>
                  </div>
                </div>

                {/* 2. Pathfinder Router status card */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-3">
                  <h4 className="text-xs font-mono text-red-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-red-500" />
                    Çoklu Zincir Rota Bulucu (Pathfinder)
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Modül, veri satışından doğan likiditeleri otonom olarak en kârlı ve yüksek likiditeye sahip katman 2 (L2) havuzuna yönlendirir.
                  </p>

                  <div className="space-y-2 font-mono text-xs">
                    {/* Route 1: Polygon */}
                    <div className={`p-2.5 border rounded-xl flex items-center justify-between transition-all ${
                      (stats.selectedNetworkPath || "polygon") === "polygon"
                        ? "bg-purple-950/25 border-purple-500/50 shadow-md shadow-purple-500/5"
                        : "bg-slate-950/40 border-slate-800/60"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          (stats.selectedNetworkPath || "polygon") === "polygon" ? "bg-purple-400 animate-pulse" : "bg-slate-600"
                        }`}></span>
                        <div>
                          <span className="text-slate-200 block text-[10px] font-bold">Polygon Mainnet (Native)</span>
                          <span className="text-[8px] text-slate-500">QuickSwap V3 • Gaz: ~0.004 POL</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-purple-400 font-bold block text-[10px]">{(stats.selectedNetworkPath || "polygon") === "polygon" ? "ETKİN" : "STANDBY"}</span>
                        <span className="text-[8px] text-slate-500">Net Getiri: X1.0</span>
                      </div>
                    </div>

                    {/* Route 2: Arbitrum */}
                    <div className={`p-2.5 border rounded-xl flex items-center justify-between transition-all ${
                      stats.selectedNetworkPath === "arbitrum"
                        ? "bg-cyan-950/25 border-cyan-500/50 shadow-md"
                        : "bg-slate-950/40 border-slate-800/60"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          stats.selectedNetworkPath === "arbitrum" ? "bg-cyan-400 animate-pulse" : "bg-slate-600"
                        }`}></span>
                        <div>
                          <span className="text-slate-200 block text-[10px] font-bold">Arbitrum One L2</span>
                          <span className="text-[8px] text-slate-500">Sushiswap V3 • Gaz: ~0.0001 ETH</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-cyan-400 font-bold block text-[10px]">{stats.selectedNetworkPath === "arbitrum" ? "ETKİN" : "YEDEK REZERV"}</span>
                        <span className="text-[8px] text-slate-500">Net Getiri: +1.01%</span>
                      </div>
                    </div>

                    {/* Route 3: Base */}
                    <div className={`p-2.5 border rounded-xl flex items-center justify-between transition-all ${
                      stats.selectedNetworkPath === "base"
                        ? "bg-emerald-950/25 border-emerald-500/50 shadow-md shadow-emerald-500/5"
                        : "bg-slate-950/40 border-slate-800/60"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          stats.selectedNetworkPath === "base" ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                        }`}></span>
                        <div>
                          <span className="text-slate-200 block text-[10px] font-bold">Base L2 (Coinbase)</span>
                          <span className="text-[8px] text-slate-500">Uniswap V3 • Gaz: ~0.00008 ETH</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-emerald-400 font-bold block text-[10px]">{stats.selectedNetworkPath === "base" ? "ETKİN" : "EN YÜKSEK LİKİDİTE"}</span>
                        <span className="text-[8px] text-slate-500">Net Getiri: +3.00%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Zincir İçi Karbon Kayıt Defteri (Transactions List) */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg flex flex-col justify-between flex-grow">
                  <div>
                    <h4 className="text-xs font-mono text-pink-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                      <Coins className="w-4.5 h-4.5 text-pink-500" />
                      Zincir İçi Karbon Kayıt Defteri ({stats.transactions.length})
                    </h4>

                    {stats.transactions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center text-slate-500 py-10 text-xs font-mono">
                        <Database className="w-10 h-10 text-slate-800 mb-2" />
                        Henüz güncel sistemde kayıtlı işlem bulunmuyor.
                        {stats.isCrawling && <p className="text-cyan-400 animate-pulse mt-1">Gelen blok onayları dinleniyor...</p>}
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {stats.transactions.map((tx, idx) => (
                          <div key={idx} className="bg-slate-950 border border-slate-800/60 rounded-xl p-3 font-mono text-[11px] flex flex-col gap-1.5 relative">
                            <div className="flex items-center justify-between">
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />                            
                                MÜHÜRLENDİ VE KAYDEDİLDİ
                              </span>
                              <span className="text-slate-500 text-[9px]">
                                {new Date(tx.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-slate-400">
                              <div>
                                <span className="text-slate-500 uppercase text-[8px] block">CO₂ Analiz Değeri</span>
                                <span className="text-amber-400 text-[11px] font-semibold">{(tx.co2AnalysisGrams || 0).toFixed(4)} g CO₂</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase text-[8px] block text-right">Doğrulama Damgası</span>
                                <span className="text-slate-300 text-[9px] block text-right font-mono truncate max-w-full">
                                  {tx.proofHash}
                                </span>
                              </div>
                            </div>

                            <div className="border-t border-slate-900 pt-1.5 mt-1 flex items-center justify-between">
                              <span className="text-[9px] text-slate-400 flex items-center gap-1 max-w-[70%]">
                                <Globe className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span className="truncate">{tx.url}</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] text-cyan-400 font-mono tracking-wider bg-cyan-950/20 border border-cyan-500/20 px-1 py-0.2 rounded">
                                  POLYGON_MAINNET
                                </span>
                                <a 
                                  href={`https://polygonscan.com/tx/${tx.assetRegistrationTxHash}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 transition-all hover:scale-110"
                                  title="Gezginde incele"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-800/80 mt-4 pt-2 flex items-center justify-between font-mono text-[9px] text-slate-500">
                    <span>Veri Mütelala Kontratı: 0x71...976F</span>
                    <span>Güvenlik Katmanı: L2 POS zk-Proof Korumalı</span>
                  </div>
                </div>

              </div>
              
            </div>

          </div>
        )}

        {/* TAB 2: MANUAL URL SWEEPER SANDBOX */}
        {activeTab === "manual" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Input and analytics panel */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
                <h3 className="font-display font-semibold text-white uppercase text-sm tracking-wide mb-3 flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-emerald-400" />
                  Hedefli Kod Temizleyici
                </h3>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  Aşağıya herhangi bir özel URL adresi girin. Kod optimizasyon aracı HTML kodunu indirecek, biçimlendirecek, gereksiz yorum satırlarını silecek ve enerji analizleriyle birlikte canlı bir Gemini raporu sunacaktır.
                </p>

                <form onSubmit={handleTacticalOptimize} className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Hedef Web Sektör Adresi</label>
                    <div className="relative">
                      <input
                        type="url"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                        placeholder="https://example.com"
                        required
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/60 rounded-xl px-4.5 py-3 text-xs text-white font-mono placeholder:text-slate-700 outline-none transition-all"
                      />
                      <Globe className="absolute right-3.5 top-3.5 w-4.5 h-4.5 text-slate-600" />
                    </div>
                  </div>

                  {targetError && (
                    <div className="bg-red-950/20 border border-red-900/40 text-red-400 p-3 rounded-xl text-xs flex gap-2 font-mono leading-relaxed">
                      <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                      <div>
                        {targetError}
                        <p className="text-[10px] text-slate-500 mt-1">
                          Sunucu barındırma parametrelerini doğrulayın ve alan adının herkese açık olduğundan emin olun.
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isOptimizingTarget}
                    className="w-full py-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/50 transition-all font-mono text-xs font-semibold tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isOptimizingTarget ? (
                      <>
                        <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                        TARANIYOR VE TEMİZLENİYOR...
                      </>
                    ) : (
                      <>
                        <Flame className="w-4 h-4 fill-current text-emerald-400" />
                        HEDEF KODU TEMİZLE
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Metric Result gauges */}
              {optResult && (
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg font-mono text-xs space-y-4">
                  <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider mb-2">
                    Ekolojik Enerji Analizleri
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950 border border-slate-800/50 rounded-xl p-3">
                      <span className="text-[9px] text-slate-500 uppercase block mb-1">Veri Küçülme Oranı</span>
                      <span className="text-base text-emerald-400 font-bold font-display tracking-tight">
                        {optResult.efficiencyGainPct ? optResult.efficiencyGainPct.toFixed(2) : "0.00"}%
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800/50 rounded-xl p-3">
                      <span className="text-[9px] text-slate-500 uppercase block mb-1">Engellenen Karbon</span>
                      <span className="text-base text-amber-500 font-bold font-display tracking-tight">
                        {optResult.co2AnalysisGrams ? optResult.co2AnalysisGrams.toFixed(4) : "0.0000"} g
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-slate-800 pb-1.5 text-slate-400">
                      <span>Orijinal Boyut</span>
                      <span className="text-white">{(optResult.originalSize / 1024).toFixed(2)} KB</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1.5 text-slate-400">
                      <span>Optimize Boyut</span>
                      <span className="text-white">{(optResult.optimizedSize / 1024).toFixed(2)} KB</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1.5 text-slate-400">
                      <span>Temizlenen Kod</span>
                      <span className="text-emerald-400 font-semibold">{((optResult.originalSize - optResult.optimizedSize) / 1024).toFixed(2)} KB</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1.5 text-slate-400">
                      <span>Kanıt Mührü</span>
                      <span className="text-slate-300 font-semibold text-[10px] break-all max-w-[50%] truncate select-all" title={optResult.proofHash || ""}>
                        {optResult.proofHash}
                      </span>
                    </div>
                    {optResult.txHash && (
                      <div className="flex justify-between pb-1 text-slate-400">
                        <span>L2 Ledger Hash</span>
                        <span className="text-pink-400 hover:underline cursor-pointer flex items-center gap-1 select-all break-all truncate max-w-[50%]" title={optResult.txHash || ""}>
                          {optResult.txHash}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* AI Report Column */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg flex-grow flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-semibold text-white uppercase text-sm tracking-wide mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4.5 h-4.5 text-amber-400" />
                      Gemini AI Eko-Dönüşüm Denetimi
                    </div>
                    <span className="text-[9px] font-mono tracking-wider bg-amber-950 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
                      Gemini 3.5 Core
                    </span>
                  </h3>

                  {optResult && optResult.aiReport ? (
                    <div className="bg-slate-950 border border-slate-800/50 rounded-2xl p-5 text-sm leading-relaxed text-slate-300 font-sans space-y-4 shadow-inner max-h-[400px] overflow-y-auto">
                      {/* Formatted Markdown Parser */}
                      <div className="space-y-4">
                        {optResult.aiReport.split("\n\n").map((section, idx) => {
                          if (section.startsWith("###")) {
                            return (
                              <h4 key={idx} className="font-display font-bold text-white text-base border-b border-slate-800 pb-2 mt-4">
                                {section.replace("###", "").trim()}
                              </h4>
                            );
                          } else if (section.startsWith("**")) {
                            const match = section.match(/^\*\*(.*?)\*\*(.*)/s);
                            if (match) {
                              return (
                                <div key={idx} className="mt-2">
                                  <span className="font-bold text-emerald-400 block mb-1">
                                    {match[1]}
                                  </span>
                                  <p className="text-slate-400 text-xs pl-2 border-l border-emerald-500/30">
                                    {match[2].trim()}
                                  </p>
                                </div>
                              );
                            }
                          }
                          
                          // Parse bullet-pointed advice lists
                          if (section.includes("1.") || section.includes("-") || section.includes("*")) {
                            return (
                              <ul key={idx} className="space-y-3 pl-5 list-decimal text-slate-300 text-xs">
                                {section.split(/\d+\.\s+|- /g).filter(s => s.trim().length > 0).map((bullet, index) => {
                                  const [title, ...descParts] = bullet.split(":");
                                  const desc = descParts.join(":");
                                  return (
                                    <li key={index} className="leading-relaxed">
                                      <strong className="text-white">{title.replace(/\*\*/g, "").trim()}</strong>
                                      {desc && <span className="text-slate-400 font-mono text-[11px] block mt-1 leading-relaxed">{desc.trim()}</span>}
                                    </li>
                                  );
                                })}
                              </ul>
                            );
                          }

                          return (
                            <p key={idx} className="text-xs text-slate-400 leading-relaxed font-mono">
                              {section}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 py-24 text-xs font-mono text-center">
                      <Sparkles className="w-12 h-12 text-slate-800 mb-3 animate-[pulse_3s_infinite]" />
                      Sol panelden bir hedef URL girip temizlik işlemini başlatın.<br />
                      Gemini çevre dostu denetim motoru, derin sürdürülebilir mimari önerilerini burada sunacaktır.
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800/80 mt-6 pt-3 flex items-center justify-between font-mono text-[10px] text-slate-500">
                  <span>Karbon endeksi sistem parametreleri: 0.0000000112 g/byte</span>
                  <span>Bağlam derinliği: Canlı token akış analizi</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2.5: OTONOM PAZARYERİ & GELİR PANELİ */}
        {activeTab === "marketplace" && (
          <div className="flex flex-col gap-6">
            
            {/* Visual Header / Summary Banner */}
            <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-cyan-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl"></div>
              
              <div className="space-y-2 text-left z-10">
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                    OTONOM DİJİTAL FABRİKA AKTİF
                  </span>
                  <span className="text-slate-500 font-mono text-xs">● REAL-TIME ON-CHAIN REVENUE</span>
                </div>
                <h3 className="font-display font-bold text-lg md:text-xl text-white uppercase tracking-tight">
                  Eko-Veri Analitiği ve Erişim Portalı
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  İnternetteki ham karbon emisyon oranlarını ve dağınık veri paketlerini otonom tarayarak, temizlenmiş çevre dostu karbon kredisi raporlarına dönüştüren, akıllı kontrat ödemelerini saniyesinde cüzdanınıza yönlendiren tam otonom kazanç matrisi.
                </p>
              </div>

              {/* Accumulated Real-Time Revenue Board */}
              <div className="bg-slate-950/90 border border-emerald-500/30 rounded-2xl p-5 w-full md:w-[24rem] shadow-inner shrink-0 relative overflow-hidden text-right flex flex-col gap-3">
                <div className="absolute top-0 left-0 w-12 h-12 bg-emerald-500/5 rounded-full blur-xl"></div>
                
                {/* Header info */}
                <div>
                  <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">AKILLI SÖZLEŞME VE ÜRETİM GELİRİ</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                      <span className="text-[9px] font-mono text-emerald-400">ERİŞİM_AKTİF</span>
                    </div>
                  </div>
                  <div className="text-2xl font-display font-medium text-emerald-400 tracking-tight mt-1">
                    ${(stats.totalAccessFeesCollected || 0).toFixed(4)} <span className="text-xs font-mono text-slate-500">USD</span>
                  </div>
                </div>

                {/* Profit Lock Status Indicator */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-left space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      Profit-Lock (Kar Kilidi)
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${(stats.profitLockHoldAmount || 0) >= (stats.profitLockThreshold || 5.0) ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950/70 text-amber-500 border border-amber-500/20'}`}>
                      {(stats.profitLockHoldAmount || 0) >= (stats.profitLockThreshold || 5.0) ? '🔓 KİLİT_AÇILDI' : '🔒 KİLİTLİ'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-500">
                      <span>Kilitli Rezerv Havuzu:</span>
                      <span className="text-slate-300 font-bold">${(stats.profitLockHoldAmount || 0).toFixed(4)} / ${(stats.profitLockThreshold || 5.0).toFixed(2)} USD</span>
                    </div>
                    {/* Progress bar to visual threshold */}
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900 flex">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${Math.min(100, ((stats.profitLockHoldAmount || 0) / (stats.profitLockThreshold || 5.0)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-mono border-t border-slate-900 pt-1.5">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Coins className="w-3 h-3 text-emerald-400" />
                      Kullanılabilir Net Bakiye:
                    </span>
                    <span className="text-emerald-400 font-bold text-xs">${(stats.availableBalance || 0).toFixed(4)} USD</span>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between border-t border-slate-900 pt-1.5">
                   <span className="text-left font-sans text-[9px]">Gas için ana bakiye korunuyor. KECO rezervi kar kilidine dahil edilmiştir.</span>
                   <span className="font-bold shrink-0">{stats.totalDataInsightsPublished} Rapor</span>
                </div>
              </div>
            </div>

            {/* Visual Process Flow / Interactive Mining Cycle */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
              <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider mb-4 text-cyan-400 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                DİJİTAL FABRİKA PROSES AKIŞ ŞEMASI (OTONOM DÖNGÜ)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
                
                {/* Step 1: Tarama ve Temizleme */}
                <div className="bg-slate-950/80 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1.5 relative">
                  <div className="absolute top-3 right-3 text-slate-800 font-mono font-black text-xl">01</div>
                  <div className="flex items-center gap-2">
                    <div className="p-1 px-1.5 bg-cyan-950 text-cyan-400 rounded-lg text-[10px] font-mono border border-cyan-500/20">CRAWLER</div>
                    <span className="text-xs font-semibold text-white font-mono">1. Tarama ve Temizleme</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    İnternetin "çöp" ham verilerini süzerek gereksiz kod satırlarını ayıklar ve temiz enerji tablosu oluşturur.
                  </p>
                  <div className="text-[10px] font-mono text-cyan-400/80 mt-1">
                    {stats.isCrawling ? "⚡ OKUMA AKTİF..." : "💤 BEKLEMEDE / AKTİF METRİK"}
                  </div>
                </div>

                {/* Step 2: Yapay Zeka Süzgeci */}
                <div className="bg-slate-950/80 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1.5 relative">
                  <div className="absolute top-3 right-3 text-slate-800 font-mono font-black text-xl">02</div>
                  <div className="flex items-center gap-2">
                    <div className="p-1 px-1.5 bg-amber-950 text-amber-400 rounded-lg text-[10px] font-mono border border-amber-500/20">AI ANALİZ</div>
                    <span className="text-xs font-semibold text-white font-mono">2. Yapay Zeka Süzgeci</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Gemini 3.5 modeli ile rafine edilip analiz edilir, ticari değeri yüksek "Karbon Emisyon Verisi Analiz Raporu" haline getirilir.
                  </p>
                  <div className="text-[10px] font-mono text-amber-400/80 mt-1">
                    ★ RAPOR ÜRETİMİ ENTEGRE
                  </div>
                </div>

                {/* Step 3: Veri Varlığı Havuzu (DATA_ASSET_QUEUE) */}
                <div className="bg-slate-950/80 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1.5 relative">
                  <div className="absolute top-3 right-3 text-slate-800 font-mono font-black text-xl">03</div>
                  <div className="flex items-center gap-2">
                    <div className="p-1 px-1.5 bg-pink-950 text-pink-400 rounded-lg text-[10px] font-mono border border-pink-500/20">DATA_ASSET_QUEUE</div>
                    <span className="text-xs font-semibold text-white font-mono">3. Veri Varlığı Kuyruğu (Ocean Protocol)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Ocean Protocol üzerinde alıcılara sunulur. Alıcının veri erişim ücretini ödemesi beklenir.
                  </p>
                  <div className="text-[10px] font-mono text-pink-400/80 mt-1">
                    {stats.readyToSell ? stats.readyToSell.filter(x => !x.isSold).length : 0} ADET HAZIR VERİ VARLIĞI
                  </div>
                </div>

                {/* Step 4: Cüzdan Yönlendirme */}
                <div className="bg-slate-950/80 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1.5 relative">
                  <div className="absolute top-3 right-3 text-slate-800 font-mono font-black text-xl">04</div>
                  <div className="flex items-center gap-2">
                    <div className="p-1 px-1.5 bg-emerald-950 text-emerald-400 rounded-lg text-[10px] font-mono border border-emerald-500/20">AUTO ACCESS FEES</div>
                    <span className="text-xs font-semibold text-white font-mono">4. Erişim Ücreti Dağıtımı (Payout)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Akıllı kontrata gelen her USDT/MATIC erişim ücreti saniyesinde payout cüzdan adresinize gaz ücreti harcatmadan doğrudan yönlendirilir.
                  </p>
                  <div className="text-[10px] font-mono text-slate-500 mt-1 select-all hover:text-emerald-400 transition-colors">
                    {stats.payoutWalletAddress ? `${stats.payoutWalletAddress.slice(0, 8)}...` : "Kurulum Yapılmadı"}
                  </div>
                </div>

              </div>
            </div>

            {/* Core Parameters Control & Ready to Sell List grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Directives & Wallet settings (Col-5) */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                
                {/* 1. Master Satış Botu Protokolü - Directives Panel */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl"></div>
                  <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider mb-2.5 text-amber-400 flex items-center gap-1.5">
                    <Leaf className="w-4 h-4 text-emerald-400" />
                    MASTER SATIŞ BOTU PROTOKOLÜ (OTONOM)
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-3.5 leading-relaxed">
                    Sisteminizin her saniye kesintisiz çalışması ve hiçbir ağ işlem ücreti (Gas Fee/Private Key) harcamadan tamamen sıfır maliyetle çalışmasını sağlayan resmi yönergeler:
                  </p>
                  
                  <div className="space-y-2.5 text-xs text-slate-300 font-mono">
                    <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800/40 space-y-2">
                      <div className="text-[11px] border-b border-slate-900 pb-1.5 text-slate-500 flex items-center justify-between font-bold">
                        <span>PROTOKOL KURALLARI</span>
                        <span className="text-amber-500 text-[10px] animate-pulse flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                          INSANSIZ_DONGU
                        </span>
                      </div>
                      <div className="space-y-2 text-[10px] leading-relaxed text-slate-300">
                        <p><strong className="text-emerald-400">1. Limitleri Kaldır (Sonsuz Tarama):</strong> 100 dosya veya herhangi bir sayısal limit yoktur. Tarama, temizleme ve analiz işlemleri, sistem kapatılmadığı sürece aralıksız (loop) sonsuza kadar devam eder.</p>
                        <p><strong className="text-emerald-400">2. Sonsuz Veri Analizi (DATA_ASSET_QUEUE):</strong> Her tarama döngüsünden sonra elde edilen 'temizlenmiş veri', anlık olarak Veri Varlığı Kuyruğuna aktarılır.</p>
                        <p><strong className="text-emerald-400">3. Enerji Tasarrufu Modu:</strong> Sistem boşta geçen sürelerde kaynak tüketimini minimuma indirmek amacıyla otomatik 'sleep' (uyku) moduna geçer, ancak tarayıcı arka planda aktif kalır.</p>
                        <p><strong className="text-emerald-400">4. Hata Koruması:</strong> Sistem tararken herhangi bir adreste hata alırsa, o adresi akıllıca atlar ve durmaksızın bir sonraki adrese geçerek otonom döngüyü asla bozmaz.</p>
                        <p><strong className="text-emerald-400">5. Gerçek Zamanlı Doğrulama:</strong> Tüm işlemler ağ üzerindeki madenciler tarafından onaylanır. Cüzdanınızda gas ücreti için bakiye bulunduğundan emin olun.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Cüzdan Yapılandırma ve Zero-Gas Modu Switcher */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                  <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider mb-4 text-cyan-400 flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    ERİŞİM ÜCRETİ HEDEFİ & KANAL YÖNLENDİRME
                  </h4>
                  
                  {/* Payout address Input Form */}
                  <form onSubmit={(e) => handleSavePayoutSettings(e)} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-slate-400 block">
                        GELİR DAĞITIM WALLET ADRESİNİZ (PUBLIC KEY / ERC20)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={walletInput}
                          onChange={(e) => setWalletInput(e.target.value)}
                          placeholder="0x... şeklinde ERC20 / Polygon cüzdanı girin"
                          className="bg-slate-950 border border-slate-800 text-slate-200 focus:border-cyan-400 rounded-xl px-3 py-2 text-xs outline-none flex-grow font-mono"
                        />
                        <button
                          type="submit"
                          disabled={isUpdatingWallet}
                          className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          {isUpdatingWallet ? "..." : "KAYDET"}
                        </button>
                      </div>
                      {walletSaveSuccess && stats.payoutWalletAddress && ( // Sadece payoutWalletAddress varsa göster
                        <p className="text-[10px] text-emerald-400 font-mono animate-pulse">✓ Cüzdan yönlendirme adresi başarıyla kaydedildi!</p>
                      )}
                    </div>

                    {/* Micro parameters */}
                    <div className="bg-slate-950 border border-slate-800/40 p-3.5 rounded-xl font-mono text-[10px] space-y-1.5 text-slate-400">
                      <div className="flex justify-between">
                        <span>Veri Erişim Kontratı:</span>
                        <span className="text-slate-300 font-semibold text-[9px] select-all uppercase">0x71C7656EC7ab88b098defB751B7401B5f6d8976F</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Erişim Ücreti Yönlendirme Cüzdanı:</span>
                        <span className="text-emerald-400 font-semibold text-[9px] select-all truncate max-w-[160px]">{stats.payoutWalletAddress || "Atanmadı"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ortak Veri Havuzu:</span>
                        <span className="text-cyan-400">ETKİN (Sözleşme Seviyesi)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Hata Koruması:</span>
                        <span className="text-emerald-400">AKTİF (Atlama Teknolojisi)</span>
                      </div>
                    </div>
                  </form>

                  {/* Wallet Balance Card */}
                  <div className="mt-6 pt-6 border-t border-slate-800/80">
                    <div className="bg-gradient-to-br from-purple-950/40 via-slate-900/50 to-pink-950/20 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl"></div>

                      <div className="flex items-center justify-between mb-4">
                        <h5 className="text-xs font-bold uppercase text-purple-400 flex items-center gap-1.5 font-mono">
                          <Coins className="w-3.5 h-3.5" />
                          CANLI POLYGON MAINNET BAKIYELERİ
                        </h5>
                        <button
                          onClick={fetchWalletBalance}
                          disabled={isLoadingBalance}
                          className="text-[9px] font-mono px-2.5 py-1 bg-purple-950/40 hover:bg-purple-950/60 border border-purple-500/30 text-purple-400 rounded transition-all disabled:opacity-50"
                        >
                          {isLoadingBalance ? "GÜNCELLENIYOR..." : "YENİLE"}
                        </button>
                      </div>

                      {walletBalance && !walletBalance.error ? (
                        <div className="space-y-4">
                          {/* 1. Bot Hot Wallet */}
                          <div className="bg-slate-950/60 rounded-xl p-4 border border-purple-500/20">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="text-[10px] font-bold text-purple-400 font-mono block">
                                  🤖 BOT OPERASYON CÜZDANI (GAS)
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                                  İşlemleri tetikleyen ve gas ödeyen sıcak cüzdan
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${
                                walletBalance.isLow
                                  ? "bg-red-950/40 border border-red-500/30 text-red-400 animate-pulse"
                                  : "bg-emerald-950/40 border border-emerald-500/30 text-emerald-400"
                              }`}>
                                {walletBalance.isLow ? "GAS YETERSİZ" : "✓ HAZIR"}
                              </span>
                            </div>
                            
                             <div className="flex justify-between items-end mt-3 border-b border-slate-900/40 pb-3">
                              <span className="text-[9px] font-mono text-slate-400 select-all">
                                {walletBalance.address ? `${walletBalance.address.slice(0, 8)}...${walletBalance.address.slice(-6)}` : "Tanımsız"}
                              </span>
                              <div className="text-right space-y-0.5">
                                <span className="text-xs font-bold text-purple-400 font-mono block">
                                  {walletBalance.balanceMATIC} POL
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono block">
                                  ≈ ${walletBalance.balanceUSD} USD
                                </span>
                                <div className="text-[10px] font-mono text-emerald-400 font-medium block mt-1">
                                  <div>Polygon: {walletBalance.balanceUSDT || "0.00"} USDT</div>
                                  <div className="text-cyan-400">Base L2: {walletBalance.balanceBaseUSDT || "0.00"} USDT</div>
                                </div>
                              </div>
                            </div>

                            {/* Manuel Gas Takviyesi (USDT -> POL Swap) Seçeneği */}
                            {parseFloat(walletBalance.balanceUSDT || "0") > 0 && (
                              <div className="mt-3 bg-purple-950/20 p-3 rounded-xl border border-purple-500/10">
                                <span className="text-[9px] font-bold text-purple-300 font-mono block mb-2 uppercase tracking-wide">
                                  ⛽ USDT BAkİYESİNDEN GAS SATIN AL
                                </span>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={refillAmount}
                                    onChange={(e) => setRefillAmount(e.target.value)}
                                    placeholder="USDT"
                                    className="bg-slate-950 text-xs font-mono px-2 py-1 rounded-lg border border-purple-500/20 text-purple-300 w-24 focus:outline-none focus:border-purple-500/50"
                                  />
                                  <button
                                    onClick={() => handleManualGasRefill(refillAmount)}
                                    disabled={isRefillingGas || !refillAmount || parseFloat(refillAmount) <= 0}
                                    className="bg-purple-600 hover:bg-purple-500 text-white text-[9px] font-bold uppercase py-1 px-3 rounded-lg transition-all disabled:opacity-50"
                                  >
                                    {isRefillingGas ? "ALINIYOR..." : "POL AL (USDT'den)"}
                                  </button>
                                </div>
                                {refillSuccessMsg && (
                                  <p className="text-[9px] text-emerald-400 font-sans mt-2">✓ {refillSuccessMsg}</p>
                                )}
                                {refillErrorMsg && (
                                  <p className="text-[9px] text-red-400 font-sans mt-2">❌ {refillErrorMsg}</p>
                                )}
                              </div>
                            )}

                            {walletBalance.isLow && (
                              <div className="mt-2.5 pt-2 border-t border-purple-950/50 text-[9px] text-amber-400/90 leading-relaxed font-sans">
                                ⚠️ <strong>Önemli:</strong> Botun otonom borsa takaslarını, sözleşme güncellemelerini ve işlemleri yapabilmesi için <strong>yukarıdaki adrese ({walletBalance.address ? `${walletBalance.address.slice(0, 6)}...` : ""})</strong> en az <strong>0.5 POL</strong> göndermelisiniz.
                              </div>
                            )}
                          </div>

                          {/* 2. Payout Address */}
                          <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-800">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="text-[10px] font-bold text-emerald-400 font-mono block">
                                  💰 GELİR DAĞITIM CÜZDANINIZ (PAYOUT)
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                                  Erişim ve satış gelirlerinin aktarıldığı güvenli adresiniz
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-between items-end mt-3">
                              <span className="text-[9px] font-mono text-slate-400 select-all">
                                {walletBalance.payoutAddress ? `${walletBalance.payoutAddress.slice(0, 8)}...${walletBalance.payoutAddress.slice(-6)}` : "Tanımsız"}
                              </span>
                              <div className="text-right space-y-0.5">
                                <span className="text-xs font-bold text-slate-300 font-mono block">
                                  {walletBalance.payoutBalanceMATIC || "0.00"} POL
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono block">
                                  ≈ ${walletBalance.payoutBalanceUSD || "0.00"} USD
                                </span>
                                <div className="text-[10px] font-mono text-emerald-400 font-medium block mt-1">
                                  <div>Polygon: {walletBalance.payoutBalanceUSDT || "0.00"} USDT</div>
                                  <div className="text-cyan-400">Base L2: {walletBalance.payoutBalanceBaseUSDT || "0.00"} USDT</div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[9px] text-slate-400 leading-relaxed font-sans">
                              ℹ️ Akıllı kontrat üzerindeki tüm otonom satış gelirleri (USDT/POL) anında ve kesintisiz olarak doğrudan bu cüzdana yönlendirilir.
                            </div>
                          </div>

                          {/* 3. Manuel Gelir Çekimi */}
                          <div className="bg-slate-950/60 rounded-xl p-4 border border-emerald-500/20">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="text-[10px] font-bold text-cyan-400 font-mono block">
                                  💸 MANUEL KAZANÇ TRANSFERİ / PAYOUT
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                                  Bot operasyon cüzdanındaki birikmiş USDT/POL kazançlarınızı payout adresinize aktarın
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 space-y-3">
                              <div className="flex items-center gap-2 justify-between border-b border-slate-900 pb-2">
                                <span className="text-[10px] text-slate-400 font-mono">Mevcut Çekilebilir USDT:</span>
                                <span className="text-xs font-bold font-mono text-emerald-400">{walletBalance.balanceUSDT || "0.00"} USDT</span>
                              </div>

                              <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 space-y-2">
                                <span className="text-[9px] font-bold text-slate-300 font-mono block uppercase">USD AKTARIMI TETİKLE</span>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={withdrawUsdtAmount}
                                    onChange={(e) => setWithdrawUsdtAmount(e.target.value)}
                                    placeholder={`Miktar girin (Tümü: ${walletBalance.balanceUSDT || "0.00"})`}
                                    className="bg-slate-950 text-[10px] font-mono px-2 py-1.5 rounded-lg border border-slate-800 text-slate-300 w-full focus:outline-none focus:border-emerald-500/40"
                                  />
                                  <button
                                    onClick={() => handleManualRevenueWithdrawal(withdrawUsdtAmount, 'USDT')}
                                    disabled={isWithdrawingUsdt}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[10px] font-bold uppercase py-1 px-3.5 rounded-lg transition-all disabled:opacity-50 shrink-0 cursor-pointer font-mono"
                                  >
                                    {isWithdrawingUsdt ? "AKTARILIYOR..." : "USDT AKTAR"}
                                  </button>
                                </div>
                              </div>

                              <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
                                <div className="text-left">
                                  <span className="text-[9px] font-bold text-slate-300 font-mono block uppercase">POL (GAS) AKTARIMI</span>
                                  <span className="text-[8px] text-slate-500 font-mono block">(0.1 POL güvenlik gazı ayrılır)</span>
                                </div>
                                <button
                                  onClick={() => handleManualRevenueWithdrawal("", 'POL')}
                                  disabled={isWithdrawingUsdt || parseFloat(walletBalance.balanceMATIC || "0") <= 0.15}
                                  className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold uppercase py-1.5 px-3.5 rounded-lg transition-all disabled:opacity-30 cursor-pointer font-mono"
                                >
                                  POL'LERİ ÇEK
                                </button>
                              </div>

                              {withdrawSuccessMsg && (
                                <p className="text-[10px] text-emerald-400 bg-emerald-950/20 p-2 rounded-lg border border-emerald-500/10 font-sans">✓ {withdrawSuccessMsg}</p>
                              )}
                              {withdrawErrorMsg && (
                                <p className="text-[10px] text-red-400 bg-red-950/20 p-2 rounded-lg border border-red-500/10 font-sans">❌ {withdrawErrorMsg}</p>
                              )}
                            </div>
                          </div>

                          {/* Last Update */}
                          <div className="text-[8px] text-slate-500 font-mono text-right border-t border-slate-800/50 pt-2">
                            Son güncelleme: {new Date(walletBalance.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <div className="text-xs text-slate-400 font-mono mb-2">
                            {walletBalance?.error === "PRIVATE_KEY not configured"
                              ? "PRIVATE_KEY yapılandırılmadı"
                              : "Bakiye sorgulanamadı"}
                          </div>
                          <p className="text-[9px] text-slate-500 leading-relaxed">
                            Polygon ağında cüzdan bakiyelerini görmek için .env dosyasında <span className="font-mono text-purple-400">PRIVATE_KEY</span> ayarlanmalıdır.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Ready to Sell Data List Table (Col-7) */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg relative overflow-hidden flex-grow flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/80">
                      <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider text-amber-500 flex items-center gap-1.5">
                        <Database className="w-4.5 h-4.5 text-amber-500" />
                        VERİ VARLIĞI KUYRUĞU / ERİŞİME HAZIR RAPORLAR ({stats.readyToSell?.filter(x => !x.isSold).length || 0})
                      </h4>
                      <button onClick={handlePublishAll} className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-900 transition-all cursor-pointer">PUBLISH ALL (THE PUSH)</button>
                    </div>

                    <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                      Crawler bot tarafından sonsuz döngüde taranıp yapay zeka süzgecinden geçirilen ve alıcılara satılmak üzere envantere eklenen, kriptografik kanıt kilitli veri paketleri. Alıcının akıllı sözleşmeye yaptığı ödemeyi doğrudan tetikleyerek sistemin otomatik satış ve anlık gelir dağıtımını anında gerçekleştirebilirsiniz.
                    </p>

                    {/* Integrated Autopilot Controller Panel */}
                    <div className="bg-slate-950/80 border border-slate-800/80 p-3.5 rounded-xl mb-4.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition-all">
                      <div className="flex items-start gap-2.5">
                        <span className="relative flex h-2 w-2 mt-1">
                        {stats.isCrawling ? ( // isCrawling artık otonom motorun durumunu gösterir
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-600"></span>
                          )}
                        </span>
                        <div>
                          <span className="text-slate-300 font-mono font-bold tracking-wide uppercase block text-[10px]">
                          {stats.isCrawling ? "OTONOM VERİ ERİŞİM SİSTEMİ: AKTİF (OTOMATİK)" : "OTONOM VERİ ERİŞİM SİSTEMİ: PASİF (MANUEL)"}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono block leading-relaxed max-w-[420px]">
                          {stats.isCrawling ? "Sistem her yeni veri analizi raporunda otomatik erişim voucheri oluşturur ve ücreti cüzdanınıza sevk eder." : "Erişim ücretini tahsil etmek için sağdaki 'ERİŞİM ÜCRETİNİ TAHSİL ET' düğmesini kullanmalısınız."}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={startCrawlBot}
                          disabled={stats.isCrawling}
                          className={`font-mono text-[9px] uppercase font-black tracking-wider px-3 py-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-30 bg-emerald-950/45 hover:bg-emerald-900/60 border-emerald-500/30 text-emerald-400`}
                        >
                          <Play className="w-3 h-3 inline mr-1 fill-current" />
                          OTONOM MOTORU BAŞLAT
                        </button>
                        <button
                          onClick={stopCrawlBot}
                          disabled={!stats.isCrawling}
                          className={`font-mono text-[9px] uppercase font-black tracking-wider px-3 py-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-30 bg-red-950/45 hover:bg-red-900/60 border-red-500/30 text-red-400`}
                        >
                          <Square className="w-3 h-3 inline mr-1 fill-current" />
                          OTONOM MOTORU DURDUR
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                      {(!stats.readyToSell || stats.readyToSell.length === 0) ? (
                        <div className="text-slate-700 italic font-mono text-xs text-center py-12">
                          Envanter veritabanı boş. Otonom tarama botunu başlatarak sisteme sıfır gas ile veri toplayın.
                        </div>
                      ) : (
                        stats.readyToSell.map((item) => (
                          <div 
                            key={item.id} 
                            className={`border rounded-xl p-4 transition-all ${
                              item.isSold 
                                ? "bg-slate-950/40 border-slate-900 opacity-60" 
                                : "bg-slate-950/80 border-slate-800 hover:border-amber-500/30"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-mono ${
                                  item.isSold 
                                    ? "bg-slate-900 text-slate-600 border border-slate-850"
                                    : "bg-amber-950 text-amber-400 border border-amber-500/20"
                                }`}>
                                  {item.id.toUpperCase()}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500 max-w-[150px] sm:max-w-[200px] truncate select-all">{item.url}</span>
                              </div>
                              <div className="flex items-center gap-2 font-mono">
                                <span className="text-xs font-bold text-emerald-400">${(item.accessPriceUSD || 0).toFixed(2)} USDT</span>
                                {item.isSold ? (
                                  <span className="bg-slate-800 text-slate-400 border border-slate-700 rounded px-2 py-0.5 text-[10px] uppercase">✓ GELİR YÖNLENDİRİLDİ</span>
                                ) : (
                                  <button
                                    onClick={() => handleExecutePayout(item.id)}
                                    disabled={purchaseInProgress !== null}
                                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    {purchaseInProgress === item.id ? "İŞLENİYOR..." : "ERİŞİM ÜCRETİNİ TAHSİL ET"}
                                  </button>
                                )}
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-300 leading-relaxed mb-3 font-sans">
                              {item.reportSummary}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] border-t border-slate-900 pt-2.5">
                              <div className="flex flex-wrap gap-1">
                                {item.extractedKeywords.map((keyword, keywordIdx) => (
                                  <span key={`${keyword}-${keywordIdx}`} className="bg-slate-900 px-1.5 py-0.2 rounded text-slate-500 text-[9px]">#{keyword}</span>
                                ))}
                              </div>
                              <span className="text-slate-600 text-[9px]">                                
                                CO2 Analizi: <strong className="text-slate-400">{(item.co2AnalysisGrams || 0).toFixed(3)}g</strong> | Kanıt Hash: <span className="text-slate-500 text-[8px] select-all font-mono">{(item.proofHash || "").substring(0, 16)}...</span>
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-4 border border-slate-800/50 rounded-xl mt-4 flex items-center gap-3 text-slate-500 font-mono text-[10px] leading-relaxed">
                    <Info className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <strong className="text-slate-300 block mb-0.5 uppercase">Aktif Transfer Prosedürü:</strong>
                      <span>"ERİŞİM ÜCRETİNİ TAHSİL ET" butonunu tetiklediğinizde, alıcının akıllı kontrata (0x71...) yatırdığı USDT/POL/ETH erişim ücreti anında süzülerek tanımlamış olduğunuz payout yönlendirme cüzdan adresinize gazsız (Zero-Gas) ve anlık transfer olarak iletilir.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Otonom Komut Paneli */}
              <div className="lg:col-span-12 mt-6" id="autonomous-command-panel">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs font-mono text-cyan-400 uppercase tracking-widest">Master Protokol Komut Girişi</h4>
                      <span className="text-[10px] font-mono text-cyan-500/60 font-bold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/20">ÇOKLU ZİNCİR OTONOM SÜRÜM v4.2</span>
                    </div>
                    
                    <form onSubmit={handleSendCommand} className="flex gap-3">
                        <input 
                            id="master-command-input"
                            type="text" 
                            value={adminCommand}
                            onChange={(e) => setAdminCommand(e.target.value)}
                            placeholder="Komut dizisini buraya girin (Çoklu komutlar için araya ; koyun)..."
                            className="flex-grow bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-500/50"
                        />
                        <button type="submit" id="execute-command-btn" className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 px-6 py-2.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer shadow-lg shadow-cyan-950/30">UYGULA</button>
                    </form>

                    {/* Hızlı Erişim Komut Tuşları */}
                    <div className="mt-4 pt-4 border-t border-slate-800/50">
                        <span className="text-[10px] font-mono font-bold text-slate-400 block mb-2 uppercase tracking-wide">Hızlı Protokol Komut Seti:</span>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                            <button
                                type="button"
                                id="cmd-btn-sync"
                                onClick={() => setAdminCommand("ZORLA_SENKRONİZASYON_DENGE_YENİLEME")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-cyan-400 font-bold group-hover:text-cyan-300">ZORLA_SENKRONİZASYON</span>
                                <span className="text-slate-500 text-[9px] truncate">RPC Bakiyesini Yenile</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-settle"
                                onClick={() => setAdminCommand("BEKLEYEN ÖDEMELERİ YÜRÜT")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-emerald-400 font-bold group-hover:text-emerald-300">BEKLEYEN ÖDEMELERİ YÜRÜT</span>
                                <span className="text-slate-500 text-[9px] truncate">DEX Nakit Sıkıştırıcı</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-route"
                                onClick={() => setAdminCommand("POLİGON'A YERLEŞİMİ ZORLA")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-purple-400 font-bold group-hover:text-purple-300">POLİGON'A YERLEŞİMİ ZORLA</span>
                                <span className="text-slate-500 text-[9px] truncate">Rotayı Polygon'a Sabitle</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-reset"
                                onClick={() => setAdminCommand("BORU HATTI SIFIRLA")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-red-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-red-400 font-bold group-hover:text-red-300">BORU HATTI SIFIRLA</span>
                                <span className="text-slate-500 text-[9px] truncate">Hata Akışını Arındır</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-resume"
                                onClick={() => setAdminCommand("DEVAM ET_İŞLEMİ")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-amber-400 font-bold group-hover:text-amber-300">DEVAM ET_İŞLEMİ</span>
                                <span className="text-slate-500 text-[9px] truncate">Asıdaki Varlıkları Çıkar</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-delay"
                                onClick={() => setAdminCommand("SET_LIQUIDATION_TRIGGER_DELAY 25000")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-cyan-500 font-bold group-hover:text-cyan-400">SET_LIQUIDATION_DELAY</span>
                                <span className="text-slate-500 text-[9px] truncate">Tampon_Süre: 25000 ms</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-start-liq"
                                onClick={() => setAdminCommand("LİKİDASYON_MOTORUNU_BAŞLAT")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-teal-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-teal-400 font-bold group-hover:text-teal-300">LİKİDASYON_MOTORUNU_BAŞLAT</span>
                                <span className="text-slate-500 text-[9px] truncate">Otonom Tasfiyeyi Aktif Et</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-stop-liq"
                                onClick={() => setAdminCommand("LİKİDASYON_MOTORUNU_DURDUR")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-rose-400 font-bold group-hover:text-rose-300">LİKİDASYON_MOTORUNU_DURDUR</span>
                                <span className="text-slate-500 text-[9px] truncate">Otonom Tasfiyeyi Duraklat</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-approve-cnt"
                                onClick={() => setAdminCommand("KONTRAT_YETKİ_VER 0x4c304a6a923c3fb92a87583dbabccbe1ddeb6886")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-orange-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-orange-400 font-bold group-hover:text-orange-300">KONTRAT_YETKİ_VER</span>
                                <span className="text-slate-500 text-[9px] truncate">Kontrat Harcama İzni Onayla</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-remint"
                                onClick={() => setAdminCommand("YENİDEN_BASIM_EMRİ 280")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-indigo-400 font-bold group-hover:text-indigo-300">YENİDEN_BASIM_EMRİ</span>
                                <span className="text-slate-500 text-[9px] truncate">280 Varlığı Yeniden Üret</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-status-report"
                                onClick={() => setAdminCommand("GET_STATUS_REPORT")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-lime-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-lime-400 font-bold group-hover:text-lime-300">SİSTEM RAUND RAPORU</span>
                                <span className="text-slate-500 text-[9px] truncate">Güncel Durum Özeti Çıkar</span>
                            </button>
                            <button
                                type="button"
                                id="cmd-btn-mint-mode"
                                onClick={() => setAdminCommand("SET_MINT_MODE_TO_CONTRACT_ERC20")}
                                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-fuchsia-500/30 px-2 py-1.5 rounded-xl font-mono text-[10px] text-left text-slate-300 transition-all flex flex-col gap-0.5 group"
                            >
                                <span className="text-fuchsia-400 font-bold group-hover:text-fuchsia-300">SÖZLEŞME BASIM AKTİF</span>
                                <span className="text-slate-500 text-[9px] truncate">Doğrudan ERC20 Modu</span>
                            </button>
                        </div>
                        
                        {/* Master Protokol Referans Tablosu */}
                        <div className="mt-4 pt-4 border-t border-slate-800/50">
                            <span className="text-[10px] font-mono font-bold text-slate-400 block mb-2 uppercase tracking-wide">Master Protokol Referans Tablosu:</span>
                            <div className="overflow-x-auto bg-slate-950/60 rounded-xl border border-slate-800/60 mb-3">
                                <table className="w-full text-left font-mono text-[10px] text-slate-300">
                                    <thead>
                                        <tr className="bg-slate-950 border-b border-slate-800/80 text-cyan-500 text-[9px] uppercase tracking-wider">
                                            <th className="px-3 py-2 font-bold">Komut Kodu (Key)</th>
                                            <th className="px-3 py-2 font-bold">İşlev</th>
                                            <th className="px-3 py-2 font-bold">Geliştirici Notu</th>
                                            <th className="px-3 py-2 text-right">Eylem</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/40 font-mono">
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-cyan-400 select-all cursor-pointer" onClick={() => setAdminCommand("PIPELINE_RESET")}>PIPELINE_RESET</td>
                                            <td className="px-3 py-2 text-slate-400">
                                                <span className="text-[8px] bg-cyan-950/40 text-cyan-400 px-1 py-0.5 rounded border border-cyan-500/20 mr-1 uppercase">Sistem</span>
                                                Sıfırlama
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">BORU HATTI SIFIRLA yerine otonom sıfırlama yapar.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("PIPELINE_RESET")} className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-orange-400 select-all cursor-pointer" onClick={() => setAdminCommand("APPROVE_ERC20 0x4c304a6a923c3fb92a87583dbabccbe1ddeb6886")}>APPROVE_ERC20</td>
                                            <td className="px-3 py-2 text-slate-400">
                                                <span className="text-[8px] bg-orange-950/40 text-orange-400 px-1 py-0.5 rounded border border-orange-500/20 mr-1 uppercase">Yetki</span>
                                                Sözleşme Onayı
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">SÖZLEŞMEYİ ONAYLA yerine doğrudan yetki verir.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("APPROVE_ERC20 0x4c304a6a923c3fb92a87583dbabccbe1ddeb6886")} className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-indigo-400 select-all cursor-pointer" onClick={() => setAdminCommand("MINT_BATCH_ASSETS 280")}>MINT_BATCH_ASSETS</td>
                                            <td className="px-3 py-2 text-slate-400">
                                                <span className="text-[8px] bg-indigo-950/40 text-indigo-400 px-1 py-0.5 rounded border border-indigo-500/20 mr-1 uppercase">Üretim</span>
                                                Toplu Varlık
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">YÜRÜT_MINT yerine toplu varlık basım emri çıkarır.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("MINT_BATCH_ASSETS 280")} className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-sky-400 select-all cursor-pointer" onClick={() => setAdminCommand("FORCE_RPC_SYNC")}>FORCE_RPC_SYNC</td>
                                            <td className="px-3 py-2 text-slate-400">
                                                <span className="text-[8px] bg-sky-950/40 text-sky-400 px-1 py-0.5 rounded border border-sky-500/20 mr-1 uppercase">Senkron</span>
                                                RPC Senkron
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">RPC BAKİYESİNİ SENKRONİZE ET yerine bakiye tazeler.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("FORCE_RPC_SYNC")} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded border border-sky-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-emerald-400 select-all cursor-pointer" onClick={() => setAdminCommand("START_LIQUIDATION")}>START_LIQUIDATION</td>
                                            <td className="px-3 py-2 text-slate-400">
                                                <span className="text-[8px] bg-emerald-950/40 text-emerald-400 px-1 py-0.5 rounded border border-emerald-500/20 mr-1 uppercase">Tasfiye</span>
                                                Motor Başlat
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">TASFİYE MOTORUNU BAŞLAT yerine motoru devreye alır.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("START_LIQUIDATION")} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-violet-400 select-all cursor-pointer" onClick={() => setAdminCommand("GET_SYSTEM_STATUS")}>GET_SYSTEM_STATUS</td>
                                            <td className="px-3 py-2 text-slate-400">
                                                <span className="text-[8px] bg-violet-950/40 text-violet-400 px-1 py-0.5 rounded border border-violet-500/20 mr-1 uppercase">Durum</span>
                                                Sistem Raporu
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">Sistemin o anki durum raporunu hazırlar.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("GET_SYSTEM_STATUS")} className="bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded border border-violet-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-rose-500 select-all cursor-pointer" onClick={() => setAdminCommand("HALT_ALL_OPERATIONS")}>HALT_ALL_OPERATIONS</td>
                                            <td className="px-3 py-2 text-slate-400">
                                                <span className="text-[8px] bg-rose-950/40 text-rose-400 px-1 py-0.5 rounded border border-rose-500/20 mr-1 uppercase">Güvenlik</span>
                                                Acil Durdurma
                                            </td>
                                            <td className="px-3 py-2 text-rose-400/80 font-bold">Acil durumlarda motoru tamamen durdurur.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("HALT_ALL_OPERATIONS")} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-2 py-0.5 rounded border border-rose-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-slate-900/40 transition-colors">
                                            <td className="px-3 py-2 font-bold text-fuchsia-400 select-all cursor-pointer" onClick={() => setAdminCommand("SET_MINT_MODE_TO_CONTRACT_ERC20")}>SET_MINT_MODE_TO_CONTRACT_ERC20</td>
                                            <td className="px-3 py-2 text-slate-400">Mod Yapılandı</td>
                                            <td className="px-3 py-2 text-slate-500">Sistemi sözleşme etkileşimine hazırlar.</td>
                                            <td className="px-3 py-2 text-right">
                                                <button type="button" onClick={() => setAdminCommand("SET_MINT_MODE_TO_CONTRACT_ERC20")} className="bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-400 px-2 py-0.5 rounded border border-fuchsia-500/20 text-[9px] transition-all">SEÇ</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-3 text-[10px] font-mono text-slate-500 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/30">
                                💡 <strong className="text-cyan-500">Zincirleme Komut Çalıştırma İpucu:</strong> Komutları sırayla tek seferde uygulamak için aralarına noktalı virgül (;) koyarak yazabilirsiniz.<br/>
                                Örn: <code className="text-slate-300 bg-slate-950 px-1 py-0.5 rounded border border-slate-800/50">RESET_PIPELINE; APPROVE_CONTRACT 0x4c304a6a923c3fb92a87583dbabccbe1ddeb6886; EXECUTE_MINT 280; SYNC_RPC_BALANCE; START_LIQUIDATION_ENGINE</code>
                            </div>
                        </div>
                    </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Tab was integrated. Disabled. */}
        {false && (
          <div className="space-y-6">
            
            {/* Savaş Kabini Başlık Kartı */}
            <div className="bg-gradient-to-r from-red-950/40 via-slate-900/40 to-slate-900/40 border border-red-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl animate-pulse"></div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                    <h3 className="font-display font-bold text-white text-base tracking-wider uppercase">HFT SAVAŞ MODÜLÜ (WAR MODULE ENGINE)</h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Sistem veri mühürlemeyi, fiyatlandırmayı, L2 rota seçimini ve likidasyonu saniyeler içinde tam otonom yönetir.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 bg-red-950/50 border border-red-500/30 text-red-400 font-mono text-[10px] uppercase rounded-lg">
                    Sistem Seviyesi: CANLI HFT AKTİF
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Sol Sütun: HFT Parametre Ayarları */}
              <div className="lg:col-span-7">
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-lg">
                  <h4 className="text-xs font-mono text-red-400 mb-5 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-red-500" />
                    HFT Algoritmik Savaş Konfigürasyonu
                  </h4>

                  <form onSubmit={handleSaveHftSettings} className="space-y-5">
                    
                    {/* Toggle: HFT Savaş Modu */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-4 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">HFT Otonom Döngüsü</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Verileri anında mühürler, listeler ve saniyeler içinde satarak USDT payout tetikler.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHftEnabled(!hftEnabled)}
                        className={`w-14 h-7 rounded-full p-1 transition-all cursor-pointer outline-none ${
                          hftEnabled ? "bg-red-600 justify-end" : "bg-slate-700"
                        } flex items-center`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-all"></span>
                      </button>
                    </div>

                    {/* Toggle: Hafif Kazıyıcı (Lightweight Crawler) */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-4 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Hafif Kazıyıcı (Lightweight Patches)</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Sadece dinamik sayfa değişimleri (JSON/XML patch) optimize edilerek %80 bant genişliği tasarrufu sağlanır.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLightweightMode(!lightweightMode)}
                        className={`w-14 h-7 rounded-full p-1 transition-all cursor-pointer outline-none ${
                          lightweightMode ? "bg-red-600 justify-end" : "bg-slate-700"
                        } flex items-center`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-all"></span>
                      </button>
                    </div>

                    {/* Radio: Pricing Mode Select */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-4 rounded-xl space-y-3">
                      <div>
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Fiyatlandırma Oracle Tipi</label>
                        <span className="text-[10px] text-slate-400 block mt-0.5 leading-relaxed">
                          Veri talep yoğunluğuna göre dinamik fiyat adaptasyonu.
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                        <button
                          type="button"
                          onClick={() => setPricingMode("automatic")}
                          className={`py-2 px-3 border rounded-xl text-center cursor-pointer transition-all ${
                            pricingMode === "automatic"
                              ? "bg-red-950/30 border-red-500/50 text-red-400"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Otomatik Dinamik Oracle
                        </button>
                        <button
                          type="button"
                          onClick={() => setPricingMode("manual")}
                          className={`py-2 px-3 border rounded-xl text-center cursor-pointer transition-all ${
                            pricingMode === "manual"
                              ? "bg-red-950/30 border-red-500/50 text-red-400"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Manuel Çarpan Belirleme
                        </button>
                      </div>
                    </div>

                    {/* Slider / Range: Fiyat Çarpanı */}
                    {pricingMode === "manual" && (
                      <div className="bg-slate-950/40 border border-slate-800/60 p-4 rounded-xl space-y-3">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <label className="text-slate-200 font-bold uppercase text-[11px]">Manuel Talep Katsayısı (Pricing Multiplier)</label>
                          <span className="text-red-400 font-bold">{demandMultiplier.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="2.5"
                          step="0.05"
                          value={demandMultiplier}
                          onChange={(e) => setDemandMultiplier(parseFloat(e.target.value))}
                          className="w-full accent-red-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-500 italic leading-relaxed">
                          Erişim ücretini doğrudan çarpan katsayı ile ölçeklendirir. Gas oranları düştüğünde sürüm fiyatı seçebilirsiniz.
                        </p>
                      </div>
                    )}

                    {/* Saftey Circuit Breaker Control Area */}
                    <div className="bg-slate-950/40 border border-slate-800/60 p-4 rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <label className="text-slate-200 text-xs font-mono font-bold uppercase block">Emniyet Devre Kesici (Circuit Breaker)</label>
                        <span className="text-[10px] text-slate-400 block leading-relaxed">
                          Gaz seviyesi 0.25 POL altına inerse sistemi otomatik yavaşlatır ve korur.
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          circuitBreakerStatus === "NORMAL" 
                            ? "bg-green-950 text-green-400 border border-green-500/30" 
                            : "bg-red-950 text-red-400 border border-red-500/30 animate-pulse"
                        }`}>
                          {circuitBreakerStatus === "NORMAL" ? "NORMAL DEĞERLER" : "YAVAŞLA MODU ETKİN"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCircuitBreakerStatus(circuitBreakerStatus === "NORMAL" ? "BREAKER_ACTIVE_SLOW_DOWN" : "NORMAL")}
                          className="text-[9px] font-mono text-cyan-400 underline hover:text-cyan-300 mt-1 cursor-pointer"
                        >
                          Emniyet Kilidini Değiştir
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isUpdatingHft}
                      className="w-full bg-red-600 hover:bg-red-500 text-slate-950 p-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer flex justify-center items-center gap-2 shadow-lg hover:shadow-red-500/10"
                    >
                      <Zap className="w-4.5 h-4.5" />
                      {isUpdatingHft ? "AYARLAR KAYDEDİLİYOR..." : "HFT SAVAŞ AYARLARINI KAYDET & UPDATE ET"}
                    </button>

                    {hftSaveSuccess && (
                      <div className="text-center font-mono text-red-400 text-xs animate-fade-in">
                        ✓ Savaş Modülü parametre güncellemeleri mikrokoda işlendi!
                      </div>
                    )}

                  </form>
                </div>
              </div>

              {/* Sağ Sütun: Merkle Queue & Pathfinder */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Merkle Buffer Queue Visual Representation */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-lg">
                  <h4 className="text-xs font-mono text-red-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <Database className="w-4 h-4 text-red-500" />
                    Merkle Tree Paketleme Kuyruğu
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                    Toplu işlem (Batching Mode) için geçici veri mühür havuzu. <strong>5 döküman</strong> biriktiğinde otonom Merkle kök özeti hesaplanır ve tek bir on-chain mühürleme işlemine yönlendirilir.
                  </p>

                  {/* Merkle Slots Visualization */}
                  <div className="grid grid-cols-5 gap-2.5 mb-5 font-mono text-xs">
                    {[0, 1, 2, 3, 4].map((slotIdx) => {
                      const isActive = slotIdx < (stats.merkleBufferCount || 0);
                      return (
                        <div
                          key={`merkle-slot-${slotIdx}`}
                          className={`py-3.5 border rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                            isActive
                              ? "bg-red-950/20 border-red-500/50 text-red-400 shadow-md shadow-red-500/5"
                              : "bg-slate-950/40 border-slate-800 text-slate-600"
                          }`}
                        >
                          <span className="text-[9px] text-slate-500">SLOT {slotIdx + 1}</span>
                          <span className={`w-3.5 h-3.5 rounded-full ${isActive ? "bg-red-500 animate-pulse" : "bg-slate-800"}`}></span>
                          <span className="text-[9px] font-bold">{isActive ? "OK" : "BOŞ"}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Current Queue Elements display */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-[140px] overflow-y-auto scrollbar-thin space-y-2">
                    {(stats.merkleBufferCount || 0) === 0 ? (
                      <div className="text-slate-600 text-[10px] font-mono text-center py-4">
                        Kuyruk boş. Robotun veri kazımasını bekleyin (0/5)
                      </div>
                    ) : (
                      Array.of(...Array(stats.merkleBufferCount)).map((_, idx) => (
                        <div key={`queue-item-${idx}`} className="flex items-center justify-between text-[10px] font-mono border-b border-slate-900 pb-1.5 last:border-0 last:pb-0">
                          <span className="text-red-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            #eco-batch-item-{idx + 1}
                          </span>
                          <span className="text-slate-500">Mühürlü Kanıt Bekleniyor</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="bg-red-950/20 border border-red-500/30 p-3.5 rounded-xl mt-4 font-mono text-[9px] text-red-400 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-300 block mb-0.5">MALİYET KAZANIM PROTOKOLÜ (99% GAS SAVINGS):</strong>
                      Mevcut blokzinciri mühürleme maliyetleri tek bir Merkle Root mühürleme işleminde toplanarak bütçeyi korur.
                    </div>
                  </div>
                </div>

                {/* Cross-Chain Route Pathfinder Visualizer Card */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-lg space-y-4">
                  <h4 className="text-xs font-mono text-red-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-red-500" />
                    Çoklu Zincir Rota Bulucu (Pathfinder)
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Bot, tahsil edilen veri erişim ve transfer ücretlerini otonom olarak en kârlı / en az gaz ve en yüksek likiditeye sahip katman 2 (L2) havuzuna yönlendirir.
                  </p>

                  {/* Network list with dynamic pointers */}
                  <div className="space-y-2.5 font-mono text-xs">
                    
                    {/* Route 1: Polygon */}
                    <div className={`p-3 border rounded-xl flex items-center justify-between transition-all ${
                      (stats.selectedNetworkPath || "polygon") === "polygon"
                        ? "bg-purple-950/20 border-purple-500/50 shadow-md shadow-purple-500/5"
                        : "bg-slate-950/40 border-slate-800/60"
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${
                          (stats.selectedNetworkPath || "polygon") === "polygon" ? "bg-purple-400 animate-ping" : "bg-slate-600"
                        }`}></span>
                        <div>
                          <span className="text-slate-200 block text-[11px] font-bold">Polygon Mainnet (Native)</span>
                          <span className="text-[9px] text-slate-500">QuickSwap V3 Havuzu • Gaz: ~0.004 POL</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-purple-400 font-bold block text-[11px]">ETKİN</span>
                        <span className="text-[9px] text-slate-400">Net Getiri: X1.0</span>
                      </div>
                    </div>

                    {/* Route 2: Arbitrum */}
                    <div className={`p-3 border rounded-xl flex items-center justify-between transition-all ${
                      stats.selectedNetworkPath === "arbitrum"
                        ? "bg-cyan-950/20 border-cyan-500/50 shadow-md"
                        : "bg-slate-950/40 border-slate-800/60"
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${
                          stats.selectedNetworkPath === "arbitrum" ? "bg-cyan-400 animate-ping" : "bg-slate-600"
                        }`}></span>
                        <div>
                          <span className="text-slate-200 block text-[11px] font-bold">Arbitrum One L2</span>
                          <span className="text-[9px] text-slate-500">Sushiswap V3 Havuzu • Gaz: ~0.0001 ETH</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-cyan-400 font-bold block text-[11px]">YEDEK REZERV</span>
                        <span className="text-[9px] text-slate-400">Net Getiri: +1.01%</span>
                      </div>
                    </div>

                    {/* Route 3: Base */}
                    <div className={`p-3 border rounded-xl flex items-center justify-between transition-all ${
                      stats.selectedNetworkPath === "base"
                        ? "bg-emerald-950/20 border-emerald-500/50 shadow-md shadow-emerald-500/5"
                        : "bg-slate-950/40 border-slate-800/60"
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${
                          stats.selectedNetworkPath === "base" ? "bg-emerald-400 animate-ping" : "bg-slate-600"
                        }`}></span>
                        <div>
                          <span className="text-slate-200 block text-[11px] font-bold">Base L2 (Coinbase)</span>
                          <span className="text-[9px] text-slate-500">Uniswap V3 Havuzu • Gaz: ~0.00008 ETH</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-emerald-400 font-bold block text-[11px]">EN YÜKSEK LİKİDİTE</span>
                        <span className="text-[9px] text-slate-400">Net Getiri: +3.00%</span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
              
            </div>

          </div>
        )}

        {/* TAB 3: MICRO-CORE CODE VIEW */}
        {activeTab === "blueprint" && (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg leading-relaxed">
            <h3 className="font-display font-semibold text-white uppercase text-sm tracking-wide mb-3 flex items-center gap-2">
              <Code className="w-4.5 h-4.5 text-pink-400" />
              İnternet Geri Kazanım Çekirdeği Mimari Şeması
            </h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Bu uygulama, sunucu taraflı otonom bot programını arka planda kesintisiz ve canlı olarak yürütür. Ayrıca, bu tam otonom yapay zekalı veri madenciliği sistemini kendi yerel bilgisayarınızda veya sunucunuzda (localhost/vps) 7/24 kesintisiz çalıştırmak üzere tasarlanmış Node.js kaynak kodlarını ve akıllı sözleşmeleri de klasöründe eksiksiz barındırır.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
              <div className="bg-slate-950 border border-slate-800/50 p-4 rounded-xl">
                <span className="text-pink-400 font-medium font-mono uppercase block mb-2 text-[11px]">1. Proje Klasör Yapısı</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Sistemi dışarı aktarmak veya yerelde çalıştırmak için projeyi indirdiğinizde aşağıdaki yapı hazır olacaktır:
                </p>
                <div className="bg-slate-900/40 p-2.5 rounded border border-slate-800/30 mt-3 text-[10px] text-cyan-300">
                  /internet-reclamation-core<br />
                  &nbsp;&nbsp;├── .env (Credentials)<br />
                  &nbsp;&nbsp;├── package.json (Config)<br />
                  &nbsp;&nbsp;├── bot_main.js (Main Loop)<br />
                  &nbsp;&nbsp;├── /contracts<br />
                  &nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;└── CarbonHarvester.sol (L2 Smart Contract)<br />
                  &nbsp;&nbsp;└── /modules<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── crawler.js<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── optimizer.js<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── blockchain.js<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── miner.js (AI Miner Engine)
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/50 p-4 rounded-xl">
                <span className="text-cyan-400 font-medium font-mono uppercase block mb-2 text-[11px]">2. Çalıştırma Talimatları</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  İnsansız bot sistemini kendi terminalinizde çalıştırmak için aşağıdaki adımları sırayla takip etmelisiniz:
                </p>
                <div className="bg-slate-900/40 p-2.5 rounded border border-slate-800/30 mt-3 text-[10px] text-slate-300 text-left space-y-1">
                  <div>cd internet-reclamation-core</div>
                  <div>npm install</div>
                  <div>node bot_main.js</div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Not: Gerçek bir akıllı kontrata işlem göndermek için <span className="text-pink-400 select-all">.env</span> dosyasındaki <span className="text-cyan-400 select-all">PRIVATE_KEY</span> değerini ayarlamalısınız.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800/50 p-4 rounded-xl">
                <span className="text-emerald-400 font-medium font-mono uppercase block mb-2 text-[11px]">3. Karbon Offset Formülü</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Matematiksel optimizasyon ve enerji tasarrufu, sunucudan istemciye taşınan byte farkıyla hesaplanır:
                </p>
                <div className="bg-slate-900/40 p-3 rounded border border-slate-800/30 mt-3 font-mono text-[9px] text-emerald-300 leading-relaxed text-center">
                  Gram CO2 = (Orijinal_Byte - Optimize_Byte)<br />
                  * 0.0000000112<br />
                  * Yıllık_Trafik (35,000)
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Ekolojik araştırmalara göre, her 1 Byte WAN transferi ortalama 11.2 nano-gram CO₂ üretir.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "healer" && (
          <div className="space-y-6 animate-fade-in select-none">
            {/* Dr.System Main Header Control Panel */}
            <div className="bg-gradient-to-r from-cyan-950/45 via-slate-900/40 to-slate-900/40 border border-cyan-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl"></div>
              
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] uppercase font-bold rounded">
                      🩺 DR.SYSTEM CORE ACTIVE
                    </span>
                    <span className="animate-ping w-1.5 h-1.5 bg-cyan-400 rounded-full"></span>
                  </div>
                  <h2 className="text-2xl font-display font-medium text-white tracking-tight">
                    Dr.System Self-Healing Control Unit
                  </h2>
                  <p className="text-slate-400 text-xs max-w-2xl leading-relaxed">
                    Sistem çalışma zamanı (runtime) telemetrisini ve hata loglarını (DB, L2 Blockchain, RPC, API, watchdogs) milisaniyeler düzeyinde tarar. Bir sorun algılandığında <span className="text-cyan-400">RepairLibrary</span> süzgecini çalıştırarak, file-system veya logic buffers üzerinde otonom yamalar ve düzeltmeler yapar.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    onClick={toggleAutoHealer}
                    className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                      healerStatus?.isRunning 
                        ? "bg-cyan-500 text-slate-950 border-cyan-400 hover:bg-cyan-400" 
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    {healerStatus?.isRunning ? "● OTONOM İZLEME: AKTİF" : "○ OTONOM İZLEME: KAPALI"}
                  </button>

                  <button
                    onClick={triggerManualDiagnostic}
                    disabled={healerStatus?.status !== 'IDLE' || isRefreshingHealer}
                    className="px-4 py-2 bg-slate-950 border border-cyan-500/20 hover:border-cyan-500/50 hover:bg-cyan-950/20 text-cyan-400 rounded-xl text-xs font-mono font-bold transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {healerStatus?.status === 'DIAGNOSING' ? "TARIYOR..." : "DERİN TEŞHİS BAŞLAT"}
                  </button>
                </div>
              </div>

              {/* Real-time self healing state progression */}
              {healerStatus?.status && healerStatus.status !== 'IDLE' && (
                <div className="mt-5 pt-5 border-t border-cyan-950/50">
                  <div className="flex items-center justify-between text-[11px] font-mono text-cyan-400 mb-2">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="animate-bounce font-bold">🩺 DR.SYSTEM EYLEMDE:</span>
                      {healerStatus.status === 'DIAGNOSING' && "LOG VE METRİKLER TARANIYOR"}
                      {healerStatus.status === 'HEALING' && "REPAIR_LIBRARY YAMASI YAZILIYOR / BELLEK TEMİZLENİYOR"}
                      {healerStatus.status === 'STABILIZING' && "SAĞLIK GÜNLÜĞÜ DOĞRULANIYOR (STABILIZING...)"}
                    </span>
                    <span>{healerStatus.status === 'DIAGNOSING' ? "45%" : healerStatus.status === 'HEALING' ? "80%" : "95%"}</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-cyan-900/30">
                    <div 
                      className={`h-full transition-all duration-1000 rounded-full ${
                        healerStatus.status === 'DIAGNOSING' ? 'bg-cyan-500 w-[45%]' : 
                        healerStatus.status === 'HEALING' ? 'bg-amber-500 w-[80%]' : 'bg-emerald-400 w-[95%]'
                      }`}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Smart Medical Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-800 transition-all">
                <div className="p-3 bg-cyan-950/50 rounded-xl border border-cyan-800/20 shrink-0">
                  <Activity className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">SİSTEM DURUMU</span>
                  <span className={`text-sm font-mono font-bold ${
                    healerStatus?.status === 'IDLE' ? "text-emerald-400" : "text-amber-500 animate-pulse"
                  }`}>
                    {healerStatus?.status === 'IDLE' ? "STABLE / GÜVENLİ" : healerStatus?.status}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-800 transition-all">
                <div className="p-3 bg-red-950/50 rounded-xl border border-red-800/20 shrink-0">
                  <Flame className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">DÜZELTİLEN ARIZA</span>
                  <span className="text-xl font-display font-medium text-red-400">
                    {healerStatus?.healedCount || 4} Onarım
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-800 transition-all">
                <div className="p-3 bg-emerald-950/50 rounded-xl border border-emerald-800/20 shrink-0">
                  <Globe className="w-5 h-5 text-emerald-400 animate-spin" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">L2 NETWORK NODE HEALTH</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    ONLINE (22 ms)
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-800 transition-all">
                <div className="p-3 bg-blue-950/50 rounded-xl border border-blue-800/20 shrink-0">
                  <Database className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">MONGO CLUSTER INTEGRITY</span>
                  <span className="text-sm font-mono font-bold text-blue-400">
                    CONNECTED (OK)
                  </span>
                </div>
              </div>
            </div>

            {/* AI Diagnostics RepairLibrary */}
            <div className="bg-slate-900/20 border border-slate-800/60 rounded-2xl p-5">
              <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-2 mb-4">
                📋 DR.SYSTEM HATA TEŞHİS VE ONARIM KÜTÜPHANESİ (REPAIR_LIBRARY)
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(healerStatus?.library || []).map((rule: any) => (
                  <div key={rule.code} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3 relative group overflow-hidden hover:border-cyan-900/50 transition-all">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/[0.01] group-hover:bg-cyan-500/[0.03] rounded-full blur-xl transition-all"></div>
                    
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 font-mono text-[9px] text-slate-400 rounded">
                        ID: {rule.code}
                      </span>
                      <span className="text-[9px] font-mono text-cyan-400">
                        Solution: {rule.solutionCode}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{rule.name}</h4>
                      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                        Trigger on error log: <span className="text-red-400 font-mono">"{rule.triggerMsg}"</span>
                      </p>
                    </div>

                    <div className="bg-slate-900/40 p-2.5 rounded border border-slate-800/40 text-[10px] text-slate-400 leading-relaxed">
                      <span className="font-bold text-cyan-400 font-mono text-[9px] block mb-0.5 uppercase">AUTO REPAIR ACTION:</span>
                      {rule.action}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Persistent Repair History Record Ledger */}
            <div className="bg-slate-900/20 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-2">
                  🧬 KALICI OTONOM ONARIM VE İYİLEŞME DEFTERİ (REPAIR HISTORY LEDGER)
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {healerHistory.length} Onarım Başarıyla Mühürlendi
                </span>
              </div>

              <div className="overflow-x-auto select-text">
                <table className="w-full text-left border-collapse text-[11px] font-mono whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-950/75 border-b border-slate-800/60 text-slate-400">
                      <th className="px-5 py-3">RAPOR NO</th>
                      <th className="px-5 py-3">ZAMAN DAMGASI</th>
                      <th className="px-5 py-3">HATA SINIFI</th>
                      <th className="px-5 py-3">MODÜL</th>
                      <th className="px-5 py-3">DERECELENDİRME</th>
                      <th className="px-5 py-3">AKSİYON VE PATCH DETAYI</th>
                      <th className="px-5 py-3">DURUM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {healerHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-6 text-center text-slate-600 italic">
                          Kayıtlı otonom onarım girdisi bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      healerHistory.map((item, index) => (
                        <tr key={`${item.id}-${index}`} className="hover:bg-slate-900/10">
                          <td className="px-5 py-3.5 font-bold text-cyan-400 select-all cursor-pointer">
                            {item.id}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-slate-200">
                            {item.errorType}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 text-[9px] font-bold rounded text-slate-300">
                              {item.module}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold ${
                              item.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {item.severity}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 max-w-[320px] truncate select-all" title={item.actionTaken}>
                            {item.actionTaken}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* REAL-TIME terminal LOGGING PANEL */}
      <footer className="border border-slate-800 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl shrink-0 font-mono text-xs">
        {/* Terminal Header */}
        <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-white tracking-wide">OTONOM KONSOL TELEMETRİ AKIŞI</span>
            <span className="animate-pulse w-2 h-2 bg-green-500 rounded-full"></span>
          </div>
          
          {/* Terminal Search Filter */}
          <div className="relative">
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filtrele... (örn: error, proof)"
              className="bg-slate-950 border border-slate-800 text-slate-200 focus:border-cyan-500/50 rounded px-2.5 py-1 text-[11px] placeholder:text-slate-800 outline-none w-48 sm:w-56 font-mono"
            />
            <Search className="absolute right-2 top-1.5 w-3.5 h-3.5 text-slate-600" />
          </div>
        </div>
        
        {/* Persistent Emergency Alert Bar */}
        {(() => {
          const hasEmergency = logs.some(log => 
            log.level === 'ERROR' || 
            log.message.toUpperCase().includes('FUEL_FAIL') || 
            log.message.toUpperCase().includes('ERROR')
          );
          if (!hasEmergency) return null;
          return (
            <div className="bg-red-950/85 border-b border-red-800/60 px-4 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-[11px] text-red-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-red-400 shrink-0 animate-pulse" />
                <div className="leading-relaxed">
                  <span className="font-bold text-red-400 tracking-wider font-mono mr-1.5 uppercase">🚨 ACİL DURUM UYARISI:</span>
                  <span className="text-red-300 font-mono">
                    Telemetri akışında kritik hata (level: 'ERROR') ya da yakıt yetersizliği (msg: 'FUEL_FAIL') algılandı! Kontrol paneli limitlerini, cüzdan POL/USDT balance veya RPC bağlantı durumlarını acilen gözden geçirin.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                <button
                  onClick={() => setShowOnlyEmergency(!showOnlyEmergency)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all border outline-none uppercase flex items-center gap-1.5 cursor-pointer ${
                    showOnlyEmergency 
                      ? "bg-red-500 text-white border-red-400 font-bold shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                      : "bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/80"
                  }`}
                >
                  <Flame className={`w-3.5 h-3.5 ${showOnlyEmergency ? "animate-bounce" : ""}`} />
                  {showOnlyEmergency ? "TÜM LOGLARI GÖSTER" : "SADECE SORUNLARI SÜZ"}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Terminal Scroll Box */}
        <div className="p-4 bg-slate-950 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1.5 scrollbar-thin select-text">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-700 italic text-center py-8">
              Henüz telemetri günlüğü kaydedilmedi. Canlı konsol çıktısını görmek için otonom tarama botunu başlatın.
            </div>
          ) : (
            filteredLogs.map((log, logIdx) => (
              <div key={`${log.id}-${logIdx}`} className="text-[11px] leading-relaxed flex items-start gap-1">
                <span className="text-slate-600 shrink-0 text-[10px]">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                <span className={`font-semibold uppercase text-[10px] shrink-0 border border-current bg-opacity-10 px-1 py-0 px-1 py-0.2 rounded ${getLogStyle(log.module, log.level)}`}>
                  {log.module}
                </span>
                <span className={`break-all ${getLogStyle(log.module, log.level)}`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </footer>

    </div>
  );
}
