#!/usr/bin/env node

/**
 * Setup Environment File
 * Render.com deploy sırasında .env dosyasını .env.example'den oluşturur
 * Bu script GitHub'da güvenlik sebebiyle yüklenmemiş .env dosyasını çoğaltır
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const envPath = path.join(projectRoot, '.env');
const envExamplePath = path.join(projectRoot, '.env.example');

console.log('🔍 Environment dosyası kontrol ediliyor...');
console.log(`   .env konumu: ${envPath}`);
console.log(`   .env.example konumu: ${envExamplePath}`);

if (!fs.existsSync(envPath)) {
  console.log('\n⚠️  .env dosyası bulunamıyor');

  if (fs.existsSync(envExamplePath)) {
    console.log('📝 .env.example\'den kopyalanıyor...');

    try {
      let content = fs.readFileSync(envExamplePath, 'utf8');

      // Fix potentially broken URLs in .env.example
      content = content.replace(
        /PROVIDER_1_URL=https:\/\/polygon\.rpc\.thirdweb\.com/g,
        'PROVIDER_1_URL=https://polygon-rpc.com'
      );
      content = content.replace(
        /PROVIDER_2_URL=https:\/\/polygon\.publicnode\.com/g,
        'PROVIDER_2_URL=https://rpc-mainnet.matic.network'
      );

      fs.writeFileSync(envPath, content);
      console.log('✅ .env dosyası başarıyla oluşturuldu');
      console.log('\n💡 NOT: Render.com Environment Variables otomatik olarak uygulanacak');
      process.exit(0);
    } catch (error) {
      console.error('❌ Kopyalama hatası:', error.message);
      process.exit(1);
    }
  } else {
    console.error('❌ .env.example dosyası bulunamıyor!');
    console.error('   Dosya projenin kök dizininde olmalı');
    process.exit(1);
  }
} else {
  console.log('✅ .env dosyası zaten mevcut');
  process.exit(0);
}
