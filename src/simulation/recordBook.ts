import { GENERATOR_VERSION } from "../world/generatorVersion";
import type { EventModeId, ModeResult } from "./modes";

export const RECORD_SCHEMA_VERSION = 2;
export const RECORD_LIMIT = 10;
export type RecordBucket = "classic" | "seeded";

export interface RunRecord {
  readonly bucket: RecordBucket;
  readonly generatorVersion: string;
  readonly id: string;
  readonly metric: "score" | "time";
  readonly mode: EventModeId;
  readonly penaltySeconds: number;
  readonly recordedAtEpochMs: number;
  readonly seed: string;
  readonly value: number;
}

export interface RecordBook {
  readonly buckets: Readonly<
    Record<RecordBucket, Readonly<Record<EventModeId, readonly RunRecord[]>>>
  >;
  readonly schemaVersion: typeof RECORD_SCHEMA_VERSION;
}

function emptyModeBuckets(): Record<EventModeId, readonly RunRecord[]> {
  return { "free-style": [], slalom: [], "tree-slalom": [] };
}

export function emptyRecordBook(): RecordBook {
  return Object.freeze({
    buckets: Object.freeze({
      classic: Object.freeze(emptyModeBuckets()),
      seeded: Object.freeze(emptyModeBuckets()),
    }),
    schemaVersion: RECORD_SCHEMA_VERSION,
  });
}

export function bucketForSeed(seed: string): RecordBucket {
  return seed === "classic-1991" ? "classic" : "seeded";
}

export function recordFromResult(
  result: ModeResult,
  seed: string,
  recordedAtEpochMs: number,
  id: string,
): RunRecord {
  const metric = "time" as const;
  const value = result.adjustedTimeSeconds ?? result.rawTimeSeconds;
  return Object.freeze({
    bucket: bucketForSeed(seed),
    generatorVersion: GENERATOR_VERSION,
    id,
    metric,
    mode: result.mode,
    penaltySeconds: result.penaltySeconds,
    recordedAtEpochMs,
    seed,
    value,
  });
}

function compareRecords(a: RunRecord, b: RunRecord): number {
  const metricOrder =
    a.metric === "score" ? b.value - a.value : a.value - b.value;
  return (
    metricOrder ||
    a.recordedAtEpochMs - b.recordedAtEpochMs ||
    a.id.localeCompare(b.id)
  );
}

export function addRecord(book: RecordBook, record: RunRecord): RecordBook {
  if (!isRunRecord(record)) return book;
  const bucket = record.bucket;
  const updated = [...book.buckets[bucket][record.mode], record]
    .sort(compareRecords)
    .slice(0, RECORD_LIMIT);
  return Object.freeze({
    buckets: Object.freeze({
      classic: Object.freeze({
        ...book.buckets.classic,
        ...(bucket === "classic"
          ? { [record.mode]: Object.freeze(updated) }
          : {}),
      }),
      seeded: Object.freeze({
        ...book.buckets.seeded,
        ...(bucket === "seeded"
          ? { [record.mode]: Object.freeze(updated) }
          : {}),
      }),
    }),
    schemaVersion: RECORD_SCHEMA_VERSION,
  });
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RunRecord>;
  return (
    (record.bucket === "classic" || record.bucket === "seeded") &&
    record.bucket === bucketForSeed(record.seed ?? "") &&
    record.generatorVersion === GENERATOR_VERSION &&
    typeof record.id === "string" &&
    record.id.length > 0 &&
    (record.metric === "score" || record.metric === "time") &&
    (record.mode === "free-style" ||
      record.mode === "slalom" ||
      record.mode === "tree-slalom") &&
    record.metric === "time" &&
    typeof record.penaltySeconds === "number" &&
    Number.isFinite(record.penaltySeconds) &&
    record.penaltySeconds >= 0 &&
    typeof record.recordedAtEpochMs === "number" &&
    Number.isFinite(record.recordedAtEpochMs) &&
    typeof record.seed === "string" &&
    record.seed.length > 0 &&
    typeof record.value === "number" &&
    Number.isFinite(record.value) &&
    record.value >= 0
  );
}

export function parseRecordBook(serialized: string | null): RecordBook {
  if (!serialized) return emptyRecordBook();
  try {
    const parsed = JSON.parse(serialized) as Partial<RecordBook>;
    if (parsed.schemaVersion !== RECORD_SCHEMA_VERSION || !parsed.buckets)
      return emptyRecordBook();
    let book = emptyRecordBook();
    for (const bucket of ["classic", "seeded"] as const) {
      for (const mode of ["slalom", "tree-slalom", "free-style"] as const) {
        const records = parsed.buckets[bucket]?.[mode];
        if (!Array.isArray(records)) continue;
        for (const record of records) {
          if (isRunRecord(record)) book = addRecord(book, record);
        }
      }
    }
    return book;
  } catch {
    return emptyRecordBook();
  }
}

export function serializeRecordBook(book: RecordBook): string {
  return JSON.stringify(book);
}
