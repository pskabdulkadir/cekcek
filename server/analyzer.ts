/**
 * @file analyzer.ts
 * @description Heuristic Scoring Engine for autonomous data quality verification.
 */

export class DataAnalyzer {
  /**
   * Calculates a quality score between 0-100 based on structural heuristics.
   * Criteria: Text length, tag-to-text ratio, and outbound link structure.
   */
  public static calculateQualityScore(html: string): number {
    let score = 0;
    const length = html.length;

    // 1. Volume Analysis (Max 40 pts)
    if (length > 20000) score += 40;
    else if (length > 10000) score += 30;
    else if (length > 5000) score += 15;

    // 2. Structural Density Analysis (Max 30 pts)
    // Lower tag density usually means higher semantic value
    const tagCount = (html.match(/<[^>]*>/g) || []).length;
    const tagRatio = tagCount / length;
    if (tagRatio < 0.02) score += 30;
    else if (tagRatio < 0.05) score += 20;
    else if (tagRatio < 0.1) score += 10;

    // 3. Connectivity Analysis (Max 30 pts)
    const linkCount = (html.match(/href="http/g) || []).length;
    if (linkCount > 10) score += 30;
    else if (linkCount > 5) score += 15;

    return Math.min(100, score);
  }
}