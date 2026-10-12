#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const repository = resolve(import.meta.dirname, "..");
const scanRoots = ["assets/sprite-sheets", "public/assets", "src"];
const standaloneFiles = ["index.html"];
const forbiddenBinaryExtensions = new Set([
  ".bmp",
  ".com",
  ".dll",
  ".exe",
  ".hlp",
  ".mid",
  ".midi",
  ".scr",
  ".wav",
]);
const textExtensions = new Set([".css", ".html", ".json", ".md", ".ts"]);
const suspiciousText = [
  {
    id: "vendor-copyright",
    pattern: new RegExp(["copy", "right.{0,24}micro", "soft"].join(""), "i"),
  },
  {
    id: "original-author-credit-in-shipping-file",
    pattern: new RegExp(["chris", "\\s+", "pirih"].join(""), "i"),
  },
  {
    id: "original-executable-name",
    pattern: new RegExp(["ski", "free", "\\.(exe|scr|hlp|bmp)"].join(""), "i"),
  },
];

function walk(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const files = [
  ...scanRoots.flatMap((root) => walk(join(repository, root))),
  ...standaloneFiles.map((file) => join(repository, file)),
].sort();
const findings = [];
const inventory = files.map((path) => {
  const projectPath = relative(repository, path);
  const extension = extname(path).toLowerCase();
  if (forbiddenBinaryExtensions.has(extension)) {
    findings.push({ file: projectPath, id: "forbidden-binary-extension" });
  }
  if (textExtensions.has(extension)) {
    const text = readFileSync(path, "utf8");
    for (const check of suspiciousText) {
      if (check.pattern.test(text))
        findings.push({ file: projectPath, id: check.id });
    }
  }
  return {
    bytes: statSync(path).size,
    file: projectPath,
    sha256: sha256(path),
  };
});

const conceptReadme = readFileSync(
  join(repository, "assets/sprite-sheets/README.md"),
  "utf8",
);
const atlasMetadata = JSON.parse(
  readFileSync(
    join(repository, "public/assets/production/freeski-atlas.meta.json"),
    "utf8",
  ),
);
const provenanceChecks = {
  atlasHasSourceManifestHash:
    typeof atlasMetadata.sourceManifestSha256 === "string" &&
    atlasMetadata.sourceManifestSha256.length === 64,
  atlasIdentifiesSourceManifest:
    atlasMetadata.sourceManifest === "assets/sprite-sheets/manifest.json",
  conceptGenerationDeclaresNoOutsideReferenceImagery: conceptReadme
    .replace(/\s+/g, " ")
    .includes(
      "no outside or original-game imagery used as a generation reference",
    ),
  proceduralAudioShipsNoRecordedAudio: !inventory.some((entry) =>
    [".mid", ".midi", ".wav"].includes(extname(entry.file).toLowerCase()),
  ),
};
for (const [id, passed] of Object.entries(provenanceChecks)) {
  if (!passed) findings.push({ file: null, id: `provenance:${id}` });
}

const report = {
  audit: "freeski-clean-room-shipping-audit-v1",
  filesAudited: inventory.length,
  findings,
  inventory,
  limitations: [
    "This static audit detects suspect filenames, binary formats, text markers, and broken local provenance; it is not a legal opinion.",
    "No authoritative hash corpus of every historical SkiFree release was available, so the audit cannot prove absence by exhaustive hash comparison.",
    "Behavioral similarity and independent authorship require process evidence and human review in addition to automated scanning.",
  ],
  passed: findings.length === 0,
  provenanceChecks,
  scope: [...scanRoots, ...standaloneFiles],
};

const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a path");
  writeFileSync(
    resolve(process.cwd(), output),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.passed ? 0 : 1;
