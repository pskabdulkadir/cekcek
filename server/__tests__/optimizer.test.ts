import { describe, it, expect } from 'vitest';
import { DataOptimizer } from '../optimizer';

describe('DataOptimizer', () => {
  const optimizer = new DataOptimizer();

  describe('optimizeHtml', () => {
    it('should remove comments from HTML', () => {
      const html = '<div><!-- comment --><p>Text</p></div>';
      const result = optimizer.optimizeHtml(html);
      expect(result).not.toContain('comment');
      expect(result).toContain('Text');
    });

    it('should remove extra whitespace', () => {
      const html = '<div>   <p>   Text   </p>   </div>';
      const result = optimizer.optimizeHtml(html);
      expect(result.length).toBeLessThan(html.length);
    });

    it('should preserve HTML structure', () => {
      const html = '<div><p>Important</p></div>';
      const result = optimizer.optimizeHtml(html);
      expect(result).toContain('<div>');
      expect(result).toContain('<p>');
    });
  });

  describe('calculateCarbonSavings', () => {
    it('should calculate positive savings for optimized content', () => {
      const original = 5000; // bytes
      const optimized = 2500;
      const carbonPerKb = 35000; // grams per KB

      const savings = optimizer.calculateCarbonSavings(original, optimized, carbonPerKb);

      expect(savings.bytesSaved).toBe(2500);
      expect(savings.co2SavingsGrams).toBeGreaterThan(0);
    });

    it('should return zero savings if content grows', () => {
      const original = 1000;
      const optimized = 1500;
      const carbonPerKb = 35000;

      const savings = optimizer.calculateCarbonSavings(original, optimized, carbonPerKb);

      expect(savings.bytesSaved).toBeLessThanOrEqual(0);
    });
  });

  describe('generateProofHash', () => {
    it('should generate hash in valid format', () => {
      const url = 'https://example.com';
      const bytesSaved = 1000;
      const co2Saved = 35;
      const html = '<div>test</div>';

      const hash = optimizer.generateProofHash(url, bytesSaved, co2Saved, html);

      // Hash should be hex format with 0x prefix
      expect(hash).toMatch(/^0x[a-f0-9]+$/i);
      expect(hash.length).toBeGreaterThan(10);
    });

    it('should generate different hash for different bytesSaved values', () => {
      const url = 'https://example.com';
      const co2Saved = 35;
      const html = '<div>test</div>';

      const hash1 = optimizer.generateProofHash(url, 1000, co2Saved, html);
      const hash2 = optimizer.generateProofHash(url, 2000, co2Saved, html);

      // Hashes should be different for different inputs
      expect(hash1).not.toBe(hash2);
    });
  });
});
