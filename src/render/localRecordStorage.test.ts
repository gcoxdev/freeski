import { describe, expect, it } from "vitest";
import { LocalRecordStorage, RECORD_STORAGE_KEY } from "./localRecordStorage";
import { emptyRecordBook } from "../simulation/recordBook";

describe("LocalRecordStorage", () => {
  it("loads, saves, and recovers unavailable or malformed local storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const adapter = new LocalRecordStorage(storage);
    expect(adapter.load()).toEqual(emptyRecordBook());
    expect(adapter.save(emptyRecordBook())).toBe(true);
    expect(values.has(RECORD_STORAGE_KEY)).toBe(true);
    values.set(RECORD_STORAGE_KEY, "not-json");
    expect(adapter.load()).toEqual(emptyRecordBook());

    const unavailable = new LocalRecordStorage({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(unavailable.load()).toEqual(emptyRecordBook());
    expect(unavailable.save(emptyRecordBook())).toBe(false);
  });
});
