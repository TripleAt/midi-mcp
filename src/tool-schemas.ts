import { z } from "zod";

export const RangeSchema = z
  .object({
    startTicks: z.number().optional(),
    endTicks: z.number().optional(),
  })
  .optional();

export const FilterSchema = z
  .object({
    types: z.array(z.enum(["note", "cc", "pitchbend"])).optional(),
    noteNumbers: z.array(z.number().int().min(0).max(127)).optional(),
    ccNumbers: z.array(z.number().int().min(0).max(127)).optional(),
    channels: z.array(z.number().int().min(0).max(15)).optional(),
  })
  .optional();

export const NoteEventSchema = z.object({
  type: z.literal("note"),
  midi: z.number().int().min(0).max(127),
  ticks: z.number().int().min(0),
  durationTicks: z.number().int().min(1),
  velocity: z.number().min(0).max(1).optional(),
});

export const CcEventSchema = z.object({
  type: z.literal("cc"),
  number: z.number().int().min(0).max(127),
  value: z.number().min(0).max(1),
  ticks: z.number().int().min(0),
});

export const PitchBendEventSchema = z.object({
  type: z.literal("pitchbend"),
  value: z.number().min(-1).max(1),
  ticks: z.number().int().min(0),
});

export const EventSchema = z.discriminatedUnion("type", [
  NoteEventSchema,
  CcEventSchema,
  PitchBendEventSchema,
]);

export const CreateMidiSchema = z.object({
  projectId: z.string().default("default"),
  composition: z
    .object({
      ppq: z.number().int().min(1).optional(),
      tempos: z
        .array(
          z.object({ ticks: z.number().int().min(0), bpm: z.number().min(1) })
        )
        .optional(),
      timeSignatures: z
        .array(
          z.object({
            ticks: z.number().int().min(0),
            timeSignature: z.tuple([
              z.number().int().min(1),
              z.number().int().min(1),
            ]),
          })
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
});
