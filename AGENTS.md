# Master Satış Botu Protokolü (Sonsuz Döngü ve Gelir Protokolü)

Aşağıdaki otonom yönergeler ve kurallar, sistemin sıfır masrafla (Zero-Gas), kesintisiz (Infinite Loop) ve tam otonom çalışmasını sağlamak için konfigüre edilmiştir:

1. **Sonsuz Tarama ve Temizleme (Infinite Loop)**:
   - Limiti Kaldır: Herhangi bir dosya sayısı veya sayfa limiti yoktur. Tarama, temizleme ve analiz işlemleri, sistem kapatılmadığı sürece aralıksız (loop) olarak sonsuza kadar devam eder.
   - Sistem sürekli taranan hedef verileri (karbon kredileri/pazar verileri) Google Gemini yapay zekası ile süzüp temizleyerek anlık olarak `READY_TO_SELL` envanter veritabanına ekler.
   - Hata Koruması: Sistem tarama yaparken veya dosyaları işlerken herhangi bir hata alırsa, o hatayı ve adresi atlayıp vakit kaybetmeden bir sonraki adrese geçer. Döngü hiçbir zaman kırılmaz veya durdurulmaz.

2. **Ücretsiz İşletim (Zero-Gas Mode & Gas Fee Bypassing)**:
   - Uygulama işlemlerinde asla doğrudan `PRIVATE_KEY` kullanarak gas fee harcanmaz. Sadece `payoutWalletAddress` (0xF7BfCBf93f422EbE3C7B62509F0A9bdd4eD6aE8D) cüzdan adresi üzerinden para kabul edilir.

3. **Akıllı Kontrat Entegrasyonu ve Otonom Satış**:
   - `0x71C7656EC7ab88b098defB751B7401B5f6d8976F` adresi veri satış kapısı olarak kullanılır. Alıcılar bu akıllı kontrata ödeme yaptığında veriler otomatik olarak serbest bırakılır ve alıcıya API teslimatı tetiklenir.

4. **Gelir Transferi ve Otomatik Yönlendirme**:
   - Kontrata gelen her ödeme (USDT/POL), otomatik olarak kullanıcının tanımladığı payout cüzdan adresine (`0xF7BfCBf93f422EbE3C7B62509F0A9bdd4eD6aE8D`) anlık olarak çekilir/yönlendirilir.

5. **Otonomi & Enerji Tasarrufu**:
   - Uygulamanın aktif kalması için her 5 dakikada bir otomatik otonom "keep-alive" sinyali (Kalp Atışı/Heartbeat) sunucu günlüğüne iletilir.
   - Sistem, işlem yapmadığı ve boşta kaldığı sürelerde kaynak tüketimini minimuma indirmek amacıyla 'sleep' (uyku) modunda bekler, ancak tarama tetikleyicisi her zaman arka planda aktif kalır.
