import * as vscode from 'vscode'; 

function getConfig() {
  const config = vscode.workspace.getConfiguration('localLlmCodeCompletion');
  const apiUrl =
    config.get<string>('apiUrl') ??
    'http://localhost:11434/v1/chat/completions';
  const model = config.get<string>('model') ?? 'llama3.2:1b';
  const maxTokens = config.get<number>('maxTokens') ?? 96;
  const temperature = config.get<number>('temperature') ?? 0.2;
  return { apiUrl, model, maxTokens, temperature };
}

/**
 * prefixとcompletionの重複部分を削除する
 * 例: prefix="function sum(", completion="function sum(a, b) { ... }"
 * → "a, b) { ... }" を返す
 */
function removeOverlap(prefix: string, completion: string): string {
  // completionがprefixの末尾と重複している部分を見つける
  // prefixの末尾から最大100文字を確認
  const maxOverlapLength = Math.min(100, prefix.length);

  for (let overlapLen = maxOverlapLength; overlapLen > 0; overlapLen--) {
    const prefixEnd = prefix.slice(-overlapLen);
    if (completion.startsWith(prefixEnd)) {
      // 重複部分を削除して返す
      return completion.slice(overlapLen);
    }
  }

  // 重複が見つからなければそのまま返す
  return completion;
}

/**
 * Ollama(OpenAI互換) にチャット補完リクエストを投げる
 */
async function requestCompletion(
  prefix: string,
  suffix: string
): Promise<string | null> {
  const { apiUrl, model, maxTokens, temperature } = getConfig();

  // Fill-in-the-Middle (FIM) 形式のプロンプト
  const prompt = [
    'Complete the code at the <FILL> position. Return ONLY the completion text that should be inserted at <FILL>.',
    'Do NOT repeat the prefix code. Do NOT include explanations, markdown, or backticks.',
    'Just return the exact code that continues from where the prefix ends.',
    '',
    '<PREFIX>',
    prefix,
    '<FILL>',
    '<SUFFIX>',
    suffix,
    '</SUFFIX>',
    '',
    'Return only the completion for <FILL>:'
  ].join('\n');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature,
        stream: false
      })
    });

    if (!response.ok) {
      console.error(
        '[local-llm-code-completion] API error:',
        response.status,
        response.statusText
      );
      return null;
    }

    const data = await response.json() as any;
    console.log('[local-llm-code-completion] API response:', data);

    const message = data.choices?.[0]?.message;
    if (!message) {
      console.log('[local-llm-code-completion] No message in response');
      return null;
    }

    // contentフィールドから補完テキストを取得
    const completion = message.content;
    if (!completion || !completion.trim()) {
      console.log('[local-llm-code-completion] No completion in response');
      return null;
    }

    // 余分な空白や改行をトリム
    let trimmed = completion.trim();

    // "Thinking..." 系は除外
    if (/thinking/i.test(trimmed)) {
      return null;
    }

    // prefixの重複を削除（LLMがprefixを繰り返してしまう場合の対策）
    // 例: prefix="function sum(" で completion="function sum(a, b) { return a + b }" と返ってきた場合
    // → "a, b) { return a + b }" だけを返す
    trimmed = removeOverlap(prefix, trimmed);

    return trimmed;
  } catch (error) {
    console.error('[local-llm-code-completion] Request error:', error);
    return null;
  }
}

/**
 * インライン補完プロバイダ
 */
const DEBOUNCE_MS = 300; // タイプ停止からどれくらい待つか（ms）

const inlineProvider: vscode.InlineCompletionItemProvider = {
  async provideInlineCompletionItems(
    document,
    position,
    _context,
    token
  ): Promise<vscode.InlineCompletionList | undefined> {
    if (token.isCancellationRequested) return;

    // ★ ここでデバウンス：少し待って、入力が止まったか様子を見る
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, DEBOUNCE_MS);

      // キャンセルされたら即終了（待ちも解除）
      token.onCancellationRequested(() => {
        clearTimeout(timeout);
        resolve();
      });
    });

    if (token.isCancellationRequested) {
      // 待っている間に新しい入力が来て、このリクエストは古くなった
      return;
    }

    const startLine = Math.max(0, position.line - 20);
    const endLine = Math.min(document.lineCount - 1, position.line + 20);

    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(
      endLine,
      document.lineAt(endLine).range.end.character
    );

    const beforeCursorRange = new vscode.Range(startPos, position);
    const afterCursorRange = new vscode.Range(position, endPos);

    const prefix = document.getText(beforeCursorRange);
    const suffix = document.getText(afterCursorRange);

    // prefixが空の場合は補完しない（最低限のコンテキストが必要）
    if (!prefix.trim()) {
      return;
    }

    // 生成中通知付き
    const result = await vscode.window.withProgress<
      vscode.InlineCompletionList | undefined
    >(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Local LLM: generating completion...',
        cancellable: true
      },
      async (_progress, progressToken) => {
        if (token.isCancellationRequested || progressToken.isCancellationRequested) {
          return;
        }

        const completion = await requestCompletion(prefix, suffix);
        if (!completion) {
          console.log('[local-llm-code-completion] completion is null or empty');
          return;
        }

        console.log(
          '[local-llm-code-completion] completion text:',
          JSON.stringify(completion)
        );

        const item = new vscode.InlineCompletionItem(
          completion,
          new vscode.Range(position, position)
        );

        return { items: [item] };
      }
    );

    return result;
  }
};

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage(
    'local-llm-code-completion ACTIVATED!'
  );

  // Hello World コマンド（動作確認用）
  const disposable = vscode.commands.registerCommand(
    'local-llm-code-completion.helloWorld',
    () => {
      vscode.window.showInformationMessage(
        'Hello from Local LLM Code Completion!'
      );
    }
  );
  context.subscriptions.push(disposable);

  // ★ 追加：Progress通知のテストコマンド
  const testProgress = vscode.commands.registerCommand(
    'local-llm-code-completion.testProgress',
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Local LLM: test progress...',
          cancellable: false
        },
        async () => {
          // 2秒だけ待って終わる
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      );
    }
  );
  context.subscriptions.push(testProgress);

  // 対象言語（必要に応じて増やしてOK）
  const selector: vscode.DocumentSelector = [
    { scheme: 'file' },
    { scheme: 'untitled' } // 新規ファイルも対象に
  ];

  const providerDisposable =
    vscode.languages.registerInlineCompletionItemProvider(
      selector,
      inlineProvider
    );

  context.subscriptions.push(providerDisposable);
}

export function deactivate() {}
