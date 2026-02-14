import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MidiRepository } from "./midi-repo.js";
import { withErrorHandling } from "./midi-utils.js";
import { createMidiHandlers } from "./midi-handlers.js";
import {
  RangeSchema,
  FilterSchema,
  CcEventSchema,
  PitchBendEventSchema,
  CreateMidiSchema,
  InsertEventsSchema,
  NoteEventShortcutSchema,
  TimelineChangeSchema,
  ControllerEventSchema,
} from "./tool-schemas.js";

export const registerMidiTools = (server: McpServer, repo: MidiRepository) => {
  const handlers = createMidiHandlers(repo);

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List available projects. Signature: () -> [{id, path}]",
      inputSchema: z.object({}),
    },
    withErrorHandling(handlers.listProjects)
  );

  server.registerTool(
    "open_midi",
    {
      title: "Open MIDI file",
      description: "Open MIDI by relative path. Signature: ({projectId, relativePath}) -> {midiId, path}",
      inputSchema: z.object({ projectId: z.string(), relativePath: z.string() }),
    },
    withErrorHandling(handlers.openMidi)
  );

  server.registerTool(
    "close_midi",
    {
      title: "Close MIDI file",
      description: "Close MIDI by midiId. Signature: ({midiId}) -> ok",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.closeMidi)
  );

  server.registerTool(
    "save_as",
    {
      title: "Save MIDI to new path",
      description:
        "Save MIDI to a relative path. Signature: ({midiId, projectId?, relativePath}) -> {midiId, path}",
      inputSchema: z.object({
        midiId: z.string(),
        projectId: z.string().optional(),
        relativePath: z.string(),
      }),
    },
    withErrorHandling(handlers.saveAs)
  );

  server.registerTool(
    "commit",
    {
      title: "Commit",
      description: "Save MIDI back to its original path. Signature: ({midiId}) -> ok|noop",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.commit)
  );

  server.registerTool(
    "backup",
    {
      title: "Backup MIDI",
      description: "Create backup and return backupId. Signature: ({midiId}) -> {backupId}",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.backup)
  );

  server.registerTool(
    "restore",
    {
      title: "Restore MIDI from backup",
      description: "Restore MIDI and return midiId. Signature: ({backupId}) -> {midiId}",
      inputSchema: z.object({ backupId: z.string() }),
    },
    withErrorHandling(handlers.restore)
  );

  server.registerTool(
    "revert",
    {
      title: "Revert",
      description: "Revert MIDI to the last backup. Signature: ({midiId}) -> ok",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.revert)
  );

  server.registerTool(
    "get_timeline",
    {
      title: "Get timeline",
      description:
        "Get ppq, tempos, and time signatures. Signature: ({midiId}) -> {ppq, tempos, timeSignatures}",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.getTimeline)
  );

  server.registerTool(
    "to_ticks",
    {
      title: "Convert time to ticks",
      description:
        "Convert bbt/beats/seconds to ticks. Signature: ({midiId, bbt?|quarterNotes?|seconds?}) -> {ticks}",
      inputSchema: z.object({
        midiId: z.string(),
        bbt: z
          .object({ bar: z.number().int().min(1), beat: z.number().int().min(1), tick: z.number().int().min(0) })
          .optional(),
        quarterNotes: z.number().optional(),
        seconds: z.number().optional(),
      }),
    },
    withErrorHandling(handlers.toTicks)
  );

  server.registerTool(
    "to_bbt",
    {
      title: "Convert ticks to BBT",
      description: "Convert ticks to bar/beat/tick. Signature: ({midiId, ticks}) -> {bar, beat, tick}",
      inputSchema: z.object({ midiId: z.string(), ticks: z.number().int().min(0) }),
    },
    withErrorHandling(handlers.toBbt)
  );

  server.registerTool(
    "get_tracks",
    {
      title: "Get tracks",
      description:
        "Get track list. Signature: ({midiId}) -> [{trackId, name, channel, instrument, instrumentName, noteCount}]",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.getTracks)
  );

  server.registerTool(
    "add_track",
    {
      title: "Add track",
      description:
        "Add a track and return its id. Signature: ({midiId, name?, channel?, instrument?}) -> {trackId}",
      inputSchema: z.object({
        midiId: z.string(),
        name: z.string().optional(),
        channel: z.number().int().min(0).max(15).optional(),
        instrument: z.number().int().min(0).max(127).optional(),
      }),
    },
    withErrorHandling(handlers.addTrack)
  );

  server.registerTool(
    "remove_track",
    {
      title: "Remove track",
      description: "Remove track by id. Signature: ({midiId, trackId}) -> ok",
      inputSchema: z.object({ midiId: z.string(), trackId: z.number().int().min(0) }),
    },
    withErrorHandling(handlers.removeTrack)
  );

  server.registerTool(
    "set_track_props",
    {
      title: "Set track properties",
      description:
        "Update track name/channel/instrument. Signature: ({midiId, trackId, name?, channel?, instrument?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        name: z.string().optional(),
        channel: z.number().int().min(0).max(15).optional(),
        instrument: z.number().int().min(0).max(127).optional(),
      }),
    },
    withErrorHandling(handlers.setTrackProps)
  );

  server.registerTool(
    "get_events",
    {
      title: "Get events",
      description:
        "Get events with range/filter/paging. Signature: ({midiId, trackId, range?, filter?, offset?, limit?}) -> {total, nextOffset, events}",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(5000).optional(),
      }),
    },
    withErrorHandling(handlers.getEvents)
  );

  server.registerTool(
    "get_all_events",
    {
      title: "Get all events",
      description:
        "Get all matching events (no paging). Signature: ({midiId, trackId, range?, filter?}) -> {total, nextOffset:null, events}",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
      }),
    },
    withErrorHandling(handlers.getAllEvents)
  );

  server.registerTool(
    "insert_events",
    {
      title: "Insert events",
      description:
        "Insert mixed events into track (advanced). Signature: ({midiId, trackId, events?|notes?|cc?|pitchbends?}) -> ok",
      inputSchema: InsertEventsSchema,
    },
    withErrorHandling(handlers.insertEvents)
  );

  server.registerTool(
    "insert_notes",
    {
      title: "Insert notes",
      description: "Insert note events into track. Signature: ({midiId, trackId, notes}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        notes: z.array(NoteEventShortcutSchema),
      }),
    },
    withErrorHandling(handlers.insertNotes)
  );

  server.registerTool(
    "insert_controllers",
    {
      title: "Insert controllers",
      description:
        "Insert CC and pitch bend events into track. Signature: ({midiId, trackId, events:[cc|pitchbend]}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        events: z.array(ControllerEventSchema),
      }),
    },
    withErrorHandling(handlers.insertControllers)
  );

  server.registerTool(
    "remove_events",
    {
      title: "Remove events",
      description:
        "Remove events (notes/cc/pitchbend) matching range/filter. Signature: ({midiId, trackId, range?, filter?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
      }),
    },
    withErrorHandling(handlers.removeEvents)
  );

  server.registerTool(
    "remove_notes",
    {
      title: "Remove notes",
      description:
        "Remove notes matching range/filter. Signature: ({midiId, trackId, range?, filter?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
      }),
    },
    withErrorHandling(handlers.removeNotes)
  );

  server.registerTool(
    "copy_events",
    {
      title: "Copy events",
      description:
        "Copy events between tracks. Signature: ({midiId, srcTrackId, dstTrackId, range?, filter?, deltaTicks}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        srcTrackId: z.number().int().min(0),
        dstTrackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        deltaTicks: z.number().int(),
      }),
    },
    withErrorHandling(handlers.copyEvents)
  );

  server.registerTool(
    "quantize",
    {
      title: "Quantize",
      description:
        "Quantize note timing. Signature: ({midiId, trackId, range?, filter?, grid, strength?, swing?}) -> ok",
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
    withErrorHandling(handlers.quantize)
  );

  server.registerTool(
    "humanize",
    {
      title: "Humanize",
      description:
        "Humanize note timing/velocity. Signature: ({midiId, trackId, range?, filter?, timingMs?, velocity?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        timingMs: z.number().min(0).optional(),
        velocity: z.number().min(0).max(1).optional(),
      }),
    },
    withErrorHandling(handlers.humanize)
  );

  server.registerTool(
    "transpose",
    {
      title: "Transpose",
      description:
        "Transpose notes by semitones. Signature: ({midiId, trackId, range?, filter?, semitones}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        semitones: z.number().int(),
      }),
    },
    withErrorHandling(handlers.transpose)
  );

  server.registerTool(
    "constrain_to_scale",
    {
      title: "Constrain to scale",
      description:
        "Constrain notes to a scale. Signature: ({midiId, trackId, range?, filter?, key, scale, strategy?}) -> ok",
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
    withErrorHandling(handlers.constrainToScale)
  );

  server.registerTool(
    "fix_overlaps",
    {
      title: "Fix overlaps",
      description:
        "Fix overlapping notes. Signature: ({midiId, trackId, range?, filter?, mode?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        mode: z.enum(["trim", "remove"]).default("trim"),
      }),
    },
    withErrorHandling(handlers.fixOverlaps)
  );

  server.registerTool(
    "legato",
    {
      title: "Legato",
      description:
        "Make notes legato. Signature: ({midiId, trackId, range?, filter?, gapTicks?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        gapTicks: z.number().int().min(0).optional(),
      }),
    },
    withErrorHandling(handlers.legato)
  );

  server.registerTool(
    "trim_notes",
    {
      title: "Trim notes",
      description:
        "Remove notes shorter than minDuration. Signature: ({midiId, trackId, range?, filter?, minDuration?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
        minDuration: z.number().int().min(1).optional(),
      }),
    },
    withErrorHandling(handlers.trimNotes)
  );

  server.registerTool(
    "remove_controllers",
    {
      title: "Remove controllers",
      description:
        "Remove CC and pitch bend events matching range/filter. Signature: ({midiId, trackId, range?, filter?}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        trackId: z.number().int().min(0),
        range: RangeSchema,
        filter: FilterSchema,
      }),
    },
    withErrorHandling(handlers.removeControllers)
  );

  server.registerTool(
    "set_timeline",
    {
      title: "Set timeline",
      description:
        "Set tempo and/or time signatures in one call. Signature: ({midiId, changes:[{type:'tempo',ticks,bpm}|{type:'time_signature',ticks,numerator,denominator}]}) -> ok",
      inputSchema: z.object({
        midiId: z.string(),
        changes: z.array(TimelineChangeSchema),
      }),
    },
    withErrorHandling(handlers.setTimeline)
  );

  server.registerTool(
    "validate",
    {
      title: "Validate MIDI",
      description: "Validate MIDI for common issues. Signature: ({midiId, ruleset?}) -> issues[]",
      inputSchema: z.object({ midiId: z.string(), ruleset: z.string().optional() }),
    },
    withErrorHandling(handlers.validate)
  );

  server.registerTool(
    "diff",
    {
      title: "Diff MIDI",
      description:
        "Diff two MIDI ids. Signature: ({midiIdA, midiIdB, range?}) -> {tracksA, tracksB, notesA, notesB}",
      inputSchema: z.object({
        midiIdA: z.string(),
        midiIdB: z.string(),
        range: RangeSchema,
      }),
    },
    withErrorHandling(handlers.diff)
  );

  server.registerTool(
    "export_report",
    {
      title: "Export report",
      description:
        "Export validation report. Signature: ({midiId, format}) -> {filePath}",
      inputSchema: z.object({
        midiId: z.string(),
        format: z.enum(["json", "txt"]),
      }),
    },
    withErrorHandling(handlers.exportReport)
  );

  server.registerTool(
    "create_midi",
    {
      title: "Create MIDI",
      description:
        "Create a MIDI file from composition data. Signature: ({projectId?, composition?|composition_file?, outputPath}) -> {filePath}. composition.timeSignatures use {ticks,numerator,denominator}.",
      inputSchema: CreateMidiSchema,
    },
    withErrorHandling(handlers.createMidi)
  );
};
