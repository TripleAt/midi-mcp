import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import midiPkg from "@tonejs/midi";
import type { Midi } from "@tonejs/midi";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MidiRepository } from "./midi-repo.js";
import {
  safeUpdateHeader,
  serialize,
  ok,
  withErrorHandling,
  requirePath,
  requireOne,
  inRange,
  matchFilter,
  getNoteChannel,
  getCcChannel,
  getPitchBendChannel,
  getControlChanges,
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

const { Midi: MidiCtor } = midiPkg as unknown as {
  Midi: typeof import("@tonejs/midi").Midi;
};

export const registerMidiTools = (server: McpServer, repo: MidiRepository) => {
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

  const RangeSchema = z
    .object({
      startTicks: z.number().optional(),
      endTicks: z.number().optional(),
    })
    .optional();

  const FilterSchema = z
    .object({
      types: z.array(z.enum(["note", "cc", "pitchbend"])).optional(),
      noteNumbers: z.array(z.number().int().min(0).max(127)).optional(),
      ccNumbers: z.array(z.number().int().min(0).max(127)).optional(),
      channels: z.array(z.number().int().min(0).max(15)).optional(),
    })
    .optional();

  const NoteEventSchema = z.object({
    type: z.literal("note"),
    midi: z.number().int().min(0).max(127),
    ticks: z.number().int().min(0),
    durationTicks: z.number().int().min(1),
    velocity: z.number().min(0).max(1).optional(),
  });

  const CcEventSchema = z.object({
    type: z.literal("cc"),
    number: z.number().int().min(0).max(127),
    value: z.number().min(0).max(1),
    ticks: z.number().int().min(0),
  });

  const PitchBendEventSchema = z.object({
    type: z.literal("pitchbend"),
    value: z.number().min(-1).max(1),
    ticks: z.number().int().min(0),
  });

  const EventSchema = z.discriminatedUnion("type", [
    NoteEventSchema,
    CcEventSchema,
    PitchBendEventSchema,
  ]);

  const addEventToTrack = (track: any, ev: z.infer<typeof EventSchema>) => {
    if (ev.type === "note") {
      track.addNote({
        midi: ev.midi,
        ticks: ev.ticks,
        durationTicks: ev.durationTicks,
        velocity: ev.velocity ?? 0.8,
      });
      return;
    }
    if (ev.type === "cc") {
      track.addCC({
        number: ev.number,
        value: ev.value,
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

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List available projects",
      inputSchema: z.object({}),
    },
    withErrorHandling(async () => {
      return serialize([{ id: "default", path: process.cwd() }]);
    })
  );

  server.registerTool(
    "open_midi",
    {
      title: "Open MIDI file",
      description: "Open MIDI by relative path",
      inputSchema: z.object({ projectId: z.string(), relativePath: z.string() }),
    },
    withErrorHandling(async ({ projectId, relativePath }) => {
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
    })
  );

  server.registerTool(
    "close_midi",
    {
      title: "Close MIDI file",
      description: "Close MIDI by midiId",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
      midiStore.delete(midiId);
      return ok(`closed ${midiId}`);
    })
  );

  server.registerTool(
    "save_as",
    {
      title: "Save MIDI to new path",
      description: "Save MIDI to a relative path",
      inputSchema: z.object({
        midiId: z.string(),
        projectId: z.string().optional(),
        relativePath: z.string(),
      }),
    },
    withErrorHandling(async ({ midiId, projectId, relativePath }) => {
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
    })
  );

  server.registerTool(
    "commit",
    {
      title: "Commit",
      description: "Save MIDI back to its original path",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
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
    })
  );

  server.registerTool(
    "backup",
    {
      title: "Backup MIDI",
      description: "Create backup and return backupId",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
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
    })
  );

  server.registerTool(
    "restore",
    {
      title: "Restore MIDI from backup",
      description: "Restore MIDI and return midiId",
      inputSchema: z.object({ backupId: z.string() }),
    },
    withErrorHandling(async ({ backupId }) => {
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
    })
  );

  server.registerTool(
    "revert",
    {
      title: "Revert",
      description: "Revert MIDI to the last backup",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
      const entry = getEntry(midiId);
      const backupId = entry.lastBackupId;
      if (!backupId) throw new Error("no backup for this midiId");
      const backup = backupStore.get(backupId);
      if (!backup) throw new Error(`backupId not found: ${backupId}`);
      entry.midi = new MidiCtor(backup.bytes);
      safeUpdateHeader(entry.midi);
      entry.dirty = false;
      return ok("ok");
    })
  );

  server.registerTool(
    "get_timeline",
    {
      title: "Get timeline",
      description: "Get ppq, tempos, and time signatures",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
      const entry = getEntry(midiId);
      const header = entry.midi.header;
      return serialize({
        ppq: header.ppq,
        tempos: header.tempos,
        timeSignatures: header.timeSignatures,
      });
    })
  );

  server.registerTool(
    "to_ticks",
    {
      title: "Convert time to ticks",
      description: "Convert bbt/beats/seconds to ticks",
      inputSchema: z.object({
        midiId: z.string(),
        bbt: z
          .object({ bar: z.number().int().min(1), beat: z.number().int().min(1), tick: z.number().int().min(0) })
          .optional(),
        quarterNotes: z.number().optional(),
        seconds: z.number().optional(),
      }),
    },
    withErrorHandling(async ({ midiId, bbt, quarterNotes, seconds }) => {
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
    })
  );

  server.registerTool(
    "to_bbt",
    {
      title: "Convert ticks to BBT",
      description: "Convert ticks to bar/beat/tick",
      inputSchema: z.object({ midiId: z.string(), ticks: z.number().int().min(0) }),
    },
    withErrorHandling(async ({ midiId, ticks }) => {
      const entry = getEntry(midiId);
      return serialize(ticksToBbt(entry.midi, ticks));
    })
  );

  server.registerTool(
    "get_tracks",
    {
      title: "Get tracks",
      description: "Get track list",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
      const entry = getEntry(midiId);
      const tracks = entry.midi.tracks.map((t: any, index: number) => ({
        trackId: index,
        name: t.name,
        channel: t.channel,
        instrument: t.instrument ? t.instrument.number : undefined,
        noteCount: t.notes.length,
      }));
      return serialize(tracks);
    })
  );

  server.registerTool(
    "add_track",
    {
      title: "Add track",
      description: "Add a track and return its id",
      inputSchema: z.object({
        midiId: z.string(),
        name: z.string().optional(),
        channel: z.number().int().min(0).max(15).optional(),
        instrument: z.number().int().min(0).max(127).optional(),
      }),
    },
    withErrorHandling(async ({ midiId, name, channel, instrument }) => {
      const entry = getEntry(midiId);
      const track = entry.midi.addTrack();
      if (name) track.name = name;
      if (channel !== undefined) track.channel = channel;
      if (instrument !== undefined && track.instrument) {
        track.instrument.number = instrument;
      }
      markDirty(entry);
      return serialize({ trackId: entry.midi.tracks.length - 1 });
    })
  );

  server.registerTool(
    "remove_track",
    {
      title: "Remove track",
      description: "Remove track by id",
      inputSchema: z.object({ midiId: z.string(), trackId: z.number().int().min(0) }),
    },
    withErrorHandling(async ({ midiId, trackId }) => {
      const entry = getEntry(midiId);
      if (!entry.midi.tracks[trackId]) throw new Error(`trackId not found: ${trackId}`);
      entry.midi.tracks.splice(trackId, 1);
      markDirty(entry);
      return ok(`removed track ${trackId}`);
    })
  );

  server.registerTool(
    "set_track_props",
    {
      title: "Set track properties",
      description: "Update track name/channel/instrument",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        name: z.string().optional(),
        channel: z.number().int().min(0).max(15).optional(),
        instrument: z.number().int().min(0).max(127).optional(),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, name, channel, instrument }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      if (name !== undefined) track.name = name;
      if (channel !== undefined) track.channel = channel;
      if (instrument !== undefined && track.instrument) {
        track.instrument.number = instrument;
      }
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "get_events",
    {
      title: "Get events",
      description: "Get events with range/filter/paging",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(5000).optional(),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, offset, limit }) => {
      const entry = getEntry(midiId);
      const events = toEventList(entry.midi, trackId, range, filter);
      const start = offset ?? 0;
      const pageSize = limit ?? 512;
      const end = start + pageSize;
      return serialize({
        total: events.length,
        nextOffset: end < events.length ? end : null,
        events: events.slice(start, end),
      });
    })
  );

  server.registerTool(
    "insert_events",
    {
      title: "Insert events",
      description: "Insert events into track",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        events: z.array(EventSchema),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, events }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      for (const ev of events) {
        addEventToTrack(track, ev);
      }
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "remove_events",
    {
      title: "Remove events",
      description: "Remove events matching range/filter",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      filterNotes(track, range, filter);
      filterCc(track, range, filter);
      filterPitchBends(track, range, filter);
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "copy_events",
    {
      title: "Copy events",
      description: "Copy events between tracks",
      inputSchema: z.object({
        midiId: z.string(),
        srcTrackId: z.number().int().min(0),
        dstTrackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        deltaTicks: z.number().int(),
      }),
    },
    withErrorHandling(
      async ({ midiId, srcTrackId, dstTrackId, range, filter, deltaTicks }) => {
        const entry = getEntry(midiId);
        const events = toEventList(entry.midi, srcTrackId, range, filter);
        const track = getTrack(entry.midi, dstTrackId);
        for (const ev of events) {
          const shifted = { ...ev, ticks: Math.max(0, ev.ticks + deltaTicks) };
          addEventToTrack(track, shifted);
        }
        markDirty(entry);
        return ok("ok");
      }
    )
  );

  server.registerTool(
    "quantize",
    {
      title: "Quantize",
      description: "Quantize note timing",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        grid: z.union([z.string(), z.number()]),
        strength: z.number().min(0).max(1).optional(),
        swing: z.number().min(0).max(1).optional(),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, grid, strength, swing }) => {
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
    })
  );

  server.registerTool(
    "humanize",
    {
      title: "Humanize",
      description: "Humanize note timing/velocity",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        timingMs: z.number().min(0).optional(),
        velocity: z.number().min(0).max(1).optional(),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, timingMs, velocity }) => {
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
    })
  );

  server.registerTool(
    "transpose",
    {
      title: "Transpose",
      description: "Transpose notes by semitones",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        semitones: z.number().int(),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, semitones }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      for (const note of track.notes) {
        if (!inRange(note.ticks, range)) continue;
        if (!matchFilter("note", { midi: note.midi, channel: getNoteChannel(note, track) }, filter)) continue;
        note.midi = Math.min(127, Math.max(0, note.midi + semitones));
      }
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "constrain_to_scale",
    {
      title: "Constrain to scale",
      description: "Constrain notes to a scale",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        key: z.string(),
        scale: z.string(),
        strategy: z.enum(["nearest", "up", "down"]).default("nearest"),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, key, scale, strategy }) => {
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
    })
  );

  server.registerTool(
    "fix_overlaps",
    {
      title: "Fix overlaps",
      description: "Fix overlapping notes",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        mode: z.enum(["trim", "remove"]).default("trim"),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, mode }) => {
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
    })
  );

  server.registerTool(
    "legato",
    {
      title: "Legato",
      description: "Make notes legato",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        gapTicks: z.number().int().min(0).optional(),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, gapTicks }) => {
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
    })
  );

  server.registerTool(
    "trim_notes",
    {
      title: "Trim notes",
      description: "Remove notes shorter than minDuration",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        minDuration: z.number().int().min(1).optional(),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter, minDuration }) => {
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
    })
  );

  server.registerTool(
    "insert_cc",
    {
      title: "Insert CC",
      description: "Insert control changes",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        events: z.array(CcEventSchema),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, events }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      for (const ev of events) {
        track.addCC({
          number: ev.number,
          value: ev.value,
          ticks: ev.ticks,
        });
      }
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "remove_cc",
    {
      title: "Remove CC",
      description: "Remove control changes",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range, filter }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      filterCc(track, range, filter);
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "insert_pitchbend",
    {
      title: "Insert pitch bend",
      description: "Insert pitch bends",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        events: z.array(PitchBendEventSchema),
      }),
    },
    withErrorHandling(async ({ midiId, trackId, events }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      for (const ev of events) {
        track.addPitchBend({
          value: ev.value,
          ticks: ev.ticks,
        });
      }
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "remove_pitchbend",
    {
      title: "Remove pitch bend",
      description: "Remove pitch bends",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
      }),
    },
    withErrorHandling(async ({ midiId, trackId, range }) => {
      const entry = getEntry(midiId);
      const track = getTrack(entry.midi, trackId);
      filterPitchBends(track, range, undefined);
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "get_tempo_map",
    {
      title: "Get tempo map",
      description: "Get tempo changes",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
      const entry = getEntry(midiId);
      return serialize(entry.midi.header.tempos);
    })
  );

  server.registerTool(
    "set_tempo_map",
    {
      title: "Set tempo map",
      description: "Set tempo changes",
      inputSchema: z.object({
        midiId: z.string(),
        changes: z.array(
          z.object({
            ticks: z.number().int().min(0),
            bpm: z.number().min(1),
          })
        ),
      }),
    },
    withErrorHandling(async ({ midiId, changes }) => {
      const entry = getEntry(midiId);
      entry.midi.header.tempos = [...changes].sort((a, b) => a.ticks - b.ticks);
      safeUpdateHeader(entry.midi);
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "get_time_signatures",
    {
      title: "Get time signatures",
      description: "Get time signature changes",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(async ({ midiId }) => {
      const entry = getEntry(midiId);
      return serialize(entry.midi.header.timeSignatures);
    })
  );

  server.registerTool(
    "set_time_signatures",
    {
      title: "Set time signatures",
      description: "Set time signature changes",
      inputSchema: z.object({
        midiId: z.string(),
        changes: z.array(
          z.object({
            ticks: z.number().int().min(0),
            timeSignature: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
          })
        ),
      }),
    },
    withErrorHandling(async ({ midiId, changes }) => {
      const entry = getEntry(midiId);
      entry.midi.header.timeSignatures = [...changes].sort((a, b) => a.ticks - b.ticks);
      safeUpdateHeader(entry.midi);
      markDirty(entry);
      return ok("ok");
    })
  );

  server.registerTool(
    "validate",
    {
      title: "Validate MIDI",
      description: "Validate MIDI for common issues",
      inputSchema: z.object({ midiId: z.string(), ruleset: z.string().optional() }),
    },
    withErrorHandling(async ({ midiId }) => {
      const entry = getEntry(midiId);
      return serialize(collectIssues(entry.midi));
    })
  );

  server.registerTool(
    "diff",
    {
      title: "Diff MIDI",
      description: "Diff two MIDI ids",
      inputSchema: z.object({
        midiIdA: z.string(),
        midiIdB: z.string(),
        range: RangeSchema,
      }),
    },
    withErrorHandling(async ({ midiIdA, midiIdB, range }) => {
      const a = getEntry(midiIdA);
      const b = getEntry(midiIdB);
      const countNotes = (midi: Midi) =>
        midi.tracks.reduce((sum: number, _t: any, i: number) => {
          return sum + toEventList(midi, i, range).filter((e) => e.type === "note").length;
        }, 0);
      const summary = {
        tracksA: a.midi.tracks.length,
        tracksB: b.midi.tracks.length,
        notesA: countNotes(a.midi),
        notesB: countNotes(b.midi),
      };
      return serialize(summary);
    })
  );

  server.registerTool(
    "export_report",
    {
      title: "Export report",
      description: "Export validation report",
      inputSchema: z.object({
        midiId: z.string(),
        format: z.enum(["json", "txt"]),
      }),
    },
    withErrorHandling(async ({ midiId, format }) => {
      const entry = getEntry(midiId);
      const issues = collectIssues(entry.midi);
      const dir = reportsDir(entry.projectId);
      await fs.mkdir(dir, { recursive: true });
      const outPath = path.join(dir, `midi-report-${midiId}.${format}`);
      const text = format === "json" ? JSON.stringify(issues) : JSON.stringify(issues, null, 2);
      await fs.writeFile(outPath, text);
      return serialize({ filePath: outPath });
    })
  );

  server.registerTool(
    "create_midi",
    {
      title: "Create MIDI",
      description: "Create a MIDI file from composition",
      inputSchema: z.object({
        projectId: z.string().default("default"),
        composition: z
          .object({
            ppq: z.number().int().min(1).optional(),
            tempos: z.array(z.object({ ticks: z.number().int().min(0), bpm: z.number().min(1) })).optional(),
            timeSignatures: z
              .array(
                z.object({ ticks: z.number().int().min(0), timeSignature: z.tuple([z.number().int().min(1), z.number().int().min(1)]) })
              )
              .optional(),
            tracks: z
              .array(
                z.object({
                  name: z.string().optional(),
                  channel: z.number().int().min(0).max(15).optional(),
                  instrument: z.number().int().min(0).max(127).optional(),
                  events: z.array(EventSchema).optional(),
                })
              )
              .optional(),
          })
          .optional(),
        composition_file: z.string().optional(),
        outputPath: z.string(),
      }),
    },
    withErrorHandling(async ({ projectId, composition, composition_file, outputPath }) => {
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
      if (data.timeSignatures) midi.header.timeSignatures = data.timeSignatures;
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
      await fs.writeFile(absOut, Buffer.from(midi.toArray()));
      return serialize({ filePath: absOut });
    })
  );
};
