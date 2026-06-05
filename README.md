# HR_ACC_dashboard_v2_resting_tab1

## 内容

HR_ACC_dashboard の別バージョンとして作成した、タブ1「安静時心拍数」の最小実装です。

## 実装済み

- 5月25日を既定対象日に設定
- ID選択
- 11:10〜11:50 の心拍時系列表示
- 選択IDの心拍数と全員平均心拍数の重ね描き
- `HeartRate_bpm` を持つ秒単位CSVと、`MeanHeartRate_bpm` を持つ分単位CSVの両方に対応
- 既存版に近いダークグラファイト系デザイン

## CSV列

以下のどちらかを想定しています。

### 秒単位

```csv
index,SensorID,Timestamp,HeartRate_bpm,AccNorm_g,BodyMovement_ENMO_g,...
0,V001,2026-05-25 11:10:00,80,1.00,0.00,...
```

### 分単位

```csv
index,SensorID,Minute,n_seconds,MeanHeartRate_bpm,MeanAccNorm_g,...
0,V001,2026-05-25 11:10:00,60,80.5,1.00,...
```

## 配置

GitHub Pages で自動読込する場合は、以下のいずれかのファイルを `data/` に置いてください。

- `data/hr_acc_index_per_second_2026-05-25.csv`
- `data/hr_acc_index_per_minute_2026-05-25.csv`
- `data/hr_acc_index_per_second.csv`
- `data/hr_acc_index_per_minute.csv`

自動読込できない場合でも、画面上のCSV選択から読み込めます。
