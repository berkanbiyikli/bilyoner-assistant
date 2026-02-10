/**
 * Bilyoner Assistant - Promo Video Generator
 * 
 * Bu script promo-video.html dosyasını açar, her slide'ı ekran görüntüsü olarak 
 * kaydeder ve ardından bunları bir WebM videoya birleştirir.
 * 
 * Kullanım: node promo/generate-video.mjs
 * 
 * Gereksinimler: puppeteer (zaten devDependencies'de var)
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  width: 1080,
  height: 1920,
  slideCount: 11,
  slideDuration: 4500, // ms - matches HTML
  fps: 30,
  outputDir: path.join(__dirname, 'output'),
  screenshotsDir: path.join(__dirname, 'output', 'screenshots'),
  htmlPath: path.join(__dirname, 'promo-video.html'),
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateScreenshots() {
  console.log('🎬 Bilyoner Assistant Promo Video Generator');
  console.log('==========================================\n');

  // Create output directories
  if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  if (!fs.existsSync(CONFIG.screenshotsDir)) fs.mkdirSync(CONFIG.screenshotsDir, { recursive: true });

  console.log('🚀 Puppeteer başlatılıyor...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--window-size=${CONFIG.width},${CONFIG.height}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: CONFIG.width, height: CONFIG.height, deviceScaleFactor: 1 });

  const htmlUrl = `file:///${CONFIG.htmlPath.replace(/\\/g, '/')}`;
  console.log(`📄 HTML açılıyor: ${htmlUrl}\n`);
  await page.goto(htmlUrl, { waitUntil: 'networkidle0' });

  // Wait for initial load
  await sleep(1000);

  // Override the automatic slideshow to manual control
  await page.evaluate(() => {
    // Stop auto-advance
    const highestId = window.setTimeout(() => {}, 0);
    for (let i = 0; i < highestId; i++) window.clearTimeout(i);
    for (let i = 0; i < highestId; i++) window.clearInterval(i);
  });

  console.log('📸 Slide\'lar yakalanıyor...\n');

  for (let slideIndex = 0; slideIndex < CONFIG.slideCount; slideIndex++) {
    // Navigate to slide
    await page.evaluate((idx) => {
      document.querySelectorAll('.slide').forEach((slide, i) => {
        slide.classList.remove('active', 'exit');
        slide.style.transition = 'none';
        // Reset animation items
        slide.querySelectorAll('.anim-item').forEach(item => {
          item.style.opacity = '0';
        });
      });

      const targetSlide = document.getElementById(`slide-${idx}`);
      if (targetSlide) {
        targetSlide.classList.add('active');
        // Force animations
        targetSlide.querySelectorAll('.anim-item').forEach((item, i) => {
          item.style.animation = `fadeUp 0.5s ease-out forwards`;
          item.style.animationDelay = `${i * 0.15}s`;
        });
      }
    }, slideIndex);

    // Wait for animations to settle
    await sleep(1500);

    // Capture multiple frames per slide for smooth video feel
    const framesPerSlide = Math.ceil((CONFIG.slideDuration / 1000) * CONFIG.fps);
    const captureCount = Math.min(framesPerSlide, 6); // Capture 6 key frames per slide

    for (let frame = 0; frame < captureCount; frame++) {
      const globalFrame = slideIndex * captureCount + frame;
      const filename = `frame_${String(globalFrame).padStart(5, '0')}.png`;
      const filepath = path.join(CONFIG.screenshotsDir, filename);

      await page.screenshot({
        path: filepath,
        type: 'png',
        clip: { x: 0, y: 0, width: CONFIG.width, height: CONFIG.height },
      });

      if (frame === 0) {
        console.log(`  ✅ Slide ${slideIndex + 1}/${CONFIG.slideCount}: ${getSlideTitle(slideIndex)} (${captureCount} frames)`);
      }

      // Small delay between frames for animation progression
      if (frame < captureCount - 1) {
        await sleep(200);
      }
    }
  }

  // Also save individual slide screenshots for social media
  console.log('\n📱 Sosyal medya görselleri kaydediliyor...\n');
  
  for (let slideIndex = 0; slideIndex < CONFIG.slideCount; slideIndex++) {
    await page.evaluate((idx) => {
      document.querySelectorAll('.slide').forEach(slide => {
        slide.classList.remove('active', 'exit');
        slide.querySelectorAll('.anim-item').forEach(item => {
          item.style.opacity = '1';
          item.style.animation = 'none';
          item.style.transform = 'none';
        });
      });
      const targetSlide = document.getElementById(`slide-${idx}`);
      if (targetSlide) {
        targetSlide.classList.add('active');
        targetSlide.querySelectorAll('.anim-item').forEach(item => {
          item.style.opacity = '1';
          item.style.animation = 'none';
          item.style.transform = 'none';
        });
      }
    }, slideIndex);

    await sleep(500);

    const slideName = getSlideFilename(slideIndex);
    await page.screenshot({
      path: path.join(CONFIG.outputDir, `slide_${String(slideIndex + 1).padStart(2, '0')}_${slideName}.png`),
      type: 'png',
      clip: { x: 0, y: 0, width: CONFIG.width, height: CONFIG.height },
    });
    console.log(`  📱 ${slideName}.png kaydedildi`);
  }

  await browser.close();
  console.log('\n✅ Tüm görseller kaydedildi!');
  console.log(`📁 Konum: ${CONFIG.outputDir}\n`);

  return CONFIG.screenshotsDir;
}

function getSlideTitle(index) {
  const titles = [
    'Intro / Logo',
    'Problem Tanımı',
    'AI Picks — Asistanın Radarı',
    'Seri Yakalayanlar',
    'Sürpriz Radarı',
    'Kombine Sihirbazı',
    'Kupon Paneli',
    'Performans Takibi',
    'Canlı Maç Avcısı',
    'Tüm Özellikler',
    'CTA — Hemen Başla',
  ];
  return titles[index] || `Slide ${index}`;
}

function getSlideFilename(index) {
  const names = [
    'intro',
    'problem',
    'ai-picks',
    'trend-tracker',
    'surprise-radar',
    'quick-build',
    'coupon-panel',
    'performance',
    'live-hunting',
    'features-summary',
    'cta',
  ];
  return names[index] || `slide-${index}`;
}

async function createVideoFromScreenshots(screenshotsDir) {
  console.log('🎥 Video oluşturuluyor (HTML5 Canvas yöntemi)...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Get all frame files
  const frames = fs.readdirSync(screenshotsDir)
    .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
    .sort();

  if (frames.length === 0) {
    console.log('❌ Frame dosyaları bulunamadı!');
    await browser.close();
    return;
  }

  // Convert frames to base64
  const frameDataUrls = frames.map(f => {
    const data = fs.readFileSync(path.join(screenshotsDir, f));
    return `data:image/png;base64,${data.toString('base64')}`;
  });

  // Create canvas-based video encoder page  
  await page.setViewport({ width: CONFIG.width, height: CONFIG.height });

  const videoHtml = `
  <!DOCTYPE html>
  <html>
  <body>
  <canvas id="c" width="${CONFIG.width}" height="${CONFIG.height}"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    
    window.encodeVideo = async function(frameUrls, fps, frameDuplicates) {
      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, { 
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000
      });
      
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      
      return new Promise(async (resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        };
        
        recorder.start();
        
        for (let i = 0; i < frameUrls.length; i++) {
          const img = new Image();
          await new Promise((res) => {
            img.onload = res;
            img.src = frameUrls[i];
          });
          
          // Draw frame multiple times for desired duration
          for (let d = 0; d < frameDuplicates; d++) {
            ctx.drawImage(img, 0, 0, ${CONFIG.width}, ${CONFIG.height});
            await new Promise(r => setTimeout(r, 1000 / fps));
          }
        }
        
        // Extra frames at the end
        await new Promise(r => setTimeout(r, 500));
        recorder.stop();
      });
    };
  </script>
  </body>
  </html>`;

  await page.setContent(videoHtml);
  await sleep(1000);

  console.log(`  📊 ${frames.length} frame işleniyor...`);
  console.log(`  ⏱️  Bu işlem yaklaşık ${Math.ceil(frames.length * 22 / CONFIG.fps)} saniye sürebilir...\n`);

  try {
    // Each frame should show for ~750ms (slide_duration / frames_per_slide)
    const frameDuplicates = 22; // ~0.73s per frame at 30fps
    
    const videoBase64 = await page.evaluate(
      async (urls, fps, dups) => await window.encodeVideo(urls, fps, dups),
      frameDataUrls,
      CONFIG.fps,
      frameDuplicates
    );

    if (videoBase64) {
      const videoPath = path.join(CONFIG.outputDir, 'bilyoner-assistant-promo.webm');
      fs.writeFileSync(videoPath, Buffer.from(videoBase64, 'base64'));
      console.log(`✅ Video kaydedildi: ${videoPath}`);
      
      const sizeMB = (fs.statSync(videoPath).size / (1024 * 1024)).toFixed(2);
      console.log(`📦 Boyut: ${sizeMB} MB`);
    }
  } catch (error) {
    console.log(`⚠️  Video encoding başarısız (${error.message})`);
    console.log('   Alternatif olarak ffmpeg kullanabilirsiniz:');
    console.log(`   ffmpeg -framerate 2 -i "${CONFIG.screenshotsDir}/frame_%05d.png" -c:v libx264 -pix_fmt yuv420p -vf "scale=1080:1920" "${CONFIG.outputDir}/promo.mp4"`);
  }

  await browser.close();
}

async function main() {
  try {
    const screenshotsDir = await generateScreenshots();
    await createVideoFromScreenshots(screenshotsDir);
    
    console.log('\n==========================================');
    console.log('🎉 Tamamlandı!\n');
    console.log('📁 Çıktılar:');
    console.log(`   📂 ${CONFIG.outputDir}`);
    console.log('   ├── 📹 bilyoner-assistant-promo.webm (video)');
    console.log('   ├── 📱 slide_01_intro.png');
    console.log('   ├── 📱 slide_02_problem.png');
    console.log('   ├── 📱 slide_03_ai-picks.png');
    console.log('   ├── 📱 slide_04_trend-tracker.png');
    console.log('   ├── 📱 slide_05_surprise-radar.png');
    console.log('   ├── 📱 slide_06_quick-build.png');
    console.log('   ├── 📱 slide_07_coupon-panel.png');
    console.log('   ├── 📱 slide_08_performance.png');
    console.log('   ├── 📱 slide_09_live-hunting.png');
    console.log('   ├── 📱 slide_10_features-summary.png');
    console.log('   └── 📱 slide_11_cta.png');
    console.log('\n💡 İpuçları:');
    console.log('   - Slide PNG\'lerini Instagram/Twitter story olarak kullanabilirsin');
    console.log('   - WebM videoyu MP4\'e çevirmek için: ffmpeg -i promo.webm promo.mp4');
    console.log('   - HTML dosyasını tarayıcıda açarak canlı önizleme yapabilirsin');
    console.log('   - Slide sürelerini CONFIG.slideDuration ile ayarlayabilirsin\n');
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

main();
