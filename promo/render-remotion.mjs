/**
 * Bilyoner Assistant — Remotion ile Promo Video Render
 * 
 * Kullanım:
 *   node promo/render-remotion.mjs
 * 
 * Veya Remotion Studio ile önizleme:
 *   npx remotion studio promo/remotion/index.tsx
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🎬 Bilyoner Assistant — Remotion Video Renderer');
  console.log('================================================\n');

  const entryPoint = path.join(__dirname, 'remotion', 'index.tsx');
  const outputDir = path.join(__dirname, 'output');

  console.log('📦 Bundling...');
  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  // Render portrait (1080x1920 - Stories/Reels/TikTok)
  console.log('\n📱 Portrait video render ediliyor (1080x1920)...');
  const portraitComp = await selectComposition({
    serveUrl: bundleLocation,
    id: 'BilyonerPromo',
  });

  await renderMedia({
    composition: portraitComp,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: path.join(outputDir, 'bilyoner-promo-portrait.mp4'),
    imageFormat: 'jpeg',
    jpegQuality: 90,
  });
  console.log('✅ Portrait video kaydedildi: output/bilyoner-promo-portrait.mp4');

  // Render landscape (1920x1080 - YouTube/Twitter)
  console.log('\n🖥️  Landscape video render ediliyor (1920x1080)...');
  const landscapeComp = await selectComposition({
    serveUrl: bundleLocation,
    id: 'BilyonerPromoLandscape',
  });

  await renderMedia({
    composition: landscapeComp,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: path.join(outputDir, 'bilyoner-promo-landscape.mp4'),
    imageFormat: 'jpeg',
    jpegQuality: 90,
  });
  console.log('✅ Landscape video kaydedildi: output/bilyoner-promo-landscape.mp4');

  console.log('\n================================================');
  console.log('🎉 Tamamlandı!\n');
  console.log('📁 Çıktılar:');
  console.log('   📱 output/bilyoner-promo-portrait.mp4  (Instagram/TikTok/Reels)');
  console.log('   🖥️  output/bilyoner-promo-landscape.mp4 (YouTube/Twitter)');
  console.log('\n💡 Remotion Studio ile önizleme için:');
  console.log('   npx remotion studio promo/remotion/index.tsx\n');
}

main().catch((err) => {
  console.error('❌ Hata:', err);
  process.exit(1);
});
