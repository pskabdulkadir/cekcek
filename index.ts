/**
 * @file index.ts
 * @description Central Executor and API Server for Data Reclamation Engine.
 */

import express from 'express';
import { MongoClient } from 'mongodb';
import { blockchainConfig, dbConfig } from './config.ts';
import { BlockchainRouter } from './blockchain.ts';
import { WebCrawler } from './crawler.ts';
import { DataOptimizer } from './optimizer.ts';
import { DataAnalyzer } from './analyzer.ts';
import { LiquidationEngine } from './liquidationEngine.ts';
import { generateEcoReport } from './gemini.ts';
import * as crypto from 'crypto';

const app = express();
app.use(express.json());

// Modülleri Başlat
const blockchain = new BlockchainRouter();
const optimizer = new DataOptimizer();
const crawler = new WebCrawler({ delayMs: 3000, targetLimit: 10000 });
const liquidation = new LiquidationEngine(blockchain);

let db: any;
const logs: any[] = [];

// Global Log Yakalayıcı
const emitLog = (module: any, level: any, message: string) => {
    const entry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), module, level, message };
    logs.push(entry);
    if (logs.length > 200) logs.shift();
    console.log(`[${module}] [${level}] ${message}`);
};

// Log Kayıtlarını Modüllere Bağla
blockchain.registerLogger((m, l, msg) => emitLog(m, l, msg));
optimizer.registerLogger((m, l, msg) => emitLog(m, l, msg));
crawler.registerLogger((m, l, msg) => emitLog(m, l, msg));
liquidation.registerLogger((m, l, msg) => emitLog(m, l, msg));

/**
 * ÜRETİM ÇEKİRDEĞİ (Production Core): 
 * Ham veriyi alır, temizler, mühürler ve blockchain'e aktarır.
 */
async function processPageReclamation(url: string, html: string) {
    emitLog('SYSTEM', 'INFO', `[RECLAMATION_PROCESS] İşlem başlatıldı: ${url}`);

    // 1. Optimizasyon (Hammadde Ayıştırma)
    const optimizedHtml = optimizer.optimizeHtml(html);
    const originalSize = Buffer.byteLength(html, 'utf8');
    const optimizedSize = Buffer.byteLength(optimizedHtml, 'utf8');
    
    // 2. Analiz ve CO2 Hesaplama
    const savings = optimizer.calculateCarbonSavings(originalSize, optimizedSize, 35000);
    const qualityScore = DataAnalyzer.calculateQualityScore(optimizedHtml);
    
    if (qualityScore < 20) {
        emitLog('OPTIMIZER', 'WARNING', `[LOW_QUALITY] Veri değeri düşük, atlanıyor: ${url}`);
        return;
    }

    // 3. Kanıt Oluşturma (Proof of Mitigation)
    const proofHash = optimizer.generateProofHash(url, savings.bytesSaved, savings.co2SavingsGrams, optimizedHtml);
    
    // 4. Blockchain Mühürleme (Minting)
    emitLog('BLOCKCHAIN', 'INFO', `[MINTING_START] Karbon tasarrufu mühürleniyor...`);
    const txResult = await blockchain.submitDataInsightProof(savings.co2SavingsGrams, proofHash);

    if (txResult.success) {
        emitLog('BLOCKCHAIN', 'SUCCESS', `[ASSET_CREATED] Varlık mühürlendi! Tx: ${txResult.txHash}`);
        
        // 5. Otonom Likidasyon (Opsiyonel: Eğer KECO/GREEN üretildiyse anında swap)
        if (blockchainConfig.batchMining) {
            await liquidation.performInstantLiquidation(proofHash, 0.5, savings.co2SavingsGrams);
        }
        
        // 6. DB Kaydı (Inventory Update)
        if (db) {
            await db.collection('ready_to_sell').insertOne({
                id: proofHash.slice(0, 10),
                url,
                originalSize,
                optimizedSize,
                co2AnalysisGrams: savings.co2SavingsGrams,
                proofHash,
                txHash: txResult.txHash,
                timestamp: new Date(),
                status: 'READY'
            });
        }
    }
}

// API Endpoints
app.get('/api/stats', async (req, res) => {
    const readyToSell = db ? await db.collection('ready_to_sell').find().toArray() : [];
    // Merkle Buffer Count'ı ekleyelim, varsayılan olarak 0
    let merkleBufferCount = 0;
    if (db) {
        // Eğer Merkle batching için ayrı bir koleksiyonunuz varsa buradan sayabilirsiniz.
        // Örneğin: merkleBufferCount = await db.collection('merkle_queue').countDocuments();
        // Şimdilik, bu alanın doğru değerini döndürmek için ilgili koleksiyonu ve mantığı uygulamanız gerekmektedir.
    }

    res.json({
        isCrawling: crawler.isRunning,
        pagesProcessed: readyToSell.length,
        dataAssetRegistrations: readyToSell.length,
        readyToSell: readyToSell,
        payoutWalletAddress: blockchainConfig.payoutWallet,
        merkleBufferCount: merkleBufferCount, // Frontend ile uyumluluk için eklendi
    });
});

app.post('/api/crawl/start', async (req, res) => {
    if (!crawler.isRunning) {
        // Önce DB'deki "atık" verileri (main_inventory veya benzeri) işle
        if (db) {
            const BATCH_SIZE = 100; // Her seferinde 100 belge işle
            let hasMore = true;
            let totalProcessed = 0;

            emitLog('SYSTEM', 'INFO', `[DATABASE_RECLAMATION] '${dbConfig.mainInventoryCollectionName}' tablosu taranıyor...`);

            while (hasMore) {
                const unprocessedBatch = await db.collection(dbConfig.mainInventoryCollectionName)
                                                // GENİŞLETİLMİŞ FİLTRE: Her türlü işlenebilir durumu kabul et
                                                .find({ 
                                                    $or: [
                                                        { status: 'unprocessed' }, { status: 'pending' }, 
                                                        { status: 'ready' }, { status: { $exists: false } }
                                                    ] 
                                                })
                                                .limit(BATCH_SIZE)
                                                .toArray();

                if (unprocessedBatch.length === 0) {
                    hasMore = false;
                    break;
                }

                emitLog('SYSTEM', 'INFO', `[DATABASE_RECLAMATION] ${unprocessedBatch.length} adet kayıt işleniyor (Toplam: ${totalProcessed + unprocessedBatch.length})...`);

                for (const doc of unprocessedBatch) {
                    try {
                        // Şema Kontrolü: doc.url veya doc.content boşsa alternatif anahtarları dene
                        const targetUrl = doc.url || doc.link || doc.address || doc.pageUrl || doc.source_url;
                        const targetHtml = doc.content || doc.html || doc.body || doc.htmlContent || doc.raw_html;
                        
                        if (!targetUrl || !targetHtml) {
                            throw new Error(`Eksik veri alanları (URL/HTML bulunamadı). ID: ${doc._id}`);
                        }
                        emitLog('SYSTEM', 'INFO', `[RECLAMATION] İşleniyor: ${targetUrl.substring(0, 40)}...`);

                        await processPageReclamation(targetUrl, targetHtml);
                        await db.collection(dbConfig.mainInventoryCollectionName).updateOne(
                            { _id: doc._id },
                            { $set: { status: 'processed' } }
                        );
                        totalProcessed++;
                    } catch (processingError: any) {
                        emitLog('SYSTEM', 'ERROR', `[DATABASE_RECLAMATION_ERROR] Hata (${doc._id}): ${processingError.message || "Bilinmeyen hata"}`);
                        // Hatalı kayıtları 'failed' olarak işaretle, böylece daha sonra incelenebilir
                        await db.collection(dbConfig.mainInventoryCollectionName).updateOne(
                            { _id: doc._id },
                            { $set: { status: 'failed', errorMessage: processingError.message } }
                        );
                    }
                }
                // Veritabanını veya sistemi aşırı yüklememek için küçük bir gecikme
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            emitLog('SYSTEM', 'INFO', `[DATABASE_RECLAMATION_COMPLETE] Toplam ${totalProcessed} eski kayıt işlendi.`);
        }
        
        // Sonra taze hammadde aramaya başla
        crawler.start(blockchainConfig.targetDomains.map(d => `https://${d}`), processPageReclamation);
    }
    res.json({ success: true });
});

app.post('/api/crawl/stop', (req, res) => {
    crawler.stop();
    res.json({ success: true });
});

app.get('/api/stream-logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const interval = setInterval(() => {
        if (logs.length > 0) {
            const log = logs[logs.length - 1];
            res.write(`data: ${JSON.stringify(log)}\n\n`);
        }
    }, 1000);
    
    req.on('close', () => clearInterval(interval));
});

// Başlatma
async function init() {
    try {
        const client = await MongoClient.connect(dbConfig.uri);
        db = client.db(dbConfig.dbName);
        
        // Başlangıç Kontrolü: Yapılandırılan koleksiyonda kaç varlık var?
        const targetCollection = dbConfig.mainInventoryCollectionName;
        const inventoryCount = await db.collection(targetCollection).countDocuments({ 
            $or: [
                { status: 'unprocessed' }, { status: 'pending' }, 
                { status: 'ready' }, { status: { $exists: false } }
            ] 
        });
            
        emitLog('SYSTEM', 'SUCCESS', `[DB_BAĞLANTISI] Veritabanı: ${dbConfig.dbName} Aktif.`);
        emitLog('SYSTEM', 'INFO', `[ENVANTER_KONTROL] '${targetCollection}' tablosunda ${inventoryCount} işlenebilir varlık bulundu.`);

        if (inventoryCount === 0) {
            emitLog('SYSTEM', 'WARNING', `[TABLO_BOŞ] '${targetCollection}' içinde veri yok. Sistem otomatik tarama başlatıyor...`);
            const collections = await db.listCollections().toArray();
            
            for (const col of collections) {
                const docCount = await db.collection(col.name).countDocuments({});
                if (docCount > 0) {
                    emitLog('SYSTEM', 'SUCCESS', `[VERİ_KEŞFEDİLDİ] '${col.name}' tablosunda ${docCount} adet potansiyel hammadde bulundu!`);
                }
            }
            emitLog('SYSTEM', 'ANALYZE', `[AKSİYON_GEREKLİ] Lütfen Render panelinden MAIN_INVENTORY_COLLECTION_NAME değerini yukarıdaki dolu isimlerden biriyle değiştirin.`);
        }

        app.listen(3001, () => console.log('Server running on port 3001'));
    } catch (err) {
        console.error('DB Connection Failed', err);
    }
}

init();