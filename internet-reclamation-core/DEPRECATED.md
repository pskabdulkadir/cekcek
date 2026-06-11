# ⚠️ DEPRECATED: Legacy Bot Code

Bu klasördeki `bot_main.js` ve ilgili modüller **artık kullanılmamaktadır**.

## Neden Deprecated?

Proje TypeScript/Express tabanlı modern mimariye geçmiştir. Tüm işlevsellik şu ana konumda kullanılmaktadır:

- **Crawler:** `server/crawler.ts`
- **Optimizer:** `server/optimizer.ts`
- **Blockchain Router:** `server/blockchain.ts`
- **AI Miner:** `server/gemini.ts`
- **Main Server:** `server.ts`

## Migration Status

| Bileşen | Legacy (CommonJS) | Modern (TypeScript) | Status |
|---------|------------------|-------------------|--------|
| Crawler | `modules/crawler.js` | `server/crawler.ts` | ✅ Migrated |
| Optimizer | `modules/optimizer.js` | `server/optimizer.ts` | ✅ Migrated |
| Blockchain | `modules/blockchain.js` | `server/blockchain.ts` | ✅ Migrated |
| Miner (AI) | `modules/miner.js` | `server/gemini.ts` | ✅ Migrated |
| Orchestrator | `bot_main.js` | `server.ts` | ✅ Migrated |

## Cleanup Plan

Bu klasör yakında tamamen silinecektir. Gerekli fonksiyonlar TypeScript sürümüne geçirilmiştir.

---

**Updated:** 2024
**Reason:** Architecture modernization to TypeScript/Express stack
