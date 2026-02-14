# MIDI MCP Server

stdio 上で動作する MCP (Model Context Protocol) サーバーとして MIDI ファイル操作ユーティリティを提供します。

## 概要
- パス指定で MIDI ファイルを開く / 編集 / 保存
- トラック、イベント、テンポ / 拍子マップの取得
- 変換の適用（クオンタイズ、ヒューマナイズ、トランスポーズ、スケール制約など）
- JSON コンポジションから MIDI を生成
- バリデーションレポートの出力

## インストール
```bash
npm install
```

## ビルド
```bash
npm run build
```

## 起動（stdio MCP サーバー）
```bash
node dist/index.js
```

## クイックスタート
1. サーバーを起動: `node dist/index.js`
2. MCP クライアントから `open_midi`, `get_tracks`, `insert_notes`, `commit` などを呼び出す

## ツール概要
このサーバーは、メモリ上の MIDI セッションに対して MCP ツールを公開します。典型的な流れ:
1. `open_midi` → `midiId` を取得
2. `get_tracks` → `trackId` を選択
3. `insert_notes`, `insert_events`, `quantize` などで編集
4. `commit` または `save_as`

## insert_notes
Signature (TypeScript-ish):
```ts
insert_notes({
  midiId: string,
  trackId: number,
  notes?: Array<{
    midi?: number,
    noteNumber?: number,
    ticks?: number,
    time?: number,
    durationTicks?: number,
    duration?: number,
    durationSeconds?: number,
    velocity?: number
  }>,
  notes_file?: string
})
```

Rules:
- `notes` または `notes_file` のどちらか必須（両方指定も可）
- `midi` と `noteNumber` はどちらか一方のみ
- `ticks` か `time` のどちらか必須
- `durationTicks` / `duration` / `durationSeconds` のいずれか必須

Notes on time fields:
- `ticks` / `durationTicks` を推奨（明確・安全）
- `time` / `durationSeconds` は秒指定として処理
- `duration` は `time` がある場合や小数の場合は秒として解釈

Large payloads:
- 大量ノートは `notes_file` を推奨（MCP のメッセージサイズ制限回避）
- `notes_file` はプロジェクトルートからの相対パス

Small examples:
```json
{"midiId":"midi_123","trackId":0,"notes":[{"noteNumber":60,"ticks":0,"durationTicks":240}]}
```
```json
{"midiId":"midi_123","trackId":0,"notes_file":"jingles/bass_30s.json"}
```

## insert_events
Signature (TypeScript-ish):
```ts
insert_events({
  midiId: string,
  trackId: number,
  events?: Array<
    | { type: "note", midi?: number, noteNumber?: number, ticks: number, durationTicks?: number, duration?: number, velocity?: number }
    | { type: "cc", number: number, value: number, ticks: number }
    | { type: "pitchbend", value: number, ticks: number }
  >,
  notes?: Array<{ midi?: number, noteNumber?: number, ticks: number, durationTicks?: number, duration?: number, velocity?: number }>,
  cc?: Array<{ number: number, value: number, ticks: number }>,
  pitchbends?: Array<{ value: number, ticks: number }>,
})
```

Rules:
- `events`, `notes`, `cc`, `pitchbends` のいずれかは必須
- `events` とショートカット配列は併用可能（マージされます）

Small examples:
```json
{"midiId":"midi_123","trackId":0,"events":[{"type":"note","noteNumber":60,"ticks":0,"duration":240}]}
```
```json
{"midiId":"midi_123","trackId":0,"notes":[{"midi":60,"ticks":0,"durationTicks":240}],"cc":[{"number":64,"value":1,"ticks":0}]}
```

## 使用ライブラリ
- @modelcontextprotocol/sdk (MCP server/transport)
- @tonejs/midi (MIDI read/write + manipulation)
- zod (input validation)

## 注意事項
- パスは登録されたプロジェクトルートからの相対パスとして解決されます。
- `open_midi`, `get_tracks`, `quantize` などのツールを提供します。

## ライセンスと利用上の注意
- このリポジトリにはライセンスファイルは同梱していません（明示的な許諾がないため、実質的に All rights reserved 相当の扱いになります）。
- もし公開・紹介する場合は、作者へのリンクを貼っていただけると嬉しいです: `https://x.com/OrotiYamatano`
- 依存ライブラリにはそれぞれのライセンスが適用されます。配布・公開時は各ライブラリのライセンス条項を確認してください。
- MIDI ファイルや音源、楽曲の権利は別途管理されます。第三者のコンテンツを扱う場合は、権利と利用許諾に注意してください。

## Samples
- Studio Oneで書き出したMP3: [orchestral_jingle_10s.mp3](sample/orchestral_jingle_10s.mp3)
  <audio controls src="sample/orchestral_jingle_10s.mp3"></audio>
- 生成プロンプト: 「オーケストラのジングル10秒」
