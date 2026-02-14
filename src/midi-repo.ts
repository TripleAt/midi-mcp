import path from "path";
import type { Midi } from "@tonejs/midi";
import { safeUpdateHeader } from "./midi-utils.js";

export type MidiEntry = {
  id: string;
  projectId: string;
  path?: string;
  midi: Midi;
  dirty: boolean;
  lastBackupId?: string;
};

export type BackupEntry = {
  id: string;
  projectId: string;
  path?: string;
  bytes: Uint8Array;
};

export class MidiRepository {
  public midiStore = new Map<string, MidiEntry>();
  public backupStore = new Map<string, BackupEntry>();
  public projects = new Map<string, string>([["default", process.cwd()]]);

  id(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  resolveProjectPath(projectId: string, relativePath: string) {
    const base = this.projects.get(projectId);
    if (!base) {
      throw new Error(`projectId not found: ${projectId}`);
    }
    const absBase = path.resolve(base);
    const abs = path.resolve(absBase, relativePath);
    const rel = path.relative(absBase, abs);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return abs;
    }
    throw new Error("Path escapes project root");
  }

  reportsDir(projectId: string) {
    return this.resolveProjectPath(projectId, "reports");
  }

  getEntry(midiId: string) {
    const entry = this.midiStore.get(midiId);
    if (!entry) {
      throw new Error(`midiId not found: ${midiId}`);
    }
    return entry;
  }

  getTrack(midi: Midi, trackId: number) {
    const track = midi.tracks[trackId];
    if (!track) {
      throw new Error(`trackId not found: ${trackId}`);
    }
    return track;
  }

  markDirty(entry: MidiEntry) {
    entry.dirty = true;
    safeUpdateHeader(entry.midi);
  }
}
