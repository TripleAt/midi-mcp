# MIDI MCP Server

MIDI file utilities exposed as an MCP (Model Context Protocol) server over stdio.

## What it does
- Open, edit, and save MIDI files by path
- Query tracks, events, tempo/time-signature maps
- Apply transformations (quantize, humanize, transpose, constrain to scale, etc.)
- Create MIDI files from a JSON composition
- Export validation reports

## Install
```bash
npm install
```

## Build
```bash
npm run build
```

## Run (stdio MCP server)
```bash
node dist/index.js
```

## Quick start
1. Start the server: `node dist/index.js`
2. Use an MCP client to call tools like `open_midi`, `get_tracks`, `insert_notes`, `commit`

## Tools overview
This server exposes MCP tools that operate on an in-memory MIDI session. Typical flow:
1. `open_midi` → get `midiId`
2. `get_tracks` → choose `trackId`
3. Edit with `insert_notes`, `insert_events`, `quantize`, etc.
4. `commit` or `save_as`

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
- 大量ノートは `notes_file` を推奨（MCPのメッセージサイズ制限回避）
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
- Provide at least one of: `events`, `notes`, `cc`, `pitchbends`
- You can mix `events` with the shortcut arrays; they are merged

Small examples:
```json
{"midiId":"midi_123","trackId":0,"events":[{"type":"note","noteNumber":60,"ticks":0,"duration":240}]}
```
```json
{"midiId":"midi_123","trackId":0,"notes":[{"midi":60,"ticks":0,"durationTicks":240}],"cc":[{"number":64,"value":1,"ticks":0}]}
```

## Libraries used
- @modelcontextprotocol/sdk (MCP server/transport)
- @tonejs/midi (MIDI read/write + manipulation)
- zod (input validation)

## Notes
- Paths are resolved relative to the registered project root.
- The server exposes tools such as `open_midi`, `get_tracks`, `quantize`, and more.

## License and usage notes
- このリポジトリにはライセンスファイルは同梱していません（明示的な許諾がないため、実質的に All rights reserved 相当の扱いになります）。
- もし公開・紹介する場合は、作者へのリンクを貼っていただけると嬉しいです: `https://x.com/OrotiYamatano`
- 依存ライブラリにはそれぞれのライセンスが適用されます。配布・公開時は各ライブラリのライセンス条項を確認してください。
- MIDIファイルや音源、楽曲の権利は別途管理されます。第三者のコンテンツを扱う場合は、権利と利用許諾に注意してください。

## Samples
- Studio Oneで書き出したMP3: [orchestral_jingle_10s.mp3](sample/orchestral_jingle_10s.mp3)
- 再生:
  <audio controls src="sample/orchestral_jingle_10s.mp3"></audio>
- 生成プロンプト: 「オーケストラのジングル10秒」
