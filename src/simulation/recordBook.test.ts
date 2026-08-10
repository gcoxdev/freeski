import { describe, expect, it } from "vitest";
import { GENERATOR_VERSION } from "../world/generatorVersion";
import type { ModeResult } from "./modes";
import {
  addRecord,
  bucketForSeed,
  emptyRecordBook,
  parseRecordBook,
  recordFromResult,
  RECORD_LIMIT,
  serializeRecordBook,
} from "./recordBook";

function result(
  mode: ModeResult["mode"],
  value: number,
  penaltySeconds = 0,
): ModeResult {
  return {
    adjustedTimeSeconds: mode === "free-style" ? null : value,
    finishedAtSeconds: 100,
    mode,
    penaltySeconds,
    rawTimeSeconds: mode === "free-style" ? 20 : value - penaltySeconds,
    score: mode === "free-style" ? value : null,
  };
}

describe("record book", () => {
  it("separates classic fixed-seed and seeded-run records", () => {
    let book = emptyRecordBook();
    book = addRecord(
      book,
      recordFromResult(result("slalom", 40), "classic-1991", 1, "classic"),
    );
    book = addRecord(
      book,
      recordFromResult(result("slalom", 35), "daily-7", 2, "seeded"),
    );
    expect(bucketForSeed("classic-1991")).toBe("classic");
    expect(bucketForSeed("daily-7")).toBe("seeded");
    expect(book.buckets.classic.slalom.map((entry) => entry.id)).toEqual([
      "classic",
    ]);
    expect(book.buckets.seeded.slalom.map((entry) => entry.id)).toEqual([
      "seeded",
    ]);
  });

  it("sorts time ascending, Style descending, and ties stably", () => {
    let book = emptyRecordBook();
    for (const [id, value, at] of [
      ["later", 42, 30],
      ["fast", 35, 20],
      ["earlier", 42, 10],
    ] as const) {
      book = addRecord(
        book,
        recordFromResult(result("slalom", value), "classic-1991", at, id),
      );
    }
    expect(book.buckets.classic.slalom.map((entry) => entry.id)).toEqual([
      "fast",
      "earlier",
      "later",
    ]);
    for (const [id, value] of [
      ["low", 100],
      ["high", 900],
      ["mid", 400],
    ] as const) {
      book = addRecord(
        book,
        recordFromResult(
          result("free-style", value),
          "classic-1991",
          value,
          id,
        ),
      );
    }
    expect(book.buckets.classic["free-style"].map((entry) => entry.id)).toEqual(
      ["high", "mid", "low"],
    );
  });

  it("caps every bucket/mode leaderboard at ten", () => {
    let book = emptyRecordBook();
    for (let index = 0; index < 15; index += 1) {
      book = addRecord(
        book,
        recordFromResult(
          result("tree-slalom", 100 - index),
          "seeded-run",
          index,
          `run-${index}`,
        ),
      );
    }
    expect(book.buckets.seeded["tree-slalom"]).toHaveLength(RECORD_LIMIT);
    expect(book.buckets.seeded["tree-slalom"][0]?.value).toBe(86);
  });

  it("round-trips valid versioned data and safely recovers malformed storage", () => {
    const record = recordFromResult(
      result("slalom", 44, 5),
      "classic-1991",
      42,
      "roundtrip",
    );
    const book = addRecord(emptyRecordBook(), record);
    expect(parseRecordBook(serializeRecordBook(book))).toEqual(book);
    expect(parseRecordBook("{bad-json")).toEqual(emptyRecordBook());
    expect(parseRecordBook('{"schemaVersion":999,"buckets":{}}')).toEqual(
      emptyRecordBook(),
    );
    const invalid = JSON.stringify({
      buckets: {
        classic: {
          "free-style": [],
          slalom: [{ ...record, generatorVersion: "future" }],
          "tree-slalom": [],
        },
        seeded: { "free-style": [], slalom: [], "tree-slalom": [] },
      },
      schemaVersion: 1,
    });
    expect(parseRecordBook(invalid)).toEqual(emptyRecordBook());
    expect(record.generatorVersion).toBe(GENERATOR_VERSION);
  });
});
