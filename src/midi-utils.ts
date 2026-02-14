import type { Midi } from "@tonejs/midi";

export const safeUpdateHeader = (midi: Midi) => {
  // Tonejs/midi recalculates some derived fields on update() if present.
  const anyHeader = midi.header as unknown as { update?: () => void };
  if (typeof anyHeader.update === "function") {
    anyHeader.update();
  }
};

export const serialize = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
});

export const ok = (text: string) => ({
  content: [{ type: "text", text }],
});

export const withErrorHandling =
  <T extends Record<string, any>>(handler: (args: T) => Promise<any> | any) =>
  async (args: T) => {
    try {
      return await handler(args);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${msg}` }],
      };
    }
  };

export const requirePath = (label: string, value: string) => {
  if (!value || value.trim() === "") {
    throw new Error(`${label} is required`);
  }
  return value;
};

export const requireOne = (items: Array<[string, unknown]>) => {
  const provided = items.filter(([, value]) => value !== undefined);
  if (provided.length !== 1) {
    throw new Error(
      `Provide exactly one of: ${items.map(([name]) => name).join(", ")}`
    );
  }
  return provided[0];
};

export const inRange = (
  ticks: number,
  range?: { startTicks?: number; endTicks?: number }
) => {
  if (!range) return true;
  if (range.startTicks !== undefined && ticks < range.startTicks) return false;
  return !(range.endTicks !== undefined && ticks >= range.endTicks);
};

export const matchFilter = (
  type: "note" | "cc" | "pitchbend",
  data: { midi?: number; number?: number; channel?: number },
  filter?: {
    types?: Array<"note" | "cc" | "pitchbend">;
    noteNumbers?: number[];
    ccNumbers?: number[];
    channels?: number[];
  }
) => {
  if (!filter) return true;
  if (filter.types && !filter.types.includes(type)) return false;
  if (type === "note" && filter.noteNumbers && data.midi !== undefined) {
    if (!filter.noteNumbers.includes(data.midi)) return false;
  }
  if (type === "cc" && filter.ccNumbers && data.number !== undefined) {
    if (!filter.ccNumbers.includes(data.number)) return false;
  }
  if (filter.channels && data.channel !== undefined) {
    if (!filter.channels.includes(data.channel)) return false;
  }
  return true;
};

export const getNoteChannel = (note: any, track: any) =>
  note.channel ?? track.channel ?? 0;

export const getCcChannel = (cc: any, track: any) =>
  cc.channel ?? track.channel ?? 0;

export const getPitchBendChannel = (pb: any, track: any) =>
  pb.channel ?? track.channel ?? 0;

export const getControlChanges = (track: any) =>
  track.controlChanges as Record<string, any[]>;

export const normalizeCcValue = (value: number) => {
  if (value <= 1) return value;
  return Math.min(1, Math.max(0, value / 127));
};

export const defaultTimeSignatures = () => [
  { ticks: 0, timeSignature: [4, 4] as [number, number] },
];

const GM_INSTRUMENT_NAMES = [
  "Acoustic Grand Piano",
  "Bright Acoustic Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano 1",
  "Electric Piano 2",
  "Harpsichord",
  "Clavinet",
  "Celesta",
  "Glockenspiel",
  "Music Box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bells",
  "Dulcimer",
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church Organ",
  "Reed Organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  "Acoustic Guitar (nylon)",
  "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)",
  "Electric Guitar (clean)",
  "Electric Guitar (muted)",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar Harmonics",
  "Acoustic Bass",
  "Electric Bass (finger)",
  "Electric Bass (pick)",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  "Violin",
  "Viola",
  "Cello",
  "Contrabass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  "String Ensemble 1",
  "String Ensemble 2",
  "SynthStrings 1",
  "SynthStrings 2",
  "Choir Aahs",
  "Voice Oohs",
  "Synth Voice",
  "Orchestra Hit",
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French Horn",
  "Brass Section",
  "SynthBrass 1",
  "SynthBrass 2",
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  "Lead 1 (square)",
  "Lead 2 (sawtooth)",
  "Lead 3 (calliope)",
  "Lead 4 (chiff)",
  "Lead 5 (charang)",
  "Lead 6 (voice)",
  "Lead 7 (fifths)",
  "Lead 8 (bass + lead)",
  "Pad 1 (new age)",
  "Pad 2 (warm)",
  "Pad 3 (polysynth)",
  "Pad 4 (choir)",
  "Pad 5 (bowed)",
  "Pad 6 (metallic)",
  "Pad 7 (halo)",
  "Pad 8 (sweep)",
  "FX 1 (rain)",
  "FX 2 (soundtrack)",
  "FX 3 (crystal)",
  "FX 4 (atmosphere)",
  "FX 5 (brightness)",
  "FX 6 (goblins)",
  "FX 7 (echoes)",
  "FX 8 (sci-fi)",
  "Sitar",
  "Banjo",
  "Shamisen",
  "Koto",
  "Kalimba",
  "Bag pipe",
  "Fiddle",
  "Shanai",
  "Tinkle Bell",
  "Agogo",
  "Steel Drums",
  "Woodblock",
  "Taiko Drum",
  "Melodic Tom",
  "Synth Drum",
  "Reverse Cymbal",
  "Guitar Fret Noise",
  "Breath Noise",
  "Seashore",
  "Bird Tweet",
  "Telephone Ring",
  "Helicopter",
  "Applause",
  "Gunshot",
];

export const getGmInstrumentName = (program: number | undefined) => {
  if (program === undefined || program < 0 || program >= GM_INSTRUMENT_NAMES.length) {
    return undefined;
  }
  return GM_INSTRUMENT_NAMES[program];
};

export const gridToTicks = (grid: string | number, ppq: number) => {
  if (typeof grid === "number") return grid;
  const match = grid.match(/^1\/(\d+)$/);
  if (match) {
    const denom = Number(match[1]);
    if (denom > 0) return Math.round((ppq * 4) / denom);
  }
  throw new Error(`Unsupported grid: ${grid}`);
};

export const bbtToTicks = (
  midi: Midi,
  bbt: { bar: number; beat: number; tick: number }
) => {
  const ppq = midi.header.ppq;
  const timeSigs =
    midi.header.timeSignatures.length > 0
      ? [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
      : [{ ticks: 0, timeSignature: [4, 4] as [number, number] }];

  let currentTicks = 0;
  let bar = 1;

  for (let i = 0; i < timeSigs.length; i++) {
    const ts = timeSigs[i];
    const [num, denom] = ts.timeSignature;
    const ticksPerBeat = Math.round((ppq * 4) / denom);
    const ticksPerBar = ticksPerBeat * num;
    const nextTicks = i + 1 < timeSigs.length ? timeSigs[i + 1].ticks : Infinity;

    while (currentTicks + ticksPerBar <= nextTicks) {
      if (bar === bbt.bar) {
        return currentTicks + (bbt.beat - 1) * ticksPerBeat + bbt.tick;
      }
      currentTicks += ticksPerBar;
      bar += 1;
    }

    if (bar === bbt.bar) {
      return currentTicks + (bbt.beat - 1) * ticksPerBeat + bbt.tick;
    }
  }

  const last = timeSigs[timeSigs.length - 1];
  const [num, denom] = last.timeSignature;
  const ticksPerBeat = Math.round((ppq * 4) / denom);
  const ticksPerBar = ticksPerBeat * num;
  const barsToAdvance = Math.max(0, bbt.bar - bar);
  const baseTicks = currentTicks + barsToAdvance * ticksPerBar;
  return baseTicks + (bbt.beat - 1) * ticksPerBeat + bbt.tick;
};

export const ticksToBbt = (midi: Midi, ticks: number) => {
  const ppq = midi.header.ppq;
  const timeSigs =
    midi.header.timeSignatures.length > 0
      ? [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
      : [{ ticks: 0, timeSignature: [4, 4] }];

  let currentTicks = 0;
  let bar = 1;

  for (let i = 0; i < timeSigs.length; i++) {
    const ts = timeSigs[i];
    const [num, denom] = ts.timeSignature;
    const ticksPerBeat = Math.round((ppq * 4) / denom);
    const ticksPerBar = ticksPerBeat * num;
    const nextTicks = i + 1 < timeSigs.length ? timeSigs[i + 1].ticks : Infinity;

    while (currentTicks + ticksPerBar <= nextTicks) {
      if (ticks < currentTicks + ticksPerBar) {
        const offset = ticks - currentTicks;
        const beat = Math.floor(offset / ticksPerBeat) + 1;
        const tick = Math.floor(offset % ticksPerBeat);
        return { bar, beat, tick };
      }
      currentTicks += ticksPerBar;
      bar += 1;
    }
    if (ticks < nextTicks) {
      const offset = ticks - currentTicks;
      const beat = Math.floor(offset / ticksPerBeat) + 1;
      const tick = Math.floor(offset % ticksPerBeat);
      return { bar, beat, tick };
    }
  }

  return { bar, beat: 1, tick: 0 };
};

export const buildScale = (key: string, scale: string) => {
  const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const keyIndex = keys.indexOf(key.toUpperCase());
  if (keyIndex < 0) throw new Error(`Unknown key: ${key}`);
  const scales: Record<string, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  };
  const intervals = scales[scale];
  if (!intervals) throw new Error(`Unknown scale: ${scale}`);
  return new Set(intervals.map((i) => (i + keyIndex) % 12));
};

export const constrainNote = (midi: number, allowed: Set<number>, strategy: string) => {
  if (allowed.has(midi % 12)) return midi;
  const up = () => {
    for (let i = 1; i < 12; i++) {
      const candidate = midi + i;
      if (allowed.has(candidate % 12)) return candidate;
    }
    return midi;
  };
  const down = () => {
    for (let i = 1; i < 12; i++) {
      const candidate = midi - i;
      if (allowed.has((candidate + 1200) % 12)) return candidate;
    }
    return midi;
  };
  if (strategy === "up") return up();
  if (strategy === "down") return down();
  const upNote = up();
  const downNote = down();
  return Math.abs(upNote - midi) < Math.abs(midi - downNote) ? upNote : downNote;
};

export const collectIssues = (midi: Midi) => {
  const issues: Array<{ type: string; message: string }> = [];
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      if (note.ticks < 0) issues.push({ type: "note", message: "negative ticks" });
      if (note.durationTicks <= 0) issues.push({ type: "note", message: "non-positive duration" });
      if (note.midi < 0 || note.midi > 127) issues.push({ type: "note", message: "midi out of range" });
    }
    for (const [ccNumber, list] of Object.entries(getControlChanges(track))) {
      const num = Number(ccNumber);
      if (num < 0 || num > 127) issues.push({ type: "cc", message: "cc out of range" });
      for (const cc of list as any[]) {
        if (cc.ticks < 0) issues.push({ type: "cc", message: "negative ticks" });
        if (cc.value < 0 || cc.value > 1) issues.push({ type: "cc", message: "cc value out of range" });
      }
    }
    for (const pb of track.pitchBends) {
      if (pb.ticks < 0) issues.push({ type: "pitchbend", message: "negative ticks" });
      if (pb.value < -1 || pb.value > 1) issues.push({ type: "pitchbend", message: "pitchbend out of range" });
    }
  }
  return issues;
};

export const filterNotes = (
  track: any,
  range?: { startTicks?: number; endTicks?: number },
  filter?: any
) => {
  track.notes = track.notes.filter((note: any) => {
    if (!inRange(note.ticks, range)) return true;
    return !matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter);
  });
};

export const filterCc = (
  track: any,
  range?: { startTicks?: number; endTicks?: number },
  filter?: any
) => {
  const next: Record<string, any[]> = {};
  for (const [ccNumber, list] of Object.entries(getControlChanges(track))) {
    const num = Number(ccNumber);
    next[ccNumber] = (list as any[]).filter((cc: any) => {
      if (!inRange(cc.ticks, range)) return true;
      return !matchFilter("cc", { number: num, channel: getCcChannel(cc, track) }, filter);
    });
    if (next[ccNumber].length === 0) {
      delete next[ccNumber];
    }
  }
  track.controlChanges = next;
};

export const filterPitchBends = (
  track: any,
  range?: { startTicks?: number; endTicks?: number },
  filter?: any
) => {
  track.pitchBends = track.pitchBends.filter((pb: any) => {
    if (!inRange(pb.ticks, range)) return true;
    return !matchFilter("pitchbend", { channel: getPitchBendChannel(pb, track) }, filter);
  });
};
