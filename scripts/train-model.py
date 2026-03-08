"""
============================================
ML Model Eğitim Scripti (Faz 4)
============================================
Kullanım: python scripts/train-model.py
Girdi:  data/training-data.json
Çıktı:  models/prediction-model.json

Logistic Regression + isteğe bağlı Decision Tree
scikit-learn ile eğitim, JSON formatında export
============================================
"""

import json
import os
import sys
from datetime import datetime

import numpy as np

try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import log_loss, roc_auc_score
except ImportError:
    print("❌ scikit-learn gerekli: pip install scikit-learn numpy")
    sys.exit(1)


DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "training-data.json")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "prediction-model.json")

MARKETS = [
    "home_win", "draw", "away_win",
    "over_25", "under_25",
    "over_15", "under_15",
    "over_35", "under_35",
    "btts_yes", "btts_no",
]

# Tüm örneklerde bulunan ortak feature'ları belirle
BASE_FEATURES = [
    "confidence", "odds", "expected_value", "is_value_bet", "sim_probability"
]


def load_data():
    if not os.path.exists(DATA_PATH):
        print(f"❌ Eğitim verisi bulunamadı: {DATA_PATH}")
        print("   Önce çalıştırın: npx tsx scripts/prepare-training-data.ts")
        sys.exit(1)

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)

    print(f"✅ {len(raw)} örnek yüklendi")
    return raw


def prepare_features(data, feature_names):
    """Feature matrisini oluştur — eksik feature'lar 0 ile doldurulur"""
    X = np.zeros((len(data), len(feature_names)))
    for i, row in enumerate(data):
        for j, fname in enumerate(feature_names):
            X[i, j] = row["features"].get(fname, 0.0)
    return X


def train_market(X, y, market_name, feature_names):
    """Tek bir market için Logistic Regression eğit"""
    # Sınıf dengesizliği kontrolü
    pos_ratio = np.mean(y)
    if pos_ratio < 0.05 or pos_ratio > 0.95:
        print(f"  ⚠️  {market_name}: Sınıf dengesizliği ({pos_ratio:.2%} pozitif) — atlanıyor")
        return None

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LogisticRegression(
        max_iter=1000,
        C=1.0,
        solver="lbfgs",
        class_weight="balanced",
    )

    # Cross-validation
    n_samples = len(y)
    cv_folds = min(5, max(2, n_samples // 10))

    if n_samples >= 20:
        cv_scores = cross_val_score(model, X_scaled, y, cv=cv_folds, scoring="accuracy")
        accuracy = cv_scores.mean()
    else:
        accuracy = 0.0

    # Final model eğit
    model.fit(X_scaled, y)

    # Metrikler
    y_pred_proba = model.predict_proba(X_scaled)[:, 1]
    ll = log_loss(y, y_pred_proba)

    try:
        auc = roc_auc_score(y, y_pred_proba)
    except ValueError:
        auc = 0.5

    # Ağırlıkları scale'den geri dönüştür (inference'da scaling gerekmez)
    # w_original = w_scaled / scale, b_original = b_scaled - sum(w_scaled * mean / scale)
    coefs = model.coef_[0]
    intercept = model.intercept_[0]

    # Unscale: original feature space'e geri dönüştür
    scale = scaler.scale_
    mean = scaler.mean_
    weights_original = coefs / scale
    bias_original = intercept - np.sum(coefs * mean / scale)

    print(f"  ✅ {market_name}: accuracy={accuracy:.3f}, log_loss={ll:.3f}, AUC={auc:.3f}")

    return {
        "weights": weights_original.tolist(),
        "bias": float(bias_original),
        "featureNames": feature_names,
        "metrics": {
            "accuracy": round(float(accuracy), 4),
            "logLoss": round(float(ll), 4),
            "auc": round(float(auc), 4),
        },
    }


def main():
    print("=" * 50)
    print("🤖 ML Model Eğitimi (Logistic Regression)")
    print("=" * 50)

    data = load_data()

    if len(data) < 10:
        print("⚠️  Çok az veri (<10). Eğitim sonuçları güvenilir olmayabilir.")

    # Kullanılacak feature'ları belirle
    feature_names = list(BASE_FEATURES)
    print(f"📐 Feature sayısı: {len(feature_names)}")
    print(f"📐 Feature'lar: {feature_names}")

    X = prepare_features(data, feature_names)

    model_output = {
        "type": "logistic_regression",
        "version": "1.0.0",
        "trainedAt": datetime.utcnow().isoformat() + "Z",
        "sampleCount": len(data),
        "markets": {},
    }

    print(f"\n🏋️ Market bazlı eğitim başlıyor ({len(MARKETS)} market)...\n")

    successful = 0
    for market in MARKETS:
        y = np.array([row["labels"].get(market, 0) for row in data])
        result = train_market(X, y, market, feature_names)
        if result:
            model_output["markets"][market] = result
            successful += 1

    # Kaydet
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "w", encoding="utf-8") as f:
        json.dump(model_output, f, indent=2, ensure_ascii=False)

    print(f"\n{'=' * 50}")
    print(f"✅ Model kaydedildi: {MODEL_PATH}")
    print(f"   {successful}/{len(MARKETS)} market başarıyla eğitildi")
    print(f"   {len(data)} örnek kullanıldı")
    print(f"\n💡 Model otomatik olarak Next.js tarafından yüklenecek.")
    print(f"   Yeniden eğitmek için bu scripti tekrar çalıştırın.")


if __name__ == "__main__":
    main()
