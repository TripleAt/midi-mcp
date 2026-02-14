# MIDI MCP Server

jp: https://github.com/TripleAt/midi-mcp/blob/master/README_JP.md

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
- Provide either `notes` or `notes_file` (both allowed)
- Use either `midi` or `noteNumber` (not both)
- Provide either `ticks` or `time`
- Provide one of `durationTicks`, `duration`, or `durationSeconds`

Notes on time fields:
- Prefer `ticks` / `durationTicks` (clear and safe)
- `time` / `durationSeconds` are interpreted as seconds
- `duration` is interpreted as seconds when `time` is present or when it's a float

Large payloads:
- For large note sets, prefer `notes_file` (avoid MCP message size limits)
- `notes_file` is a path relative to the project root

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
- This repository does not include a license file (without explicit permission, it should be treated as effectively All rights reserved).
- If you publish or share this, please include a link to the author: `https://x.com/OrotiYamatano`
- Each dependency is governed by its own license; check those terms when redistributing or publishing.
- Rights to MIDI files, audio sources, and musical works are managed separately. Be mindful of rights and permissions when using third‑party content.

## Samples
- MP3 exported from Studio One: [orchestral_jingle_10s.mp3](sample/orchestral_jingle_10s.mp3)
- Generated prompt: 「オーケストラのジングル10秒」

<audio controls src="sample/orchestral_jingle_10s.mp3"></audio>

