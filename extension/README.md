# Bilyoner Assistant — Chrome Extension

## Kurulum

Chrome uzantı mağazasına yüklenmeden önce manuel kurulum:

1. Chrome'da `chrome://extensions/` adresine gidin
2. Sağ üstten **Geliştirici modu**'nu açın
3. **Paketlenmemiş öğe yükle** butonuna tıklayın
4. Bu `extension/` klasörünü seçin

## Kullanım

1. Uzantı simgesine tıklayın
2. **API Adresi** alanına Vercel URL'inizi girin (örn: `https://bilyoner-assistant.vercel.app`)
3. Kupon kategorisini seçin (Güvenli / Dengeli / Riskli / Value)
4. **Tahminleri Getir** butonuna tıklayın
5. Gelen tahminleri inceleyin
6. **Bilyoner.com** sayfasını açın
7. **Bilyoner'e Aktar** butonuna tıklayın

## Notlar

- Aktarım sırasında Bilyoner.com açık ve maçlar listelenmiş olmalıdır
- Uzantı, Bilyoner'in DOM yapısındaki maçları takım ismi eşleşmesiyle bulur
- Bilyoner site yapısını değiştirirse `content.js` güncellenmesi gerekebilir

## İkon Dosyaları

Uzantının çalışması için `icons/` klasöründe PNG ikon dosyaları gerekli:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

SVG dosyasından PNG oluşturabilirsiniz veya herhangi bir 128x128 PNG kullanabilirsiniz.
