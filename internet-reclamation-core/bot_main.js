/**
 * @file bot_main.js
 * @description Central control center and execution loop of the Internet Reclamation Bot.
 * Harmonizes the Crawler, Optimizer, and Blockchain routers into a continuous,
 * autonomous sweep engine that discovers dark data, cleanses code structures,
 * calculates server optimization energy savings, and secures crypto-credits.
 * 
 * @author Senior Software Architect & Cybersecurity Expert
 * @license SPDX-License-Identifier: Apache-2.0
 */

// Load Environment variables
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const WebCrawler = require('./modules/crawler');
const DataOptimizer = require('./modules/optimizer');
const BlockchainRouter = require('./modules/blockchain');
const ContentMiner = require('./modules/miner');

const STATE_FILE = path.join(__dirname, 'reclamation_state.json');

// Console Color Utility Codes
const COLORS = {
    CYAN: '\x1b[36m',
    GREEN: '\x1b[32m',
    MAGENTA: '\x1b[35m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
};

function banner() {
    console.log(COLORS.CYAN + COLORS.BOLD + `
========================================================================
     __                               __                                
  /|/  |                             /  |                               
  (___ | ___ _ __  ___ _ __   ___ _ _ __|  ___  ___  _ __  _ _   ___ _  
  |   )|  _)| '__)/ _ ) '_ \\ / _ ) '_)| | / _ \\/ _ )| '_ \\| '_) / _ ) _\\ 
  |  / | (_)| |  (  _/( | | |  _/( (__| |( (_((  _/(| | | | |  (  _/( (__ 
  |_/  \\___)|_|   \\___|_| |_|\\___)\\___|_| \\___/\\___||_| |_|_|   \\___)\\___\\
                                                                        
                  THE INTERNET RECLAMATION CORE Bot
                  [v1.0.0-Autonomous Deep Cleanser]
========================================================================` + COLORS.RESET);
    console.log(COLORS.GREEN + `[SYSTEM] Autonomous core initialized. Target Limit: ${process.env.TARGET_LIMIT || 100} cycles.` + COLORS.RESET);
}

/**
 * Main Orchestrator Class
 */
class InternetReclamationBot {
    constructor() {
        const limitEnv = process.env.TARGET_LIMIT;
        if (limitEnv === 'Infinity' || limitEnv === '0' || parseInt(limitEnv, 10) === 0) {
            this.targetLimit = Infinity;
        } else if (limitEnv !== undefined) {
            this.targetLimit = parseInt(limitEnv, 10);
        } else {
            this.targetLimit = Infinity; // Infinite loop 7/24 by default
        }
        
        // Initialize Core Components
        this.crawler = new WebCrawler({
            delayMs: 1000, // Dynamic jitter and delays will override this
            targetLimit: this.targetLimit,
            maxDepth: parseInt(process.env.MAX_DEPTH, 10) || 5
        });

        this.optimizer = new DataOptimizer();
        this.miner = new ContentMiner();

        // Bind Logger to modules
        this.miner.setLogger((module, level, msg) => { // Added level parameter
            console.log(COLORS.CYAN + `[MINER_AI] [${module}] ${msg}` + COLORS.RESET);
        });

        this.blockchain = new BlockchainRouter({
            rpcUrl: process.env.POLYGON_RPC_URL || process.env.RPC_URL,
            privateKey: process.env.PRIVATE_KEY || process.env.INCOME_DISTRIBUTION_WALLET,
            contractAddress: process.env.CONTRACT_ADDRESS || process.env.CARBON_REGISTRY_CONTRACT || process.env.SMART_GATE_CONTRACT_ADDRESS
        });

        // Track Cumulative Aggregated Statistics
        this.stats = {
            pagesProcessed: 0,
            originalSizeTotal: 0,
            optimizedSizeTotal: 0,
            totalKiloBytesSaved: 0,
            totalCo2SavedGrams: 0,
            blockchainProofsMinted: 0,
            transactions: []
        };
    }

    /**
     * Start the autonomous core execution.
     * Starts with a seed list and runs cycles recursively.
     */
    async run() {
        banner();
        
        // Root system seed nodes - chosen for safe and predictable structure, representing green platforms
        const seedURLs = [
            'https://wikipedia.org',
            'https://html.spec.whatwg.org',
            'https://www.w3.org'
        ];

        this.logHeader('CORE_SHIELD', 'COMMENCING RECLAMATION SWEEP PATTERN');
        
        try {
            let activeSeeds = seedURLs;
            const stateLoaded = this.loadState();
            if (stateLoaded && this.crawler.queue.length > 0) {
                activeSeeds = []; // Queue already populated from file, proceed with saved state
            }

            // Bind crawler progress to data optimization pipeline
            await this.crawler.start(activeSeeds, async (url, html) => {
                await this.processPagePayload(url, html);
            });

            this.logHeader('CORE_SHIELD', 'RECLAMATION CYCLE EXHAUSTED. ENTERING IDLE STABILIZATION...');
            this.printSummary();

        } catch (error) {
            console.error(COLORS.RED + `[CRITICAL_CORE_CRASH] Run loop interrupted: ${error.message}` + COLORS.RESET);
        }
    }

    /**
     * Process page payload retrieved from the Crawler.
     * Executes optimization steps, calculations, proof generation, and blockchain dispatch.
     * 
     * @param {string} url 
     * @param {string} rawHtml 
     */
    async processPagePayload(url, rawHtml) {
        this.stats.pagesProcessed++;
        const originalBytes = Buffer.byteLength(rawHtml);
        this.stats.originalSizeTotal += originalBytes;

        console.log(COLORS.BOLD + `\n------------------------------------------------------------` + COLORS.RESET);
        console.log(COLORS.CYAN + `[RECLAIM] Processing Node [#${this.stats.pagesProcessed}]: ${url}` + COLORS.RESET);
        console.log(`[RECLAIM] Raw Payload Density: ${(originalBytes / 1024).toFixed(3)} KB`);

        // 1. Trigger code clean-up and comments stripping (semantic slimming)
        const optimizedHtml = this.optimizer.optimizeHtml(rawHtml);
        const optimizedBytes = Buffer.byteLength(optimizedHtml);
        this.stats.optimizedSizeTotal += optimizedBytes;

        const originalKb = (originalBytes / 1024);
        const optimizedKb = (optimizedBytes / 1024);
        const reductionRatio = ((1 - (optimizedBytes / originalBytes)) * 100).toFixed(1);

        console.log(COLORS.GREEN + `[OPTIMIZE] Minified payload size: ${optimizedKb.toFixed(3)} KB (Reduced by ${reductionRatio}%)` + COLORS.RESET);

        // 2. Perform energy and Carbon Savings math
        // Assume an average web page experiences 35,000 requests annually
        const estimatedAnnualTraffic = 35000; 
        const savingsData = this.optimizer.calculateCarbonSavings(originalBytes, optimizedBytes, estimatedAnnualTraffic);

        this.stats.totalKiloBytesSaved += (savingsData.bytesSaved / 1024);
        this.stats.totalCo2SavedGrams += savingsData.co2SavingsGrams;

        // 2b. Execute Yapay Zeka Süzgeci (AI Miner filter)
        console.log(COLORS.CYAN + `[MINER_AI] Metin içeriği yapay zeka tarafından taranıyor...` + COLORS.RESET);
        let finalCO2Savings = savingsData.co2SavingsGrams;
        let isValuable = true;
        let aiReportText = '';

        try {
            const aiAnalysis = await this.miner.analyzeContent(rawHtml, url);
            isValuable = aiAnalysis.isValuable;
            aiReportText = aiAnalysis.report;
            console.log(COLORS.CYAN + `[MINER_AI_REPORT]\n${aiReportText}` + COLORS.RESET);
            
            if (aiAnalysis.carbonValueFound > 0) {
                console.log(COLORS.GREEN + `[MINER_AI] Yapay zeka orijinal metinde ekolojik veri tespit etti: ${aiAnalysis.carbonValueFound.toFixed(4)} CO2-g eklendi!` + COLORS.RESET);
                finalCO2Savings += aiAnalysis.carbonValueFound;
            }
        } catch (aiErr) {
            console.warn(`[MINER_AI_WARNING] Yapay zeka analiz adımı pas geçildi: ${aiErr.message}`);
        }

        // 3. Create Proof-of-Cleansing (PoC) Hash using optimized final CO2 values
        const proofHash = this.optimizer.generateProofHash(url, savingsData.bytesSaved, finalCO2Savings, optimizedHtml);

        // 4. Submit Proof and Saved Carbon weight on-chain if substantial energy efficiency gained
        // Yapay zeka sadece değerli verileri seçer ve para harcanmasını engeller
        const gasPreservationThresholdGrams = 0.05;
        const isBatchMode = process.env.BATCH_MINING === 'true';

        if (!isValuable) {
            console.log(COLORS.YELLOW + `[SKIPPED_BY_AI] Yapay zeka süzgeci: Bu düğüm verisi düşük değerli kabul edildi. Blockchain işlemi iptal edildi ve bütçe korundu.` + COLORS.RESET);
        } else if (finalCO2Savings > gasPreservationThresholdGrams) {
            if (isBatchMode) {
                console.log(COLORS.CYAN + `[BATCH_MINING] Toplu gönderim aktif. Kanıt reclamation_state.json içinde biriktiriliyor, anlık gas harcanmadı.` + COLORS.RESET);
                if (!this.stats.pendingBatchQueue) {
                    this.stats.pendingBatchQueue = [];
                }
                this.stats.pendingBatchQueue.push({
                    url,
                    proofHash,
                    savedGrams: finalCO2Savings,
                    timestamp: new Date().toISOString()
                });
            } else {
                console.log(COLORS.MAGENTA + `[BLOCKCHAIN] Karbon dengeleme seviyesi (${finalCO2Savings.toFixed(3)}g CO2) limit üstü. İşlem gönderiliyor...` + COLORS.RESET);
                
                const routerResult = await this.blockchain.triggerBorsaSwap(finalCO2Savings, proofHash);
                
                if (routerResult.success) {
                    this.stats.blockchainProofsMinted++;
                    this.stats.transactions.push({
                        url,
                        proofHash,
                        savedGrams: finalCO2Savings,
                        txHash: routerResult.txHash,
                        simulated: routerResult.simulated,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } else {
            console.log(COLORS.YELLOW + `[SKIPPED] Tasarruf limiti yetersiz (${finalCO2Savings.toFixed(5)}g CO2). Gas koruma devrede.` + COLORS.RESET);
        }

        // 5. Persist progress state locally to disk (Kuyruk Kalıcılığı)
        this.saveState();

        // 6. Check and collect memory garbage to prevent Heap out of Memory
        this.checkMemoryUsage();

        // Release references to assist GC engine
        rawHtml = null;
        optimizedHtml = null;
    }

    /**
     * Restores crawler queue and analytical progress from local state file.
     */
    loadState() {
        if (fs.existsSync(STATE_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
                if (data.stats) {
                    this.stats = {
                        ...this.stats,
                        ...data.stats
                    };
                }
                if (data.crawler) {
                    if (Array.isArray(data.crawler.queue)) {
                        this.crawler.queue = data.crawler.queue;
                    }
                    if (Array.isArray(data.crawler.visitedUrls)) {
                        this.crawler.visitedUrls = new Set(data.crawler.visitedUrls);
                    }
                }
                console.log(COLORS.GREEN + `[SYSTEM] Başarılı! Sistem durumu ${STATE_FILE} dosyasından yüklendi. Kuyruk boyutu: ${this.crawler.queue.length}, Taranan URL: ${this.crawler.visitedUrls.size}` + COLORS.RESET);
                return true;
            } catch (err) {
                console.error(COLORS.RED + `[SYSTEM ERROR] Durum yüklenirken hata oluştu: ${err.message}` + COLORS.RESET);
            }
        }
        return false;
    }

    /**
     * Persists crawler queue and analytical progress to local state file.
     */
    saveState() {
        try {
            const stateData = {
                stats: this.stats,
                crawler: {
                    queue: this.crawler.queue,
                    visitedUrls: Array.from(this.crawler.visitedUrls)
                }
            };
            fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2), 'utf8');
        } catch (err) {
            console.error(COLORS.RED + `[SYSTEM ERROR] Sistem durumu kaydedilirken hata oluştu: ${err.message}` + COLORS.RESET);
        }
    }

    /**
     * Monitors process heap size and cleans up caches to maximize 7/24 uptime.
     */
    checkMemoryUsage() {
        const interval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10) || 50;
        if (this.stats.pagesProcessed % interval !== 0) {
            return;
        }

        try {
            const v8 = require('v8');
            const heap = v8.getHeapStatistics();
            const usedMegabytes = heap.used_heap_size / 1024 / 1024;
            const totalLimitMegabytes = heap.heap_size_limit / 1024 / 1024;

            if (usedMegabytes > 350) {
                console.log(COLORS.YELLOW + `[SYSTEM_GUARD] Yüksek bellek kullanımı tespit edildi: ${usedMegabytes.toFixed(2)} MB / Limit: ${totalLimitMegabytes.toFixed(2)} MB. Bellek temizliği tetikleniyor...` + COLORS.RESET);
                if (global.gc) {
                    global.gc();
                }

                // If memory is critically high (e.g., above 600MB or 80% of limit), save state and signal restart for PM2 watchdog
                if (usedMegabytes > 600) {
                    console.error(COLORS.RED + `[SYSTEM_GUARD] CRITICAL: Bellek seviyesi tehlikeli sınıra ulaştı (${usedMegabytes.toFixed(2)} MB). Durum kaydediliyor ve süreç PM2 tarafından otomatik canlandırılmak üzere kapatılıyor.` + COLORS.RESET);
                    this.saveState();
                    process.exit(1); // Standard PM2 restart trigger
                }
            }
        } catch (err) {
            // Fallback memory monitoring if v8 fails in custom runtime environments
            const used = process.memoryUsage().heapUsed / 1024 / 1024;
            if (used > 300) {
                console.log(COLORS.YELLOW + `[SYSTEM_GUARD] Bellek temizliği yapılıyor: ${used.toFixed(2)} MB...` + COLORS.RESET);
                if (global.gc) {
                    global.gc();
                }
            }
        }

        // Throttle transactions memory container to keep memory size strictly safe
        if (this.stats.transactions.length > 150) {
            this.stats.transactions = this.stats.transactions.slice(-150);
        }
    }

    /**
     * Prints aggregate reports regarding ecosystem improvements.
     */
    printSummary() {
        console.log(COLORS.BOLD + COLORS.GREEN + `
========================================================================
              CLEANSING OPERATION REPORT SUMMARY
========================================================================` + COLORS.RESET);
        console.log(`Pages Processed         : ${this.stats.pagesProcessed}`);
        console.log(`Original Transmitted Vol: ${(this.stats.originalSizeTotal / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Optimized Vol           : ${(this.stats.optimizedSizeTotal / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Dark Data Pruned        : ${this.stats.totalKiloBytesSaved.toFixed(2)} KB`);
        console.log(`Net CO2 Offset Prevented: ${this.stats.totalCo2SavedGrams.toFixed(4)} grams`);
        console.log(`Decentralized NFT Proofs: ${this.stats.blockchainProofsMinted} submitted`);
        console.log(COLORS.BOLD + COLORS.GREEN + `========================================================================` + COLORS.RESET);
    }

    /**
     * Logging Header decorator.
     * @param {string} tag 
     * @param {string} title 
     */
    logHeader(tag, title) {
        console.log(COLORS.BOLD + COLORS.YELLOW + `\n>>> [${tag}] : ${title} <<<` + COLORS.RESET);
    }
}

// Instantiate bot and commence auto-sweep
if (require.main === module) {
    const bot = new InternetReclamationBot();
    bot.run();
}

module.exports = InternetReclamationBot;
