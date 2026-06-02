/**
 * @file crawler.js
 * @description The Autonomous Discovery Engine (Web Crawler) of the Internet Reclamation Core.
 * Uses axios to fetch pages and cheerio to discover links recursively with strict rate-limiting.
 * 
 * @author Senior Software Architect & Cybersecurity Expert
 * @license SPDX-License-Identifier: Apache-2.0
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

class WebCrawler {
    /**
     * Creates an instance of WebCrawler.
     * @param {Object} options Configuration options.
     * @param {number} [options.delayMs=1000] Delay between sequential crawls (Rate Limiting).
     * @param {number} [options.targetLimit=100] Maximum number of pages to crawl.
     * @param {number} [options.maxDepth=5] Max depth to recurse down link structures.
     */
    constructor(options = {}) {
        this.delayMs = options.delayMs !== undefined ? options.delayMs : 1000;
        this.targetLimit = options.targetLimit !== undefined ? options.targetLimit : Infinity;
        this.maxDepth = options.maxDepth !== undefined ? options.maxDepth : (parseInt(process.env.MAX_DEPTH, 10) || 5);
        this.queue = [];
        this.visitedUrls = new Set();
        this.depthsMap = new Map();
        this.logCallback = null;
    }

    /**
     * Regsiter a callback for real-time robotic terminal logging.
     * @param {Function} callback Callback function for logs.
     */
    setLogger(callback) {
        this.logCallback = callback;
    }

    /**
     * Emits standard cyber-formatted console logs and runs callback if present.
     * @param {string} module Module identifier.
     * @param {string} msg Log message.
     */
    log(module, msg) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [CRAWLER] ${msg}`;
        console.log(`\x1b[36m${formatted}\x1b[0m`); // Cyan cyber log
        if (this.logCallback) {
            this.logCallback(module, msg);
        }
    }

    /**
     * Utility sleep helper.
     * @param {number} ms 
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Adds a URL to the crawling queue.
     * @param {string} urlString 
     * @param {string} referrer 
     */
    enqueue(urlString, referrer = 'SEED') {
        try {
            const parsedUrl = new URL(urlString);
            // Limit crawler to http and https protocols
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                return;
            }

            const cleanUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;
            
            // Calculate and respect link depth limit
            let depth = 0;
            if (referrer !== 'SEED' && this.depthsMap.has(referrer)) {
                depth = this.depthsMap.get(referrer) + 1;
            }

            if (depth > this.maxDepth) {
                // Skips if link is too deep
                return;
            }

            if (!this.visitedUrls.has(cleanUrl) && !this.queue.includes(cleanUrl)) {
                if (this.queue.length >= 5000) {
                    // Queue is full, discard new URLs securely to protect heap size
                    return;
                }
                this.depthsMap.set(cleanUrl, depth);
                this.queue.push(cleanUrl);
                this.log('DISCOVERY', `Enqueued: ${cleanUrl} (discovered from ${referrer}, Depth: ${depth})`);
            }
        } catch (err) {
            // Quietly ignore invalid URLs to prevent crashing
        }
    }

    /**
     * Fetches page content and extracts all links.
     * @param {string} currentUrl 
     * @returns {Promise<{html: string, links: string[]}>}
     */
    async fetchAndAnalyze(currentUrl) {
        try {
            const urlObj = new URL(currentUrl);
            const headers = {
                'User-Agent': 'Mozilla/5.0 (compatible; InternetReclamationCoreBot/1.0; +https://github.com/reclamation-core)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            };

            this.log('NETWORK', `Fetching payload from: ${currentUrl}`);
            const response = await axios.get(currentUrl, { 
                headers, 
                timeout: 10000,
                responseType: 'text' // strictly HTML text requests
            });

            const html = response.data;
            if (!html || typeof html !== 'string') {
                return { html: '', links: [] };
            }

            const $ = cheerio.load(html);
            const links = [];

            $('a[href]').each((index, element) => {
                const href = $(element).attr('href');
                if (href) {
                    try {
                        const resolvedUrl = new URL(href, currentUrl).toString();
                        links.push(resolvedUrl);
                    } catch (e) {
                        // ignore broken links
                    }
                }
            });

            return { html, links };
        } catch (error) {
            this.log('ERROR', `Failed to crawl ${currentUrl}: ${error.message}`);
            return { html: '', links: [] };
        }
    }

    /**
     * Performs continuous recursive crawling starting from seed URLs.
     * @param {string[]} seeds Starting links.
     * @param {Function} onPageProcessedAsync Event handler called when each page's raw HTML isFetched.
     */
    async start(seeds, onPageProcessedAsync) {
        this.log('INIT', `Booting discovery core with energy-budget constraints.`);
        this.log('INIT', `Seed count: ${seeds.length} | Target scan limit: ${this.targetLimit} pages | Max Depth: ${this.maxDepth}`);

        for (const seed of seeds) {
            this.depthsMap.set(seed, 0);
            this.enqueue(seed);
        }

        let pagesCrawled = 0;

        while (this.queue.length > 0 && pagesCrawled < this.targetLimit) {
            const url = this.queue.shift();
            
            // Re-verify visited standard set to avoid duplicate threads
            if (this.visitedUrls.has(url)) {
                continue;
            }

            try {
                this.visitedUrls.add(url);
                pagesCrawled++;

                this.log('CORE', `Scanning page [${pagesCrawled}/${this.targetLimit}]: ${url}`);
                
                const startFetchTime = Date.now();
                const { html, links } = await this.fetchAndAnalyze(url);
                const scanTime = Date.now() - startFetchTime;

                if (html) {
                    this.log('ANALYZE', `Payload retrieved successfully (${Buffer.byteLength(html)} bytes in ${scanTime}ms).`);
                    
                    // Enqueue discovered child links
                    for (const childUrl of links) {
                        // Restrict crawling to same general domain structure to maintain focus,
                        // or crawl wide depending on requirements. We allow wide navigation, but enqueuing is limited to target limits
                        this.enqueue(childUrl, url);
                    }

                    // Process code optimization triggers asynchronously
                    if (onPageProcessedAsync) {
                        try {
                            await onPageProcessedAsync(url, html);
                        } catch (err) {
                            this.log('PROCESS_ERROR', `Execution breakdown in data optimizer: ${err.message}`);
                        }
                    }
                }
            } catch (loopError) {
                this.log('LOOP_ERROR', `Unexpected error on URL [${url}] cycle: ${loopError.message}`);
            }

            // Respect polite crawler delay (Rate Limiting) to save remote server resources
            if (this.queue.length > 0 && pagesCrawled < this.targetLimit) {
                const minCooldown = parseInt(process.env.COOLDOWN_MIN, 10) || 800;
                const maxCooldown = parseInt(process.env.COOLDOWN_MAX, 10) || 2500;
                const diff = Math.max(0, maxCooldown - minCooldown);
                const randomJitter = diff > 0 ? Math.floor(Math.random() * diff) : 0;
                const sleepTime = minCooldown + randomJitter;
                this.log('POLITE', `Cooldown initiated. Sleeping for ${sleepTime}ms (Min Cooldown: ${minCooldown}ms, Dynamic Jitter: ${randomJitter}ms) to respect host...`);
                await this.sleep(sleepTime);
            }
        }

        this.log('TERM', `Reclamation segment complete. Searched ${pagesCrawled} active targets.`);
    }
}

module.exports = WebCrawler;
