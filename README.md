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

## Libraries used
- @modelcontextprotocol/sdk (MCP server/transport)
- @tonejs/midi (MIDI read/write + manipulation)
- zod (input validation)

## Notes
- Paths are resolved relative to the registered project root.
- The server exposes tools such as `open_midi`, `get_tracks`, `quantize`, and more.

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
