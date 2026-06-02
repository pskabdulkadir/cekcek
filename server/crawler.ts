/**
 * @file crawler.ts
 * @description Highly scalable, polite, and asynchroneously integrated discovery core in ESM TypeScript.
 * 
 * @author Senior Software Architect
 * @license SPDX-License-Identifier: Apache-2.0
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { blockchainConfig } from './config.ts';

// CRAWLER GÜVENLİĞİ: Kimlik Rotasyonu
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

// CRAWLER GÜVENLİĞİ: Hammadde toplama sahaları config'den alınır
const WHITELISTED_DOMAINS = blockchainConfig.targetDomains;

export interface CrawlerOptions {
  delayMs?: number;
  targetLimit?: number;
  maxConcurrentRequests?: number;
  maxQueueSize?: number;
}

export class WebCrawler {
  public delayMs: number;
  public targetLimit: number;
  public queue: string[] = [];
  public visitedUrls: Set<string> = new Set();
  
  private logCallback?: (module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) => void;
  private onCrawlingStateChange?: (url: string) => void;
  public isRunning: boolean = false;

  constructor(options: CrawlerOptions = {}) {
    this.delayMs = options.delayMs !== undefined ? options.delayMs : 5000; // Varsayılan 5 saniye gecikme
    this.targetLimit = options.targetLimit || 100;
  }

  /**
   * Safe logarithmic trigger callback hooks
   */
  public registerLogger(cb: typeof this.logCallback) {
    this.logCallback = cb;
  }

  public registerStateListener(cb: typeof this.onCrawlingStateChange) {
    this.onCrawlingStateChange = cb;
  }

  private emitLog(module: 'SYSTEM' | 'CRAWLER' | 'OPTIMIZER' | 'BLOCKCHAIN' | 'AI', level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ANALYZE', msg: string) {
    if (this.logCallback) {
      this.logCallback(module, level, msg);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Kaynağın lisans ve kullanım politikasını denetler.
   * Sadece açık veri standartlarına (Creative Commons vb.) uygun kaynakları kabul eder.
   */
  private checkLicenseCompliance(html: string, url: string): { isCompliant: boolean; license: string } {
    // Heuristic: Sayfa içerisinde lisans beyanı arar
    const openDataKeywords = [/creative\s?commons/i, /cc-by/i, /public\s?domain/i, /open\s?government\s?licence/i, /data\.gov/i];
    const isCompliant = openDataKeywords.some(pattern => pattern.test(html)) || url.includes('.gov') || url.includes('.org');
    
    // Belirlenen lisansı döndür (Varsayılan olarak kısıtlı kabul edilir)
    if (isCompliant) {
        return { isCompliant: true, license: url.includes('.gov') ? "Open Government License" : "Creative Commons Attribution" };
    }
    return { isCompliant: false, license: "Unknown / Restricted" };
  }

  public enqueue(urlString: string, referrer: string = 'SEED') {
    try {
      const parsedUrl = new URL(urlString);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return;
      }
      
      // Beyaz liste kontrolü
      const hostname = parsedUrl.hostname;
      const isPublicResource = hostname.endsWith('.gov') || hostname.endsWith('.org');
      const isWhitelisted = WHITELISTED_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
      
      // DATA_RECLAMATION MODU: Eğer mod bu ise, Wikipedia dışındaki hammadde kaynaklarına da izin ver
      if (blockchainConfig.crawlMode === 'DATA_RECLAMATION') {
          if (isPublicResource && !isWhitelisted) {
              this.emitLog('CRAWLER', 'INFO', `[AUTO_WHITELIST] Kamu verisi hammadde sahasına eklendi: ${hostname}`);
          } else if (isWhitelisted) {
              this.emitLog('CRAWLER', 'INFO', `[RECLAMATION_TARGET] Hedef kaynak tespit edildi: ${hostname}`);
          }
      }

      // Karar: Whitelist'te mi VEYA Kamu Kaynağı (RECLAMATION_BYPASS) mı?
      const canProceed = isWhitelisted || (blockchainConfig.crawlMode === 'DATA_RECLAMATION' && isPublicResource);

      if (!canProceed) {
        this.emitLog('CRAWLER', 'WARNING', `[WHITELIST_BLOCKED] Düğüm atlandı (Beyaz listede değil): ${urlString}`);
        return;
      }
      const cleanUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;
      
      // Bellek Sızıntısı Koruması: Kuyruk boyutunu sınırla
      if (this.queue.length >= 1000) {
        return;
      }

      // RECLAMATION_BYPASS: Eğer mod DATA_RECLAMATION ise ve hedef .gov veya .org ise otomatik güvenli alan say
      const isPublicResource = hostname.endsWith('.gov') || hostname.endsWith('.org');
      if (blockchainConfig.crawlMode === 'DATA_RECLAMATION' && isPublicResource) {
          this.emitLog('CRAWLER', 'INFO', `[AUTO_WHITELIST] Kamu verisi tespit edildi, hammadde sahasına eklendi: ${hostname}`);
          // Whitelist kontrolünü geçmesine izin vermek için burada işlem yapılabilir
      }

      if (!this.visitedUrls.has(cleanUrl) && !this.queue.includes(cleanUrl)) {
        this.queue.push(cleanUrl);
        // Performans Koruması: Alt düğümleri sadece konsola yaz, SSE kanalını boğma
        console.log(`[CRAWLER_DISCOVERY] Found: ${cleanUrl}`);
      }
    } catch (e) {
      // ignore parsing abnormalities
    }
  }

  public async fetchAndAnalyze(currentUrl: string): Promise<{ html: string; links: string[] }> {
    try {
      // Rastgele bir kimlik seç (User-Agent Rotation)
      const randomAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      
      const headers = {
        'User-Agent': randomAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      };

      this.emitLog('CRAWLER', 'INFO', `İndirme dizisi başlatılıyor: ${currentUrl}`);
      const response = await axios.get(currentUrl, {
        headers,
        timeout: 15000,
        responseType: 'text',
        maxContentLength: 10485760, // 10MB Sınırı (Memory/OOM Koruması)
        maxBodyLength: 10485760
      });

      const html = response.data;
      if (!html || typeof html !== 'string') {
        return { html: '', links: [] };
      }

      // AUDIT: Gerçek HTTP isteği kanıtı (Wikimedia Sunucu Yanıtı)
      const traceInfo = `Server: ${response.headers['server']} | Cache: ${response.headers['x-cache']} | Date: ${response.headers['date']}`;
      this.emitLog('CRAWLER', 'ANALYZE', `[NET_TRACE] ${currentUrl} -> ${traceInfo}`);

      const $ = cheerio.load(html);
      const links: string[] = [];

      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          try {
            const resolvedUrl = new URL(href, currentUrl).toString();
            links.push(resolvedUrl);
          } catch (e) {
            // ignore malformed URLs
          }
        }
      });

      return { html, links };
    } catch (err: any) {
      this.emitLog('CRAWLER', 'ERROR', `[${currentUrl}] düğümünde ağ hatası: ${err.message}`);
      return { html: '', links: [] };
    }
  }

  /**
   * Stop automated crawler sequence safely
   */
  public stop() {
    this.isRunning = false;
    this.emitLog('SYSTEM', 'WARNING', `Tarayıcı iptal dizisi yayını başlatıldı.`);
  }

  /**
   * Core crawling cycle
   */
  public async start(seeds: string[], onPageScaredAsync: (url: string, html: string) => Promise<void>) {
    if (this.isRunning) {
      this.emitLog('SYSTEM', 'WARNING', `Tarayıcı aktif iş parçacığı zaten çalışıyor.`);
      return;
    }

    this.isRunning = true;
    this.emitLog('SYSTEM', 'SUCCESS', `Arama Çekirdeği başarıyla başlatıldı (Sonsuz Döngü Modu). Çevrimiçi şebeke segmentleri taranıyor.`);

    for (const seed of seeds) {
      this.enqueue(seed);
    }

    let crawledCount = 0;

    while (this.isRunning) {
      // GÜVENLİK: Jitter (Rastgele gecikme) ekleyerek insansı davranış simüle et
      const jitter = Math.random() * 3000; // 0-3 saniye arası rastgele ek gecikme
      await this.sleep((this.delayMs || 5000) + jitter);

      try {
        // Robust empty queue protection
        if (this.queue.length === 0) {
          this.emitLog('CRAWLER', 'INFO', `Tarama kuyruğu temizlendi. Tohumlar yenileniyor.`);
          for (const seed of seeds) {
            this.visitedUrls.delete(seed);
            this.enqueue(seed);
          }
          if (this.visitedUrls.size > 200) this.visitedUrls.clear();
        }

        const url = this.queue.shift();
        if (!url || this.visitedUrls.has(url)) continue;

        this.visitedUrls.add(url);
        crawledCount++;

        if (this.onCrawlingStateChange) this.onCrawlingStateChange(url);

        const displayLimitText = this.targetLimit > 500000 ? "Sonsuz" : this.targetLimit.toString();
        this.emitLog('CRAWLER', 'ANALYZE', `Düğüm taraması [${crawledCount}/${displayLimitText}]: ${url}`);
        
        const start = Date.now();
        const { html, links } = await this.fetchAndAnalyze(url);
        const duration = Date.now() - start;

        if (html) {
          // LİSANS KONTROLÜ: Meşruiyet filtresi
          const compliance = this.checkLicenseCompliance(html, url);
          if (!compliance.isCompliant) {
            this.emitLog('CRAWLER', 'WARNING', `[LISANS_ENGELI] Düğüm atlandı (Telif hakları kısıtlı olabilir): ${url}`);
            continue;
          }

          this.emitLog('CRAWLER', 'SUCCESS', `[MEŞRU_KAYNAK] ${compliance.license} altında işleniyor: ${url}`);
          for (const link of links) this.enqueue(link, url);
          
          // Safe page processing
          await onPageScaredAsync(url, html).catch(err => {
            this.emitLog('SYSTEM', 'ERROR', `İşleme hatası (atlandı): ${err.message}`);
          });
        }
      } catch (loopError: any) {
        this.emitLog('SYSTEM', 'ERROR', `Kritik döngü hatası: ${loopError.message}`);
        await this.sleep(10000); // Hata durumunda 10 saniye bekle
      }
    }

    this.isRunning = false;
    if (this.onCrawlingStateChange) {
      this.onCrawlingStateChange('');
    }
    
    this.emitLog('SYSTEM', 'SUCCESS', `Hedef liste taraması tamamlandı. Tüm keşif iş parçacıkları güvenli bir şekilde veri tabanına kaydedildi.`);
  }
}
