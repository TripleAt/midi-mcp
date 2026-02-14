import midiPkg from "@tonejs/midi";

const { Midi } = midiPkg;
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const outDir = path.resolve("jingles");
mkdirSync(outDir, { recursive: true });

const midi = new Midi();

midi.header.tempos = [{ ticks: 0, bpm: 120 }];
midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];

const melody = midi.addTrack();
melody.name = "Melody";
melody.channel = 0;
if (melody.instrument) melody.instrument.number = 0;

const bass = midi.addTrack();
bass.name = "Bass";
bass.channel = 1;
if (bass.instrument) bass.instrument.number = 32;

const ppq = midi.header.ppq;
const q = ppq;
const e = Math.round(ppq / 2);

const melodyNotes = [72, 76, 79, 84, 83, 79, 76, 72, 74, 77, 81, 86, 84, 81, 77, 74];
let ticks = 0;
for (const midiNote of melodyNotes) {
  melody.addNote({ midi: midiNote, ticks, durationTicks: e, velocity: 0.9 });
  ticks += e;
}

const chordTicks = q * 8;
const chordDuration = q * 2;
for (const midiNote of [72, 76, 79]) {
  melody.addNote({ midi: midiNote, ticks: chordTicks, durationTicks: chordDuration, velocity: 0.9 });
}

bass.addNote({ midi: 36, ticks: 0, durationTicks: q * 4, velocity: 0.8 });
bass.addNote({ midi: 43, ticks: q * 4, durationTicks: q * 4, velocity: 0.8 });
bass.addNote({ midi: 36, ticks: q * 8, durationTicks: q * 2, velocity: 0.8 });

const outPath = path.join(outDir, "jingle-5s.mid");
writeFileSync(outPath, Buffer.from(midi.toArray()));

console.log(`Wrote ${outPath}`);
