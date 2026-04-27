# Stock Metadata Generator

Adobe Stockに登録するイラストのメタデータ（タイトル・キーワード・カテゴリ）をAIで一括生成するツールです。

---

## セットアップ手順

### 1. Node.jsをインストール

https://nodejs.org/ja/ を開いて「LTS版」をダウンロードしてインストール。
ウィザードに従って「Next」を押していくだけでOKです。

### 2. このフォルダをどこかに置く

例：デスクトップに `smg` フォルダとして解凍する

### 3. コマンドプロンプトを開く

Windowsキー → 「cmd」と入力 → Enter

### 4. フォルダに移動する

以下をコピペしてEnter（フォルダの場所に合わせて変更してください）

```
cd Desktop\smg
```

### 5. 必要なパッケージをインストール

```
npm install
```

しばらく待つ（1〜2分）

### 6. 起動する

```
npm run dev
```

ブラウザで http://localhost:5173 を開くとアプリが起動します。

---

## Netlifyへのデプロイ（URLを発行する）

### 1. ビルドする

```
npm run build
```

`dist` フォルダが生成されます。

### 2. Netlifyにアップロード

1. https://netlify.com でアカウント作成（無料）
2. ダッシュボードの「Add new site」→「Deploy manually」
3. `dist` フォルダをそのままドラッグ＆ドロップ
4. URLが発行されます

---

## 使い方

1. 左下「APIキー設定」からAnthropicのAPIキーを入力
   - https://console.anthropic.com でAPIキーを取得できます
2. 「今日の作業」でイラストをドロップ
3. 必要なら「AIへの追加指示」に指示を入力
4. 「AIでメタデータを生成」ボタンを押す
5. 結果を確認・編集
6. 「CSVを書き出す」でAdobe Stock用CSVをダウンロード

---

## データについて

- 履歴はブラウザのlocalStorageに保存されます
- APIキーもlocalStorageに保存されます（このPCのブラウザにのみ）
- 画像データ（base64）も含めて保存されるため、過去のセッションも再編集できます
