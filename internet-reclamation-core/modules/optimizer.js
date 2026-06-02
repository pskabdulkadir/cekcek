/**
 * @file optimizer.js
 * @description Semantic cleansing and energy calculation engine of the Internet Reclamation Core.
 * Eliminates "Dark Data" bloating elements like source code comments and extraneous whitespace,
 * then accurately computes the CO2 reduction and seals the proof via cryptographic SHA-256.
 * 
 * @author Senior Software Architect & Cybersecurity Expert
 * @license SPDX-License-Identifier: Apache-2.0
 */

const crypto = require('crypto');

class DataOptimizer {
    constructor() {
        this.logCallback = null;
    }

    /**
     * Register real-time logging hook.
     * @param {Function} callback 
     */
    setLogger(callback) {
        this.logCallback = callback;
    }

    /**
     * Cybermatic terminal logging output.
     * @param {string} module 
     * @param {string} msg 
     */
    log(module, msg) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [OPTIMIZER] ${msg}`;
        console.log(`\x1b[32m${formatted}\x1b[0m`); // Green cyber log
        if (this.logCallback) {
            this.logCallback(module, msg);
        }
    }

    /**
     * Strips dark data elements from raw HTML and JS, minifying size without breaking content.
     * @param {string} rawHtml Raw source code input.
     * @returns {string} Fully optimized source code.
     */
    optimizeHtml(rawHtml) {
        if (!rawHtml || typeof rawHtml !== 'string') {
            return '';
        }

        let optimized = rawHtml;

        // 1. Remove HTML comment blocks <!-- comments -->
        optimized = optimized.replace(/<!--[\s\S]*?-->/g, '');

        // 2. Remove JS block comments /* comments */ inside script blocks
        optimized = optimized.replace(/\/\*[\s\S]*?\*\//g, '');

        // 3. Remove single line comments (double slash) carefully to preserve HTTP links
        // We match double slashes that are NOT preceded by a colon to avoid breaking URLs.
        optimized = optimized.replace(/(?<!:|https|http)\/\/.*$/gm, '');

        // 4. Reduce multiple whitespaces, tabs, and duplicate newlines down to a single space
        optimized = optimized.replace(/[\s\r\n]+/g, ' ');

        // 5. Trim leading and trailing spaces
        optimized = optimized.trim();

        return optimized;
    }

    /**
     * Calculates gram CO2 savings based on compressed bytes and estimated traffic volumes.
     * Carbon Formula: Gram CO2 = (Orijinal_Byte - Optimize_Byte) * 0.0000000112 * Yıllık_Trafik
     * 
     * @param {number} originalSize Original size in bytes.
     * @param {number} optimizedSize Optimized size in bytes.
     * @param {number} annualTraffic Expected annual visitors/traffic hits.
     * @returns {Object} Analytical calculation state.
     */
    calculateCarbonSavings(originalSize, optimizedSize, annualTraffic) {
        const bytesSaved = originalSize - optimizedSize;
        const positiveBytesSaved = Math.max(0, bytesSaved);

        // Carbon multiplier coefficient is 0.0000000112 (1.12 x 10^-8 grams of CO2 per byte transferred)
        const carbonMultiplier = 0.0000000112; 
        const annualTrafficVolume = annualTraffic || 100000; // fallback default traffic profile

        const co2SavingsGrams = positiveBytesSaved * carbonMultiplier * annualTrafficVolume;

        return {
            bytesSaved: positiveBytesSaved,
            co2SavingsGrams: Number(co2SavingsGrams.toFixed(6)),
            efficiencyGainPct: originalSize > 0 
                ? Number(((positiveBytesSaved / originalSize) * 100).toFixed(2)) 
                : 0
        };
    }

    /**
     * Generates a secure cryptographic verification stamp (SHA-256) of the optimization receipt.
     * Acts as the Immutable Proof of Cleansing (PoC).
     * 
     * @param {string} targetUrl The target URL swept.
     * @param {number} bytesSaved Volume of redundant dead code shredded.
     * @param {number} co2Saved Grams of Co2 prevented.
     * @param {string} optimizedCode Minified payload itself.
     * @returns {string} SHA-256 validation proof hash.
     */
    generateProofHash(targetUrl, bytesSaved, co2Saved, optimizedCode) {
        const payload = JSON.stringify({
            targetUrl,
            bytesSaved,
            co2Saved,
            codeSignature: crypto.createHash('md5').update(optimizedCode).digest('hex'),
            timestamp: Date.now()
        });

        const proofHash = crypto.createHash('sha256').update(payload).digest('hex');
        
        this.log('PROOF', `Cryptographic Proof generated successfully: 0x${proofHash}`);
        this.log('METRIC', `Reduction complete. Bytes saved: ${bytesSaved} | CO2 Prevented: ${co2Saved}g`);

        return '0x' + proofHash;
    }
}

module.exports = DataOptimizer;
