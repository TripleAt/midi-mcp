import { promises as fs } from "fs";
import path from "path";
import midiPkg from "@tonejs/midi";
import type { Midi } from "@tonejs/midi";
import { MidiRepository } from "./midi-repo.js";
import {
  safeUpdateHeader,
  serialize,
  ok,
  requirePath,
  requireOne,
  inRange,
  matchFilter,
  getNoteChannel,
  getCcChannel,
  getPitchBendChannel,
  getControlChanges,
  normalizeCcValue,
  defaultTimeSignatures,
  getGmInstrumentName,
  gridToTicks,
  bbtToTicks,
  ticksToBbt,
  buildScale,
  constrainNote,
  collectIssues,
  filterNotes,
  filterCc,
  filterPitchBends,
} from "./midi-utils.js";
import type { TimelineChangeSchema } from "./tool-schemas.js";
import type { z } from "zod";

const { Midi: MidiCtor } = midiPkg as unknown as {
  Midi: typeof import("@tonejs/midi").Midi;
};

const addEventToTrack = (track: any, ev: any) => {
  if (ev.type === "note") {
    const midi = ev.midi ?? ev.noteNumber;
    const durationTicks = ev.durationTicks ?? ev.duration;
    track.addNote({
      midi,
      ticks: ev.ticks,
      durationTicks,
      velocity: ev.velocity ?? 0.8,
    });
    return;
  }
  if (ev.type === "cc") {
    track.addCC({
      number: ev.number,
      value: normalizeCcValue(ev.value),
      ticks: ev.ticks,
    });
    return;
  }
  track.addPitchBend({
    value: ev.value,
    ticks: ev.ticks,
  });
};

const toEventList = (
  getTrack: (midi: Midi, trackId: number) => any,
  midi: Midi,
  trackId: number,
  range?: { startTicks?: number; endTicks?: number },
  filter?: {
    types?: Array<"note" | "cc" | "pitchbend">;
    noteNumbers?: number[];
    ccNumbers?: number[];
    channels?: number[];
  }
) => {
  const track = getTrack(midi, trackId);
  const events: Array<any> = [];

  for (const note of track.notes) {
    if (!inRange(note.ticks, range)) continue;
    if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) continue;
    events.push({
      type: "note",
      midi: note.midi,
      ticks: note.ticks,
      durationTicks: note.durationTicks,
      velocity: note.velocity,
    });
  }

  for (const [ccNumber, list] of Object.entries(getControlChanges(track))) {
    const num = Number(ccNumber);
    for (const cc of list) {
      if (!inRange(cc.ticks, range)) continue;
      if (!matchFilter("cc", { number: num, channel: getCcChannel(cc, track) }, filter)) continue;
      events.push({
        type: "cc",
        number: num,
        value: cc.value,
        ticks: cc.ticks,
      });
    }
  }

  for (const pb of track.pitchBends) {
    if (!inRange(pb.ticks, range)) continue;
    if (!matchFilter("pitchbend", { channel: getPitchBendChannel(pb, track) }, filter)) continue;
    events.push({
      type: "pitchbend",
      value: pb.value,
      ticks: pb.ticks,
    });
  }

  events.sort((a, b) => a.ticks - b.ticks);
  return events;
};

export const createMidiHandlers = (repo: MidiRepository) => {
  const midiStore = repo.midiStore;
  const backupStore = repo.backupStore;
  const id = (prefix: string) => repo.id(prefix);
  const resolveProjectPath = (projectId: string, relativePath: string) =>
    repo.resolveProjectPath(projectId, relativePath);
  const reportsDir = (projectId: string) => repo.reportsDir(projectId);
  const getEntry = (midiId: string) => repo.getEntry(midiId);
  const getTrack = (midi: Midi, trackId: number) => repo.getTrack(midi, trackId);
  const markDirty = (entry: { midi: Midi; dirty: boolean }) =>
    repo.markDirty(entry as any);

  return {
    listProjects: async () => serialize([{ id: "default", path: process.cwd() }]),

    openMidi: async ({ projectId, relativePath }: { projectId: string; relativePath: string }) => {
      const absPath = resolveProjectPath(
        projectId,
        requirePath("relativePath", relativePath)
      );
      const bytes = new Uint8Array(await fs.readFile(absPath));
      const midi = new MidiCtor(bytes);
      const midiId = id("midi");
      midiStore.set(midiId, {
        id: midiId,
        projectId,
        path: absPath,
        midi,
        dirty: false,
      });
      return serialize({ midiId, path: absPath });
    },

    closeMidi: async ({ midiId }: { midiId: string }) => {
      midiStore.delete(midiId);
      return ok(`closed ${midiId}`);
    },

    saveAs: async ({ midiId, projectId, relativePath }: { midiId: string; projectId?: string; relativePath: string }) => {
      const entry = getEntry(midiId);
      const targetProjectId = projectId ?? entry.projectId;
      const absPath = resolveProjectPath(
        targetProjectId,
        requirePath("relativePath", relativePath)
      );
      await fs.writeFile(absPath, Buffer.from(entry.midi.toArray()));
      entry.projectId = targetProjectId;
      entry.path = absPath;
      entry.dirty = false;
      return serialize({ midiId, path: absPath });
    },

    commit: async ({ midiId }: { midiId: string }) => {
      const entry = getEntry(midiId);
      if (!entry.path) {
        throw new Error("No original path for this midiId");
      }
      if (!entry.dirty) {
        return ok("noop");
      }
      await fs.writeFile(entry.path, Buffer.from(entry.midi.toArray()));
      entry.dirty = false;
      return ok("ok");
    },

    backup: async ({ midiId }: { midiId: string }) => {
      const entry = getEntry(midiId);
      const backupId = id("backup");
      backupStore.set(backupId, {
        id: backupId,
        projectId: entry.projectId,
        path: entry.path,
        bytes: new Uint8Array(entry.midi.toArray()),
      });
      entry.lastBackupId = backupId;
      return serialize({ backupId });
    },

    restore: async ({ backupId }: { backupId: string }) => {
      const backup = backupStore.get(backupId);
      if (!backup) throw new Error(`backupId not found: ${backupId}`);
      const midi = new MidiCtor(backup.bytes);
      const midiId = id("midi");
      midiStore.set(midiId, {
        id: midiId,
        projectId: backup.projectId,
        path: backup.path,
        midi,
        dirty: false,
      });
      return serialize({ midiId });
    },

    revert: async ({ midiId }: { midiId: string }) => {
      const entry = getEntry(midiId);
      const backupId = entry.lastBackupId;
      if (!backupId) throw new Error("no backup for this midiId");
      const backup = backupStore.get(backupId);
      if (!backup) throw new Error(`backupId not found: ${backupId}`);
      entry.midi = new MidiCtor(backup.bytes);
      safeUpdateHeader(entry.midi);
      entry.dirty = false;
      return ok("ok");
    },

    getTimeline: async ({ midiId }: { midiId: string }) => {
      const entry = getEntry(midiId);
      const header = entry.midi.header;
      return serialize({
        ppq: header.ppq,
        tempos: header.tempos,
        timeSignatures:
          header.timeSignatures.length > 0
            ? header.timeSignatures
            : defaultTimeSignatures(),
      });
    },

    toTicks: async ({ midiId, bbt, quarterNotes, seconds }: { midiId: string; bbt?: any; quarterNotes?: number; seconds?: number }) => {
      const entry = getEntry(midiId);
      const [kind, value] = requireOne([
        ["bbt", bbt],
        ["quarterNotes", quarterNotes],
        ["seconds", seconds],
      ]);
      if (kind === "bbt") {
        return serialize({ ticks: bbtToTicks(entry.midi, value as any) });
      }
      if (kind === "quarterNotes") {
        const ticks = Math.round((value as number) * entry.midi.header.ppq);
        return serialize({ ticks });
      }
      const ticks = Math.round(entry.midi.header.secondsToTicks(value as number));
      return serialize({ ticks });
    },

    toBbt: async ({ midiId, ticks }: { midiId: string; ticks: number }) => {
      const entry = getEntry(midiId);
      return serialize(ticksToBbt(entry.midi, ticks));
    },

    getTracks: async ({ midiId }: { midiId: string }) => {
      const entry = getEntry(midiId);
      const tracks = entry.midi.tracks.map((t: any, index: number) => ({
        trackId: index,
        name: t.name,
        channel: t.channel,
        instrument: t.instrument ? t.instrument.number : undefined,
        instrumentName: getGmInstrumentName(t.instrument ? t.instrument.number : undefined),
        noteCount: t.notes.length,
      }));
      return serialize(tracks);
    },

    addTrack: async ({ midiId, name, channel, instrument }: { midiId: string; name?: string; channel?: number; instrument?: number }) => {
      const entry = getEntry(midiId);
      const track = entry.midi.addTrack();
      if (name) track.name = name;
      if (channel !== undefined) track.channel = channel;
      if (instrument !== undefined && track.instrument) {
        track.instrument.number = instrument;
      }
      markDirty(entry);
      return serialize({ trackId: entry.midi.tracks.length - 1 });
    },

    removeTrack: async ({ midiId, trackId }: { midiId: string; trackId: number }) => {
      const entry = getEntry(midiId);
      if (!entry.midi.tracks[trackId]) throw new Error(`trackId not found: ${trackId}`);
      entry.midi.tracks.splice(trackId, 1);
      markDirty(entry);
      return ok(`removed track ${trackId}`);
    },

    setTrackProps: async ({ midiId, trackId, name, channel, instrument }: { midiId: string; trackId: number; name?: string; channel?: number; instrument?: number }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      if (name !== undefined) track.name = name;
      if (channel !== undefined) track.channel = channel;
      if (instrument !== undefined && track.instrument) {
        track.instrument.number = instrument;
      }
      markDirty(entry);
      return ok("ok");
    },

    getEvents: async ({
      midiId,
      trackId,
      range,
      filter,
      offset,
      limit,
    }: {
      midiId: string;
      trackId: number;
      range?: any;
      filter?: any;
      offset?: number;
      limit?: number;
    }) => {
      const entry = getEntry(midiId);
      const events = toEventList(getTrack, entry.midi, trackId, range, filter);
      const start = offset ?? 0;
      const pageSize = limit ?? 512;
      const end = start + pageSize;
      return serialize({
        total: events.length,
        nextOffset: end < events.length ? end : null,
        events: events.slice(start, end),
      });
    },

    getAllEvents: async ({
      midiId,
      trackId,
      range,
      filter,
    }: {
      midiId: string;
      trackId: number;
      range?: any;
      filter?: any;
    }) => {
      const entry = getEntry(midiId);
      const events = toEventList(getTrack, entry.midi, trackId, range, filter);
      return serialize({
        total: events.length,
        nextOffset: null,
        events,
      });
    },

    insertEvents: async ({
      midiId,
      trackId,
      events,
      notes,
      cc,
      pitchbends,
    }: {
      midiId: string;
      trackId: number;
      events?: any[];
      notes?: any[];
      cc?: any[];
      pitchbends?: any[];
    }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      const normalized: any[] = [];
      if (events) normalized.push(...events);
      if (notes) normalized.push(...notes.map((n) => ({ type: "note", ...n })));
      if (cc) normalized.push(...cc.map((c) => ({ type: "cc", ...c })));
      if (pitchbends) normalized.push(...pitchbends.map((p) => ({ type: "pitchbend", ...p })));
      if (normalized.length === 0) {
        throw new Error(
          "insert_events requires at least one of: events, notes, cc, pitchbends"
        );
      }
      for (const ev of normalized) {
        addEventToTrack(track, ev);
      }
      markDirty(entry);
      return ok("ok");
    },

    insertNotes: async ({
      midiId,
      trackId,
      notes,
    }: {
      midiId: string;
      trackId: number;
      notes: any[];
    }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      for (const note of notes) {
        addEventToTrack(track, { type: "note", ...note });
      }
      markDirty(entry);
      return ok("ok");
    },

    insertControllers: async ({
      midiId,
      trackId,
      events,
    }: {
      midiId: string;
      trackId: number;
      events: Array<{ type: "cc" | "pitchbend" }>;
    }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      for (const ev of events) {
        addEventToTrack(track, ev);
      }
      markDirty(entry);
      return ok("ok");
    },

    removeEvents: async ({ midiId, trackId, range, filter }: { midiId: string; trackId: number; range?: any; filter?: any }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      filterNotes(track, range, filter);
      filterCc(track, range, filter);
      filterPitchBends(track, range, filter);
      markDirty(entry);
      return ok("ok");
    },

    removeNotes: async ({ midiId, trackId, range, filter }: { midiId: string; trackId: number; range?: any; filter?: any }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      filterNotes(track, range, filter);
      markDirty(entry);
      return ok("ok");
    },

    copyEvents: async ({ midiId, srcTrackId, dstTrackId, range, filter, deltaTicks }: { midiId: string; srcTrackId: number; dstTrackId: number; range?: any; filter?: any; deltaTicks: number }) => {
      const entry = getEntry(midiId);
      const events = toEventList(getTrack, entry.midi, srcTrackId, range, filter);
      const track = getTrack(entry.midi, dstTrackId);
      for (const ev of events) {
        const shifted = { ...ev, ticks: Math.max(0, ev.ticks + deltaTicks) };
        addEventToTrack(track, shifted);
      }
      markDirty(entry);
      return ok("ok");
    },

    quantize: async ({ midiId, trackId, range, filter, grid, strength, swing }: { midiId: string; trackId: number; range?: any; filter?: any; grid: string | number; strength?: number; swing?: number }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      const ppq = entry.midi.header.ppq;
      const gridTicks = gridToTicks(grid, ppq);
      const str = strength ?? 1;
      const sw = swing ?? 0;

      for (const note of track.notes) {
        if (!inRange(note.ticks, range)) continue;
        if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) continue;
        const gridIndex = Math.round(note.ticks / gridTicks);
        let target = gridIndex * gridTicks;
        if (sw !== 0 && gridIndex % 2 === 1) {
          target += Math.round((gridTicks / 2) * sw);
        }
        note.ticks = Math.max(0, Math.round(note.ticks + (target - note.ticks) * str));
      }
      markDirty(entry);
      return ok("ok");
    },

    humanize: async ({ midiId, trackId, range, filter, timingMs, velocity }: { midiId: string; trackId: number; range?: any; filter?: any; timingMs?: number; velocity?: number }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      const timingSeconds = timingMs ? timingMs / 1000 : 0;

      for (const note of track.notes) {
        if (!inRange(note.ticks, range)) continue;
        if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) continue;
        if (timingSeconds) {
          const deltaSeconds = (Math.random() * 2 - 1) * timingSeconds;
          const baseSeconds = entry.midi.header.ticksToSeconds(note.ticks);
          const targetTicks = entry.midi.header.secondsToTicks(baseSeconds + deltaSeconds);
          note.ticks = Math.max(0, Math.round(targetTicks));
        }
        if (velocity !== undefined) {
          const delta = (Math.random() * 2 - 1) * velocity;
          note.velocity = Math.min(1, Math.max(0, note.velocity + delta));
        }
      }
      markDirty(entry);
      return ok("ok");
    },

    transpose: async ({ midiId, trackId, range, filter, semitones }: { midiId: string; trackId: number; range?: any; filter?: any; semitones: number }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      for (const note of track.notes) {
        if (!inRange(note.ticks, range)) continue;
        if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) continue;
        note.midi = Math.min(127, Math.max(0, note.midi + semitones));
      }
      markDirty(entry);
      return ok("ok");
    },

    constrainToScale: async ({ midiId, trackId, range, filter, key, scale, strategy }: { midiId: string; trackId: number; range?: any; filter?: any; key: string; scale: string; strategy: "nearest" | "up" | "down" }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      const allowed = buildScale(key, scale);
      for (const note of track.notes) {
        if (!inRange(note.ticks, range)) continue;
        if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) continue;
        note.midi = Math.min(127, Math.max(0, constrainNote(note.midi, allowed, strategy)));
      }
      markDirty(entry);
      return ok("ok");
    },

    fixOverlaps: async ({ midiId, trackId, range, filter, mode }: { midiId: string; trackId: number; range?: any; filter?: any; mode: "trim" | "remove" }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      const byPitch = new Map<string, any[]>();

      for (const note of track.notes) {
        if (!inRange(note.ticks, range)) continue;
        if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) continue;
        const key = `${note.midi}:${getNoteChannel(note, track)}`;
        if (!byPitch.has(key)) byPitch.set(key, []);
        byPitch.get(key)!.push(note);
      }

      for (const list of byPitch.values()) {
        list.sort((a, b) => a.ticks - b.ticks);
        for (let i = 0; i < list.length - 1; i++) {
          const current = list[i];
          const next = list[i + 1];
          const end = current.ticks + current.durationTicks;
          if (end > next.ticks) {
            if (mode === "trim") {
              current.durationTicks = Math.max(1, next.ticks - current.ticks);
            } else {
              track.notes = track.notes.filter((n: any) => n !== next);
            }
          }
        }
      }
      markDirty(entry);
      return ok("ok");
    },

    legato: async ({ midiId, trackId, range, filter, gapTicks }: { midiId: string; trackId: number; range?: any; filter?: any; gapTicks?: number }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      const gap = gapTicks ?? 0;
      const notes = track.notes
        .filter((n: any) => inRange(n.ticks, range))
        .filter((n: any) => matchFilter("note", { midi: n.midi, channel: getNoteChannel(n, track) }, filter))
        .sort((a: any, b: any) => a.ticks - b.ticks);
      for (let i = 0; i < notes.length - 1; i++) {
        const current = notes[i];
        const next = notes[i + 1];
        current.durationTicks = Math.max(1, next.ticks - current.ticks - gap);
      }
      markDirty(entry);
      return ok("ok");
    },

    trimNotes: async ({ midiId, trackId, range, filter, minDuration }: { midiId: string; trackId: number; range?: any; filter?: any; minDuration?: number }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      const minDur = minDuration ?? 1;
      track.notes = track.notes.filter((note: any) => {
        if (!inRange(note.ticks, range)) return true;
        if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) return true;
        return note.durationTicks >= minDur;
      });
      markDirty(entry);
      return ok("ok");
    },

    removeControllers: async ({ midiId, trackId, range, filter }: { midiId: string; trackId: number; range?: any; filter?: any }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      filterCc(track, range, filter);
      filterPitchBends(track, range, filter);
      markDirty(entry);
      return ok("ok");
    },

    setTimeline: async ({
      midiId,
      changes,
    }: {
      midiId: string;
      changes: Array<z.infer<typeof TimelineChangeSchema>>;
    }) => {
      const entry = getEntry(midiId);
      const tempos: Array<{ ticks: number; bpm: number }> = [];
      const timeSignatures: Array<{ ticks: number; timeSignature: [number, number] }> = [];
      for (const change of changes) {
        if (change.type === "tempo") {
          tempos.push({ ticks: change.ticks, bpm: change.bpm });
        } else {
          timeSignatures.push({
            ticks: change.ticks,
            timeSignature: [change.numerator, change.denominator],
          });
        }
      }
      if (tempos.length > 0) {
        entry.midi.header.tempos = tempos.sort((a, b) => a.ticks - b.ticks);
      }
      if (timeSignatures.length > 0) {
        entry.midi.header.timeSignatures = timeSignatures.sort(
          (a, b) => a.ticks - b.ticks
        );
      }
      if (entry.midi.header.timeSignatures.length === 0) {
        entry.midi.header.timeSignatures = defaultTimeSignatures();
      }
      safeUpdateHeader(entry.midi);
      markDirty(entry);
      return ok("ok");
    },

    validate: async ({ midiId }: { midiId: string }) => {
      const entry = getEntry(midiId);
      return serialize(collectIssues(entry.midi));
    },

    diff: async ({ midiIdA, midiIdB, range }: { midiIdA: string; midiIdB: string; range?: any }) => {
      const a = getEntry(midiIdA);
      const b = getEntry(midiIdB);
      const countNotes = (midi: Midi) =>
        midi.tracks.reduce((sum: number, _t: any, i: number) => {
          return sum + toEventList(getTrack, midi, i, range).filter((e) => e.type === "note").length;
        }, 0);
      const summary = {
        tracksA: a.midi.tracks.length,
        tracksB: b.midi.tracks.length,
        notesA: countNotes(a.midi),
        notesB: countNotes(b.midi),
      };
      return serialize(summary);
    },

    exportReport: async ({ midiId, format }: { midiId: string; format: "json" | "txt" }) => {
      const entry = getEntry(midiId);
      const issues = collectIssues(entry.midi);
      const dir = reportsDir(entry.projectId);
      await fs.mkdir(dir, { recursive: true });
      const outPath = path.join(dir, `midi-report-${midiId}.${format}`);
      const text = format === "json" ? JSON.stringify(issues) : JSON.stringify(issues, null, 2);
      await fs.writeFile(outPath, text);
      return serialize({ filePath: outPath });
    },

    createMidi: async ({ projectId, composition, composition_file, outputPath }: { projectId: string; composition?: any; composition_file?: string; outputPath: string }) => {
      if (composition && composition_file) {
        throw new Error("Provide either composition or composition_file, not both");
      }
      requirePath("outputPath", outputPath);
      let data = composition;
      if (composition_file) {
        const absPath = resolveProjectPath(
          projectId,
          requirePath("composition_file", composition_file)
        );
        data = JSON.parse(await fs.readFile(absPath, "utf8"));
      }
      if (!data) throw new Error("composition or composition_file required");
      const midi = new MidiCtor();
      if (data.ppq) (midi.header as any).ppq = data.ppq;
      if (data.tempos) midi.header.tempos = data.tempos;
      if (data.timeSignatures) {
        midi.header.timeSignatures = data.timeSignatures.map((ts: any) => ({
          ticks: ts.ticks,
          timeSignature: [ts.numerator, ts.denominator],
        }));
      }
      if (!data.timeSignatures || data.timeSignatures.length === 0) {
        midi.header.timeSignatures = defaultTimeSignatures();
      }
      if (!data.tracks || data.tracks.length === 0) {
        safeUpdateHeader(midi);
        const absOut = resolveProjectPath(projectId, outputPath);
        await fs.writeFile(absOut, Buffer.from(midi.toArray()));
        return serialize({ filePath: absOut });
      }
      for (const trackDef of data.tracks) {
        const track = midi.addTrack();
        if (trackDef.name) track.name = trackDef.name;
        if (trackDef.channel !== undefined) track.channel = trackDef.channel;
        if (trackDef.instrument !== undefined && track.instrument) {
          track.instrument.number = trackDef.instrument;
        }
        if (!trackDef.events || trackDef.events.length === 0) {
          continue;
        }
        for (const ev of trackDef.events) {
          addEventToTrack(track, ev);
        }
      }
      safeUpdateHeader(midi);
      const absOut = resolveProjectPath(projectId, outputPath);
      await fs.mkdir(path.dirname(absOut), { recursive: true });
      await fs.writeFile(absOut, Buffer.from(midi.toArray()));
      return serialize({ filePath: absOut });
    },
  };
};
