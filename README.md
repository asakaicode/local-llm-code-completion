# Local LLM Code Completion

Ollama を使用してローカルLLMでAI支援コード補完を提供するVS Code拡張機能です。

## 機能

- **インラインコード補完**: タイピング中にリアルタイムでコード提案を表示
- **ローカル実行**: Ollamaを使用して完全にローカルマシン上で動作
- **カスタマイズ可能**: モデル、APIエンドポイント、生成パラメータを設定可能
- **プライバシー重視**: コードが外部に送信されることはありません

## 必要な環境

この拡張機能を使用する前に、Ollamaをインストールして起動する必要があります：

1. **Ollamaのインストール**: [ollama.ai](https://ollama.ai) からダウンロードしてインストール

2. **モデルのダウンロード**: コード補完用のモデルを取得
   ```bash
   ollama pull llama3.2:1b
   ```

3. **Ollamaサーバーの起動**: Ollamaが実行されていることを確認
   ```bash
   ollama serve
   ```

## ローカルでの試し方

この拡張機能をローカル環境で試すには：

1. **リポジトリのクローン**
   ```bash
   git clone <repository-url>
   cd local-llm-code-completion
   ```

2. **依存関係のインストール**
   ```bash
   pnpm install
   # または
   npm install
   ```

3. **Ollamaの起動**（まだ起動していない場合）
   ```bash
   ollama serve
   ```

4. **VS Codeで開く**
   ```bash
   code .
   ```

5. **拡張機能の実行**
   - `F5` キーを押すと、拡張機能が読み込まれた新しいVS Codeウィンドウが開きます
   - 拡張機能は起動時に自動的にアクティベートされます

6. **補完のテスト**
   - 任意のコードファイル（TypeScript、JavaScript、Pythonなど）を開きます
   - コードを入力して約300ms待ちます
   - インライン補完の提案が表示されます

## 拡張機能の設定

この拡張機能は以下の設定項目を提供します：

- `localLlmCodeCompletion.apiUrl`: Ollama APIエンドポイント
  - デフォルト: `http://localhost:11434/v1/chat/completions`
- `localLlmCodeCompletion.model`: 補完に使用するモデル名
  - デフォルト: `llama3.2:1b`
- `localLlmCodeCompletion.maxTokens`: 補完の最大トークン数
  - デフォルト: `96`
- `localLlmCodeCompletion.temperature`: サンプリング温度（0 = 確定的）
  - デフォルト: `0.2`

## 動作の仕組み

1. 拡張機能がカーソル位置を監視し、周辺のコードコンテキストを取得
2. タイピングが停止すると、Fill-in-the-Middle (FIM) 形式のプロンプトをOllamaに送信
3. LLMがprefixとsuffixのコンテキストに基づいて補完を生成
4. 提案がインラインコンプリーションテキストとして表示（GitHub Copilot風）
5. `Tab` キーで提案を受け入れ、または入力を続けて無視

## 開発用スクリプト

- `pnpm run compile`: 拡張機能のビルド
- `pnpm run watch`: 開発用ウォッチモード
- `pnpm run lint`: ESLintの実行
- `pnpm run format`: Prettierでコードフォーマット
- `pnpm run test`: テストの実行

## 既知の問題

- 補完の品質は使用するモデルに依存します
- より大きなモデルはより良い結果を提供しますが、遅くなる可能性があります
- 過剰なAPI呼び出しを避けるため、300msのデバウンスを使用しています

## リリースノート

### 0.0.1

初期開発リリース:
- 基本的なインライン補完機能
- Ollama API統合
- モデルとパラメータの設定可能化
- デバウンスと重複検出機能
