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
