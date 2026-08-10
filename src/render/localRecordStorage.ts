import {
  emptyRecordBook,
  parseRecordBook,
  serializeRecordBook,
  type RecordBook,
} from "../simulation/recordBook";

export const RECORD_STORAGE_KEY = "freeski.records.v1";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Browser boundary: pure validation and ordering remain in simulation/recordBook. */
export class LocalRecordStorage {
  constructor(private readonly storage: KeyValueStorage) {}

  load(): RecordBook {
    try {
      return parseRecordBook(this.storage.getItem(RECORD_STORAGE_KEY));
    } catch {
      return emptyRecordBook();
    }
  }

  save(book: RecordBook): boolean {
    try {
      this.storage.setItem(RECORD_STORAGE_KEY, serializeRecordBook(book));
      return true;
    } catch {
      return false;
    }
  }
}
