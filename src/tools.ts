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
  EventSchema,
  CreateMidiSchema,
} from "./tool-schemas.js";

export const registerMidiTools = (server: McpServer, repo: MidiRepository) => {
  const handlers = createMidiHandlers(repo);

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List available projects",
      inputSchema: z.object({}),
    },
    withErrorHandling(handlers.listProjects)
  );

  server.registerTool(
    "open_midi",
    {
      title: "Open MIDI file",
      description: "Open MIDI by relative path",
      inputSchema: z.object({ projectId: z.string(), relativePath: z.string() }),
    },
    withErrorHandling(handlers.openMidi)
  );

  server.registerTool(
    "close_midi",
    {
      title: "Close MIDI file",
      description: "Close MIDI by midiId",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.closeMidi)
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
    withErrorHandling(handlers.saveAs)
  );

  server.registerTool(
    "commit",
    {
      title: "Commit",
      description: "Save MIDI back to its original path",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.commit)
  );

  server.registerTool(
    "backup",
    {
      title: "Backup MIDI",
      description: "Create backup and return backupId",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.backup)
  );

  server.registerTool(
    "restore",
    {
      title: "Restore MIDI from backup",
      description: "Restore MIDI and return midiId",
      inputSchema: z.object({ backupId: z.string() }),
    },
    withErrorHandling(handlers.restore)
  );

  server.registerTool(
    "revert",
    {
      title: "Revert",
      description: "Revert MIDI to the last backup",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.revert)
  );

  server.registerTool(
    "get_timeline",
    {
      title: "Get timeline",
      description: "Get ppq, tempos, and time signatures",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.getTimeline)
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
    withErrorHandling(handlers.toTicks)
  );

  server.registerTool(
    "to_bbt",
    {
      title: "Convert ticks to BBT",
      description: "Convert ticks to bar/beat/tick",
      inputSchema: z.object({ midiId: z.string(), ticks: z.number().int().min(0) }),
    },
    withErrorHandling(handlers.toBbt)
  );

  server.registerTool(
    "get_tracks",
    {
      title: "Get tracks",
      description: "Get track list",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.getTracks)
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
    withErrorHandling(handlers.addTrack)
  );

  server.registerTool(
    "remove_track",
    {
      title: "Remove track",
      description: "Remove track by id",
      inputSchema: z.object({ midiId: z.string(), trackId: z.number().int().min(0) }),
    },
    withErrorHandling(handlers.removeTrack)
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
    withErrorHandling(handlers.setTrackProps)
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
    withErrorHandling(handlers.getEvents)
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
    withErrorHandling(handlers.insertEvents)
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
    withErrorHandling(handlers.removeEvents)
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
    withErrorHandling(handlers.copyEvents)
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
    withErrorHandling(handlers.quantize)
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
    withErrorHandling(handlers.humanize)
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
    withErrorHandling(handlers.transpose)
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
    withErrorHandling(handlers.constrainToScale)
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
    withErrorHandling(handlers.fixOverlaps)
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
    withErrorHandling(handlers.legato)
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
    withErrorHandling(handlers.trimNotes)
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
    withErrorHandling(handlers.insertCc)
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
    withErrorHandling(handlers.removeCc)
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
    withErrorHandling(handlers.insertPitchbend)
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
    withErrorHandling(handlers.removePitchbend)
  );

  server.registerTool(
    "get_tempo_map",
    {
      title: "Get tempo map",
      description: "Get tempo changes",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.getTempoMap)
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
    withErrorHandling(handlers.setTempoMap)
  );

  server.registerTool(
    "get_time_signatures",
    {
      title: "Get time signatures",
      description: "Get time signature changes",
      inputSchema: z.object({ midiId: z.string() }),
    },
    withErrorHandling(handlers.getTimeSignatures)
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
    withErrorHandling(handlers.setTimeSignatures)
  );

  server.registerTool(
    "validate",
    {
      title: "Validate MIDI",
      description: "Validate MIDI for common issues",
      inputSchema: z.object({ midiId: z.string(), ruleset: z.string().optional() }),
    },
    withErrorHandling(handlers.validate)
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
    withErrorHandling(handlers.diff)
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
    withErrorHandling(handlers.exportReport)
  );

  server.registerTool(
    "create_midi",
    {
      title: "Create MIDI",
      description: "Create a MIDI file from composition",
      inputSchema: CreateMidiSchema,
    },
    withErrorHandling(handlers.createMidi)
  );
};
