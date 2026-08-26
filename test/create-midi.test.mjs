import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import midiPkg from "@tonejs/midi";
import { createMidiHandlers } from "../dist/midi-handlers.js";
import { MidiRepository } from "../dist/midi-repo.js";

const { Midi } = midiPkg;

test("create_midi writes the requested PPQ", async () => {
  const relativePath = `tmp/create-midi-ppq-${process.pid}-${Date.now()}.mid`;
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const handlers = createMidiHandlers(new MidiRepository());

  try {
    const response = await handlers.createMidi({
      projectId: "default",
      outputPath: relativePath,
      composition: {
        ppq: 960,
        tempos: [{ ticks: 0, bpm: 120 }],
        timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
        tracks: [
          {
            name: "PPQ test",
            events: [
              {
                type: "note",
                noteNumber: 60,
                ticks: 0,
                durationTicks: 240,
                velocity: 0.8,
              },
            ],
          },
        ],
      },
    });

    const result = JSON.parse(response.content[0].text);
    assert.equal(result.filePath, absolutePath);

    const roundTripped = new Midi(await fs.readFile(absolutePath));
    assert.equal(roundTripped.header.ppq, 960);
    assert.equal(roundTripped.tracks.length, 1);
    assert.equal(roundTripped.tracks[0].notes[0].midi, 60);
  } finally {
    await fs.rm(absolutePath, { force: true });
  }
});
