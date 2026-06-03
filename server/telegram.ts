import TelegramBot from "node-telegram-bot-api";

// GELİŞTİRME SÜRECİNDE BİLDİRİM VE BOT TELEMETRİSİNİ KESMEK İÇİN DURAKLATMA BAYRAĞI
// Kullanıcı tekrar 'çalıştır' dediği için bu bayrak false olarak güncellenmiştir.
const isTelegramTemporarilyDisabled = false;

let bot: TelegramBot | null = null;
let configuredChatId: string | null = null;

export interface SystemStatusData {
  walletAddr: string;
  polBalance: number;
  usdtBalance: string;
  greenBalance: string;
  totalAssets: number;
  readyToSell: number;
  soldAssets: number;
  listedOnChain: number;
  isCrawling: boolean;
  currentCrawlingUrl: string;
  pagesProcessed: number;
  totalKiloBytesSaved: number;
  totalCo2SavedGrams: number;
  selectedNetworkPath: string;
  circuitBreakerStatus: string;
}

/**
 * Initialize and start the Telegram Bot gateway for two-way operations
 */
export function initializeTelegramBot(
  token: string | undefined,
  chatId: string | undefined,
  callbacks: {
    startCrawler: () => Promise<void> | void;
    stopCrawler: () => Promise<void> | void;
    getStatus: () => Promise<SystemStatusData>;
    pushLog: (module: any, level: any, msg: string) => void;
  }
) {
  if (isTelegramTemporarilyDisabled) {
    console.log("[TELEGRAM] Telegram Bot kullanıcı talebi doğrultusunda geçici olarak DEVRE DIŞI bırakıldı.");
    return;
  }

  const parsedToken = token ? token.replace(/['"]/g, '').trim() : "";
  const parsedChatId = chatId ? chatId.replace(/['"]/g, '').trim() : "";

  // Check if token or chatId has placeholder patterns or are invalid
  const isPlaceholder = 
    parsedToken.includes("Senin_") || 
    parsedChatId.includes("Senin_") ||
    parsedToken.toLowerCase().includes("token") ||
    parsedChatId.toLowerCase().includes("id") ||
    parsedToken === "" || 
    parsedChatId === "";

  // Real Telegram bot token format: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
  const isFormatValid = /^\d+:[A-Za-z0-9_-]{35,}$/.test(parsedToken);

  if (isPlaceholder || !isFormatValid) {
    console.log("[TELEGRAM] Valid Telegram credentials (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID) are missing or in template format. Skipping Telegram Bot initialization.");
    return;
  }

  try {
    configuredChatId = parsedChatId;
    
    // Polling mode for receiving user commands
    bot = new TelegramBot(parsedToken, { polling: true });
    
    // Listen to polling errors to prevent application crashes or flooding console output
    bot.on("polling_error", (error: any) => {
      console.warn(`[TELEGRAM_WARN] Telegram polling error: ${error.message}. Please double-check your bot token and internet connectivity.`);
    });
    
    console.log(`[TELEGRAM] Telegram Bot successfully started for Chat ID: ${configuredChatId}`);
    callbacks.pushLog("SYSTEM", "SUCCESS", "Telegram İki Yönlü Kontrol Botu başarıyla devreye alındı!");

    // Helper to verify sender
    const isSenderAuthorized = (msg: TelegramBot.Message): boolean => {
      if (!configuredChatId) return false;
      const msgChatId = String(msg.chat.id).trim();
      return msgChatId === configuredChatId;
    };

    // Command "/ping" handler (Zorunlu Telemetri Testi)
    bot.onText(/\/ping/, async (msg) => {
      const chatIdStr = String(msg.chat.id);
      if (!isSenderAuthorized(msg)) {
        await bot?.sendMessage(chatIdStr, `🛑 <b>YETKİSİZ ERİŞİM</b>\nBu bota komut gönderme yetkiniz yok. Sohbet ID'niz: <code>${chatIdStr}</code>`, { parse_mode: "HTML" });
        return;
      }
      await bot?.sendMessage(chatIdStr, `🏓 <b>PONG!</b>\nMaster Satış Botu iletişim hattı aktif ve her şey kusursuz çalışıyor!\nZaman damgası: <code>${new Date().toLocaleString()}</code>`, { parse_mode: "HTML" });
    });

    // Command "/start" handler
    bot.onText(/\/start/, async (msg) => {
      const chatIdStr = String(msg.chat.id);
      if (!isSenderAuthorized(msg)) {
        await bot?.sendMessage(chatIdStr, `🛑 <b>YETKİSİZ ERİŞİM</b>\nBu bota komut gönderme yetkiniz yok. Kullandığınız Sohbet ID: <code>${chatIdStr}</code>`, { parse_mode: "HTML" });
        return;
      }

      await bot?.sendMessage(chatIdStr, `⏳ <b>Protokol Başlatılıyor...</b>\nOtonom tarayıcı ve işlem çarkları devreye alınıyor.`, { parse_mode: "HTML" });
      try {
        await callbacks.startCrawler();
        await bot?.sendMessage(chatIdStr, `🟩 <b>[TELEGRAM_KOMUT] BAŞLATILDI</b>\nÖrümcek ve likidasyon motoru sonsuz döngüde başarıyla çalıştırıldı! Sektörler taranıyor...`, { parse_mode: "HTML" });
      } catch (err: any) {
        await bot?.sendMessage(chatIdStr, `❌ <b>Başlatma Hatası:</b> <code>${err.message}</code>`, { parse_mode: "HTML" });
      }
    });

    // Command "/stop" handler
    bot.onText(/\/stop/, async (msg) => {
      const chatIdStr = String(msg.chat.id);
      if (!isSenderAuthorized(msg)) {
        await bot?.sendMessage(chatIdStr, `🛑 <b>YETKİSİZ ERİŞİM</b>\nBu bota komut gönderme yetkiniz yok.`, { parse_mode: "HTML" });
        return;
      }

      await bot?.sendMessage(chatIdStr, `⏳ <b>Protokol Durduruluyor...</b>\nSüreçler güvenli bir şekilde donduruluyor.`, { parse_mode: "HTML" });
      try {
        await callbacks.stopCrawler();
        await bot?.sendMessage(chatIdStr, `🟨 <b>[TELEGRAM_KOMUT] DURDURULDU</b>\nSistem güvenli bekleme (IDLE) moduna alındı. Blockchain/Tarama işlemleri askıya alındı.`, { parse_mode: "HTML" });
      } catch (err: any) {
        await bot?.sendMessage(chatIdStr, `❌ <b>Durdurma Hatası:</b> <code>${err.message}</code>`, { parse_mode: "HTML" });
      }
    });

    // Command "/status" handler
    bot.onText(/\/status/, async (msg) => {
      const chatIdStr = String(msg.chat.id);
      if (!isSenderAuthorized(msg)) {
        await bot?.sendMessage(chatIdStr, `🛑 <b>YETKİSİZ ERİŞİM</b>\nBu bota komut gönderme yetkiniz yok.`, { parse_mode: "HTML" });
        return;
      }

      await bot?.sendMessage(chatIdStr, `⚙️ <b>Sistem Durumu Hazırlanıyor...</b> Bilgiler çekiliyor.`, { parse_mode: "HTML" });
      try {
        const stats = await callbacks.getStatus();
        
        let reportStr = `🛰️ <b>OTONOM SISTEM ANLIK STOK RAPORU</b>\n`;
        reportStr += `--------------------------------------\n`;
        reportStr += `⚙️ <b>Motor Modu:</b> ${stats.isCrawling ? "🟢 TARAMA DEVREDE" : "🟡 BEKLEMEDE (IDLE)"}\n`;
        reportStr += `🔗 <b>Ağ Kanalı:</b> ${stats.selectedNetworkPath.toUpperCase()} | Mod: MAINNET\n`;
        reportStr += `🎯 <b>Devre Kesici:</b> <code>${stats.circuitBreakerStatus}</code>\n\n`;
        
        reportStr += `👤 <b>CÜZDAN VE ENANTER DURUMU</b>\n`;
        reportStr += `💳 <b>Signer Cüzdan:</b> <code>${stats.walletAddr}</code>\n`;
        reportStr += `⛽ <b>Gas Seviyesi:</b> <code>${stats.polBalance.toFixed(4)} POL</code>\n`;
        reportStr += `💵 <b>Rezerv Bakiyesi:</b> <code>${stats.usdtBalance} USDT</code>\n`;
        reportStr += `🟢 <b>Varlık Bakiyesi:</b> <code>${stats.greenBalance} KECO</code>\n\n`;

        reportStr += `📦 <b>HAZIR/RECYCLE VERİ VE VOUCHERLAR</b>\n`;
        reportStr += `📊 <b>Toplam Üretilen Varlık:</b> <code>${stats.totalAssets}</code>\n`;
        reportStr += `💎 <b>Hazır Vasıflı Varlıklar:</b> <code>${stats.readyToSell}</code>\n`;
        reportStr += `⛓️ <b>Mühürlü (Listed):</b> <code>${stats.listedOnChain}</code>\n`;
        reportStr += `💸 <b>Satılan / Likidite Edilen:</b> <code>${stats.soldAssets}</code>\n\n`;

        reportStr += `🍃 <b>VERİ EKOLOJİ ANALİTİĞİ</b>\n`;
        reportStr += `Processed Nodes: <code>${stats.pagesProcessed}</code>\n`;
        reportStr += `Reclaimed Storage: <code>${stats.totalKiloBytesSaved.toFixed(2)} KB</code>\n`;
        reportStr += `CO2 Offset: <code>${stats.totalCo2SavedGrams.toFixed(4)} g</code>\n`;
        
        if (stats.isCrawling && stats.currentCrawlingUrl) {
          reportStr += `🌐 <b>Aktif Taranan Sektör:</b> <code>${stats.currentCrawlingUrl}</code>\n`;
        }
        reportStr += `--------------------------------------\n`;
        reportStr += `📝 Bot kontrolü için /start veya /stop komutlarını kullanabilirsiniz.`;

        await bot?.sendMessage(chatIdStr, reportStr, { parse_mode: "HTML" });
      } catch (err: any) {
        await bot?.sendMessage(chatIdStr, `❌ <b>Rapor Hatası:</b> <code>${err.message}</code>`, { parse_mode: "HTML" });
      }
    });

    // Command "/analiz" handler
    bot.onText(/\/analiz/, async (msg) => {
      const chatIdStr = String(msg.chat.id);
      if (!isSenderAuthorized(msg)) {
        await bot?.sendMessage(chatIdStr, `🛑 <b>YETKİSİZ ERİŞİM</b>\nBu bota komut gönderme yetkiniz yok.`, { parse_mode: "HTML" });
        return;
      }
      try {
        const stats = await callbacks.getStatus();
        const statusReport = `📊 <b>SİSTEM DURUM RAPORU</b>\n\n` +
          `🔹 <b>Durum:</b> ${stats.isCrawling ? "🟢 Otonom Motor Aktif" : "🔴 Beklemede (IDLE)"}\n` +
          `🔹 <b>Gas Cüzdanı:</b> <code>${stats.walletAddr}</code>\n` +
          `🔹 <b>Gas Bakiye:</b> <code>${stats.polBalance.toFixed(4)} POL</code>\n` +
          `🔹 <b>USDT Bakiye:</b> <code>$${stats.usdtBalance} USDT</code>\n` +
          `🔹 <b>Toplam Varlık (NFT/Data):</b> <code>${stats.totalAssets} adet</code>\n` +
          `🔹 <b>Satılan / Likidide Edilen:</b> <code>${stats.soldAssets} adet</code>\n` +
          `🔹 <b>Son Güncelleme:</b> <code>${new Date().toLocaleTimeString()}</code>\n\n` +
          `<i>Sistem şu an stabil çalışıyor.</i>`;
        await bot?.sendMessage(chatIdStr, statusReport, { parse_mode: "HTML" });
      } catch (err: any) {
        await bot?.sendMessage(chatIdStr, `❌ <b>Analiz Hatası:</b> <code>${err.message}</code>`, { parse_mode: "HTML" });
      }
    });

    // Handle initial greeting or fallback text instructions
    bot.on("message", async (msg) => {
      // Avoid responding if unauthorized or if it's a command handled above
      if (!isSenderAuthorized(msg)) return;
      const text = msg.text;
      if (!text) return;
      
      if (!text.startsWith("/")) {
        const helpText = `👋 <b>Protokol İletişim Hattı Aktif!</b>\n\nCekcek Botunuzu 7/24 telefonunuzdan kontrol edebilirsiniz. Kullanılabilir Komutlar:\n\n` +
          `🟩 <code>/start</code> - Otonom mod ve taramayı başlatır.\n` +
          `🟨 <code>/stop</code> - Sistemi bekleme (IDLE) moduna alır, döngüleri dondurur.\n` +
          `📈 <code>/analiz</code> - Sistem durumunu analiz eder ve özetler.\n` +
          `📊 <code>/status</code> - Detaylı cüzdan bakiye ve varlık stoklarını raporlar.\n` +
          `🏓 <code>/ping</code> - Botun erişim bağlantısını anlık doğrular.`;
        await bot?.sendMessage(String(msg.chat.id), helpText, { parse_mode: "HTML" });
      }
    });

  } catch (err: any) {
    console.error(`[TELEGRAM] Error initializing bot: ${err.message}`);
  }
}

/**
 * Send an HTML-formatted system alert or success log to the user's Telegram chat.
 * Filters out high-frequency crawling telemetry noise as requested by "Sessizlik Kuralı".
 */
export async function sendTelegramNotification(message: string, isUrgent: boolean = false) {
  if (isTelegramTemporarilyDisabled) return;
  if (!bot || !configuredChatId) return;
  
  const upperMsg = message.toUpperCase();
  const isTargetMessage = isUrgent || 
                          upperMsg.includes("BAŞARILI") || 
                          upperMsg.includes("SUCCESS") || 
                          upperMsg.includes("HEDEF VERİ ELDE EDİLDİ") ||
                          upperMsg.includes("LİKİDASYON") ||
                          upperMsg.includes("OTONOM LİKİDASYON") ||
                          upperMsg.includes("PONG!") ||
                          message.includes("✅") ||
                          message.includes("🛑") ||
                          message.includes("🟩") ||
                          message.includes("🟨");

  // Skip high-frequency crawling logs or skip nodes to conform to the noiseless design
  if (!isTargetMessage && (
    upperMsg.includes("ATLANDI") || 
    upperMsg.includes("DÜĞÜM ATILDI") || 
    upperMsg.includes("TARAMA GÜNLÜĞÜ") ||
    upperMsg.includes("KRİTERİ UYUŞMADI") ||
    upperMsg.includes("YETERSİZ KALİTE")
  )) {
    // Suppress telemetry spam to keep the bot professional and silent during bulk scans
    return;
  }

  try {
    await bot.sendMessage(configuredChatId, message, { parse_mode: "HTML", disable_web_page_preview: true });
  } catch (err: any) {
    console.error(`[TELEGRAM_ERR] Telegram notify failure: ${err.message}`);
  }
}
