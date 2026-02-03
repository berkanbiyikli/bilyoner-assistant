'use client';

/**
 * Share Analysis Component
 * Maç analiz ekranının görüntüsünü alıp paylaşım seçenekleri sunar
 */

import { useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { 
  Share2, 
  Download, 
  Twitter, 
  Copy, 
  Check,
  Loader2,
  X,
  Image as ImageIcon
} from 'lucide-react';

interface ShareAnalysisProps {
  targetRef: React.RefObject<HTMLElement | null>;
  matchTitle: string;
  homeTeam: string;
  awayTeam: string;
}

export function ShareAnalysis({ 
  targetRef, 
  matchTitle,
  homeTeam,
  awayTeam 
}: ShareAnalysisProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const captureScreen = useCallback(async () => {
    if (!targetRef.current) {
      console.error('Target ref bulunamadı');
      return;
    }
    
    setIsCapturing(true);
    
    try {
      // Scroll pozisyonunu kaydet
      const scrollY = window.scrollY;
      window.scrollTo(0, 0);
      
      // Kısa bir bekleme - render tamamlansın
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Tüm resimleri bekle
      const images = targetRef.current.querySelectorAll('img');
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve; // Hata olsa da devam et
          // Timeout ekle
          setTimeout(resolve, 2000);
        });
      });
      await Promise.all(imagePromises);
      
      // Canvas'a çevir - daha basit ayarlarla
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#09090b',
        scale: 1.5, // Biraz düşürdük
        useCORS: true,
        allowTaint: true,
        logging: true, // Debug için açık
        foreignObjectRendering: false,
        imageTimeout: 5000,
        removeContainer: true,
        ignoreElements: (element) => {
          // Next.js Image optimization overlay'lerini atla
          if (element.tagName === 'NOSCRIPT') return true;
          return false;
        },
        onclone: (clonedDoc) => {
          // Clone'da img src'leri düzelt
          const clonedImages = clonedDoc.querySelectorAll('img');
          clonedImages.forEach(img => {
            // Next.js Image src'yi kullan
            const src = img.getAttribute('src');
            if (src && src.startsWith('/_next/image')) {
              // Orijinal src'yi bul ve kullan
              const originalSrc = img.getAttribute('data-src') || img.src;
              img.setAttribute('crossorigin', 'anonymous');
            }
          });
        }
      });
      
      // Scroll pozisyonunu geri yükle
      window.scrollTo(0, scrollY);
      
      // Watermark ekle
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Gradient background for watermark
        const gradient = ctx.createLinearGradient(0, canvas.height - 50, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
        
        // Watermark text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Bilyoner Assistant - AI Mac Analizi', canvas.width / 2, canvas.height - 18);
      }
      
      const dataUrl = canvas.toDataURL('image/png', 0.9);
      setCapturedImage(dataUrl);
      setShowModal(true);
    } catch (error) {
      console.error('Ekran görüntüsü hatası:', error);
      // Daha detaylı hata mesajı
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      console.error('Detay:', errorMessage);
      
      // Alternatif yöntem dene - sadece görünür alanı yakala
      try {
        if (targetRef.current) {
          const simpleCanvas = await html2canvas(targetRef.current, {
            backgroundColor: '#09090b',
            scale: 1,
            useCORS: false,
            allowTaint: true,
            logging: false,
            foreignObjectRendering: false,
          });
          const dataUrl = simpleCanvas.toDataURL('image/png', 0.8);
          setCapturedImage(dataUrl);
          setShowModal(true);
          return;
        }
      } catch {
        // İkinci deneme de başarısız
      }
      
      alert('Ekran görüntüsü alınamadı. Lütfen sayfayı yenileyip tekrar deneyin.');
    } finally {
      setIsCapturing(false);
    }
  }, [targetRef]);
  
  const downloadImage = useCallback(() => {
    if (!capturedImage) return;
    
    const link = document.createElement('a');
    link.download = `${homeTeam}-vs-${awayTeam}-analiz.png`;
    link.href = capturedImage;
    link.click();
  }, [capturedImage, homeTeam, awayTeam]);
  
  const copyToClipboard = useCallback(async () => {
    if (!capturedImage) return;
    
    try {
      // Data URL'den blob'a çevir
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      // Clipboard'a kopyala
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Kopyalama hatası:', error);
      // Fallback: Sadece text kopyala
      const text = `⚽ ${matchTitle}\n\n🔗 Bilyoner Assistant ile analiz edildi`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [capturedImage, matchTitle]);
  
  const shareToTwitter = useCallback(() => {
    const text = `⚽ ${homeTeam} vs ${awayTeam} maç analizi\n\n🤖 AI destekli tahmin ve istatistikler\n📊 Monte Carlo simülasyonu\n🎯 Takım stil analizi\n\n#Bilyoner #Bahis #Futbol`;
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
  }, [homeTeam, awayTeam]);
  
  const shareNative = useCallback(async () => {
    if (!capturedImage) return;
    
    try {
      // Data URL'den blob'a çevir
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const file = new File([blob], `${homeTeam}-vs-${awayTeam}-analiz.png`, { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${homeTeam} vs ${awayTeam} Analizi`,
          text: `⚽ AI destekli maç analizi - Bilyoner Assistant`,
          files: [file]
        });
      } else {
        // Native share desteklenmiyorsa Twitter'a yönlendir
        shareToTwitter();
      }
    } catch (error) {
      console.error('Paylaşım hatası:', error);
      shareToTwitter();
    }
  }, [capturedImage, homeTeam, awayTeam, shareToTwitter]);
  
  return (
    <>
      {/* Capture Button */}
      <button
        onClick={captureScreen}
        disabled={isCapturing}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
      >
        {isCapturing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Hazırlanıyor...</span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" />
            <span>Paylaş</span>
          </>
        )}
      </button>
      
      {/* Share Modal */}
      {showModal && capturedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-white">Analizi Paylaş</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>
            
            {/* Preview */}
            <div className="p-4 max-h-[50vh] overflow-auto">
              <img
                src={capturedImage}
                alt="Analiz Görüntüsü"
                className="w-full rounded-lg border border-zinc-700"
              />
            </div>
            
            {/* Actions */}
            <div className="p-4 border-t border-zinc-800 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Twitter */}
                <button
                  onClick={shareToTwitter}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-xl font-medium transition-colors"
                >
                  <Twitter className="h-5 w-5" />
                  <span>Twitter&apos;da Paylaş</span>
                </button>
                
                {/* Native Share / Copy */}
                <button
                  onClick={shareNative}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-medium transition-colors"
                >
                  <Share2 className="h-5 w-5" />
                  <span>Paylaş</span>
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Download */}
                <button
                  onClick={downloadImage}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                >
                  <Download className="h-5 w-5" />
                  <span>İndir</span>
                </button>
                
                {/* Copy */}
                <button
                  onClick={copyToClipboard}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-5 w-5 text-green-400" />
                      <span className="text-green-400">Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5" />
                      <span>Kopyala</span>
                    </>
                  )}
                </button>
              </div>
              
              <p className="text-xs text-zinc-500 text-center mt-2">
                💡 Görüntüyü indirip Twitter&apos;a fotoğraf olarak ekleyebilirsiniz
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
