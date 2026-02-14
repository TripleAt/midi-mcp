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

export const NoteEventBaseSchema = z.object({
  type: z.literal("note"),
  midi: z.number().int().min(0).max(127).optional(),
  noteNumber: z.number().int().min(0).max(127).optional(),
  ticks: z.number().int().min(0),
  durationTicks: z.number().int().min(1).optional(),
  duration: z.number().int().min(1).optional(),
  velocity: z.number().min(0).max(1).optional(),
});

export const NoteEventSchema = NoteEventBaseSchema.superRefine((val, ctx) => {
  if (val.midi === undefined && val.noteNumber === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires midi or noteNumber",
      path: ["midi"],
    });
  }
  if (val.midi !== undefined && val.noteNumber !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires only one of midi or noteNumber",
      path: ["noteNumber"],
    });
  }
  if (val.durationTicks === undefined && val.duration === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires durationTicks or duration",
      path: ["durationTicks"],
    });
  }
  if (val.durationTicks !== undefined && val.duration !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires only one of durationTicks or duration",
      path: ["duration"],
    });
  }
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
  NoteEventBaseSchema,
  CcEventSchema,
  PitchBendEventSchema,
]);

export const NoteEventShortcutSchema = NoteEventBaseSchema.omit({ type: true }).superRefine((val, ctx) => {
  if (val.midi === undefined && val.noteNumber === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires midi or noteNumber",
      path: ["midi"],
    });
  }
  if (val.midi !== undefined && val.noteNumber !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires only one of midi or noteNumber",
      path: ["noteNumber"],
    });
  }
  if (val.durationTicks === undefined && val.duration === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires durationTicks or duration",
      path: ["durationTicks"],
    });
  }
  if (val.durationTicks !== undefined && val.duration !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "note event requires only one of durationTicks or duration",
      path: ["duration"],
    });
  }
});
export const CcEventShortcutSchema = CcEventSchema.omit({ type: true });
export const PitchBendEventShortcutSchema = PitchBendEventSchema.omit({
  type: true,
});

export const InsertEventsSchema = z
  .object({
    midiId: z.string(),
    trackId: z.number().int().min(0),
    events: z.array(EventSchema).optional(),
    notes: z.array(NoteEventShortcutSchema).optional(),
    cc: z.array(CcEventShortcutSchema).optional(),
    pitchbends: z.array(PitchBendEventShortcutSchema).optional(),
  })
  .refine(
    (data) =>
      (data.events && data.events.length > 0) ||
      (data.notes && data.notes.length > 0) ||
      (data.cc && data.cc.length > 0) ||
      (data.pitchbends && data.pitchbends.length > 0),
    {
      message:
        "insert_events requires at least one of: events, notes, cc, pitchbends",
    }
  );

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
