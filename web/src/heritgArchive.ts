import { decodeBase64, encodeBase64 } from "rork-plist";

import {
  MAX_PORTABILITY_BYTES,
  importNativeHeritgArchive,
  validateAppData,
  type BackupImportOptions
} from "./portability";
import type {
  AppData,
  FamilyRelationship,
  FamilyTree,
  Gender,
  Person,
  RelationshipKind,
  RelationshipSubtype
} from "./types";

const FORMAT = "heritg-family-archive";
const FORMAT_VERSION = "1.0.0";
const SCHEMA_VERSION = 1;
const ENCRYPTED_MAGIC = new TextEncoder().encode("HTGENC01");
const LEGACY_ENCRYPTED_MAGIC = new TextEncoder().encode("HERITG01");
const LEGACY_UNENCRYPTED_MAGIC = new TextEncoder().encode("HERITG00");
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const ENVELOPE_VERSION = 1;
const KDF_ID = 1;
const CIPHER_ID = 1;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 44;
const LEGACY_HEADER_BYTES = 42;
const MAX_PEOPLE = 100_000;
const MAX_RELATIONSHIPS = 300_000;
const MAX_MEDIA = 50_000;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_SHORT_BYTES = 4_096;
const MAX_NOTES_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const cryptoBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
};

type ArchiveProtection = "encrypted" | "unencrypted" | "legacy-encrypted" | "legacy-unencrypted";
type JsonObject = Record<string, unknown>;
type MediaReference = { byteSize: number; mimeType: string; path: string; sha256: string };

export class HeritgArchivePasswordError extends Error {
  constructor() {
    super("The password is incorrect or the .heritg archive was modified.");
    this.name = "HeritgArchivePasswordError";
  }
}

const fail = (message: string): never => {
  throw new Error(`Invalid .heritg archive: ${message}`);
};

const startsWith = (bytes: Uint8Array, prefix: Uint8Array): boolean =>
  bytes.byteLength >= prefix.byteLength && prefix.every((value, index) => bytes[index] === value);

const bytesOf = (source: ArrayBuffer | Uint8Array): Uint8Array =>
  source instanceof Uint8Array ? source : new Uint8Array(source);

export function heritgArchiveProtection(source: ArrayBuffer | Uint8Array): ArchiveProtection {
  const bytes = bytesOf(source);
  if (!bytes.byteLength || bytes.byteLength > MAX_PORTABILITY_BYTES) fail("file size is outside the 32 MiB limit.");
  if (startsWith(bytes, ENCRYPTED_MAGIC)) return "encrypted";
  if (startsWith(bytes, ZIP_MAGIC)) return "unencrypted";
  if (startsWith(bytes, LEGACY_ENCRYPTED_MAGIC)) return "legacy-encrypted";
  if (startsWith(bytes, LEGACY_UNENCRYPTED_MAGIC)) return "legacy-unencrypted";
  return fail("header is not recognized.");
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  if (total > MAX_PORTABILITY_BYTES) fail("file is larger than 32 MiB.");
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

const writeU16BE = (target: Uint8Array, offset: number, value: number) => {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, false);
};

const writeU32BE = (target: Uint8Array, offset: number, value: number) => {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, false);
};

const readU16BE = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset > bytes.byteLength - 2) fail("header is truncated.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, false);
};

const readU32BE = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset > bytes.byteLength - 4) fail("header is truncated.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
};

const deriveKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
  normalize: boolean
): Promise<CryptoKey> => {
  const passwordBytes = encoder.encode(normalize ? password.normalize("NFC") : password);
  try {
    const material = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: cryptoBytes(salt), iterations },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    passwordBytes.fill(0);
  }
};

async function sealZip(
  zip: Uint8Array,
  password: string,
  salt = randomBytes(SALT_BYTES),
  nonce = randomBytes(NONCE_BYTES)
): Promise<Uint8Array> {
  if (salt.byteLength !== SALT_BYTES || nonce.byteLength !== NONCE_BYTES) fail("salt or nonce length is invalid.");
  const header = new Uint8Array(HEADER_BYTES);
  header.set(ENCRYPTED_MAGIC);
  writeU16BE(header, 8, ENVELOPE_VERSION);
  header[10] = KDF_ID;
  header[11] = CIPHER_ID;
  writeU32BE(header, 12, PBKDF2_ITERATIONS);
  header.set(salt, 16);
  header.set(nonce, 32);
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS, true);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: cryptoBytes(nonce), additionalData: header, tagLength: TAG_BYTES * 8 },
    key,
    cryptoBytes(zip)
  );
  return concat(header, new Uint8Array(sealed));
}

async function openEnvelope(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (bytes.byteLength < HEADER_BYTES + TAG_BYTES) fail("encrypted envelope is truncated.");
  if (readU16BE(bytes, 8) !== ENVELOPE_VERSION) fail("encrypted envelope version is unsupported.");
  if (bytes[10] !== KDF_ID || bytes[11] !== CIPHER_ID || readU32BE(bytes, 12) !== PBKDF2_ITERATIONS) {
    fail("encrypted envelope algorithms or work factor are unsupported.");
  }
  const header = bytes.slice(0, HEADER_BYTES);
  const salt = bytes.slice(16, 32);
  const nonce = bytes.slice(32, 44);
  try {
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS, true);
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: header, tagLength: TAG_BYTES * 8 },
      key,
      bytes.slice(HEADER_BYTES)
    );
    return new Uint8Array(opened);
  } catch {
    throw new HeritgArchivePasswordError();
  }
}

async function openLegacyEnvelope(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (bytes.byteLength < LEGACY_HEADER_BYTES + TAG_BYTES || readU16BE(bytes, 8) !== 1) {
    fail("legacy encrypted envelope is invalid.");
  }
  const iterations = readU32BE(bytes, 10);
  if (iterations < 100_000 || iterations > 2_000_000) fail("legacy work factor is invalid.");
  const header = bytes.slice(0, LEGACY_HEADER_BYTES);
  const salt = bytes.slice(14, 30);
  const nonce = bytes.slice(30, 42);
  try {
    const key = await deriveKey(password, salt, iterations, false);
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: header, tagLength: TAG_BYTES * 8 },
      key,
      bytes.slice(LEGACY_HEADER_BYTES)
    );
    const legacyHeader = new Uint8Array(10);
    legacyHeader.set(LEGACY_UNENCRYPTED_MAGIC);
    writeU16BE(legacyHeader, 8, 1);
    return concat(legacyHeader, new Uint8Array(opened));
  } catch {
    throw new HeritgArchivePasswordError();
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

class ByteWriter {
  readonly bytes: number[] = [];
  get length() { return this.bytes.length; }
  u16(value: number) { this.bytes.push(value & 0xff, (value >>> 8) & 0xff); }
  u32(value: number) { this.u16(value & 0xffff); this.u16((value >>> 16) & 0xffff); }
  append(value: Uint8Array) { for (const byte of value) this.bytes.push(byte); }
  result() {
    if (this.length > MAX_PORTABILITY_BYTES) fail("ZIP is larger than 32 MiB.");
    return Uint8Array.from(this.bytes);
  }
}

const validPath = (path: string): boolean => {
  const parts = path.split("/");
  return Boolean(path) && encoder.encode(path).byteLength <= MAX_SHORT_BYTES &&
    !path.startsWith("/") && !path.endsWith("/") && !path.includes("\\") && !path.includes("\0") &&
    parts.every((part) => part && part !== "." && part !== "..");
};

export function encodeHeritgZip(entries: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const writer = new ByteWriter();
  const central: { path: string; name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  for (const [path, data] of [...entries].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    if (!validPath(path) || central.some((entry) => entry.path === path)) fail("ZIP contains an unsafe or duplicate path.");
    const name = encoder.encode(path);
    const crc = crc32(data);
    const offset = writer.length;
    central.push({ path, name, data, crc, offset });
    writer.u32(0x04034b50); writer.u16(20); writer.u16(0x0800); writer.u16(0);
    writer.u16(0); writer.u16(0x0021); writer.u32(crc); writer.u32(data.byteLength); writer.u32(data.byteLength);
    writer.u16(name.byteLength); writer.u16(0); writer.append(name); writer.append(data);
  }
  const centralOffset = writer.length;
  for (const entry of central) {
    writer.u32(0x02014b50); writer.u16(20); writer.u16(20); writer.u16(0x0800); writer.u16(0);
    writer.u16(0); writer.u16(0x0021); writer.u32(entry.crc); writer.u32(entry.data.byteLength);
    writer.u32(entry.data.byteLength); writer.u16(entry.name.byteLength); writer.u16(0); writer.u16(0);
    writer.u16(0); writer.u16(0); writer.u32(0); writer.u32(entry.offset); writer.append(entry.name);
  }
  const centralSize = writer.length - centralOffset;
  writer.u32(0x06054b50); writer.u16(0); writer.u16(0); writer.u16(central.length); writer.u16(central.length);
  writer.u32(centralSize); writer.u32(centralOffset); writer.u16(0);
  return writer.result();
}

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u16 = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset > bytes.byteLength - 2) fail("ZIP record is truncated.");
  return viewOf(bytes).getUint16(offset, true);
};
const u32 = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset > bytes.byteLength - 4) fail("ZIP record is truncated.");
  return viewOf(bytes).getUint32(offset, true);
};
const strictText = (bytes: Uint8Array): string => {
  try { return decoder.decode(bytes); } catch { return fail("text is not valid UTF-8."); }
};

export function decodeHeritgZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_PORTABILITY_BYTES) fail("ZIP size is invalid.");
  const end = bytes.byteLength - 22;
  if (u32(bytes, end) !== 0x06054b50 || u16(bytes, end + 4) || u16(bytes, end + 6) ||
      u16(bytes, end + 8) !== u16(bytes, end + 10) || u16(bytes, end + 20)) fail("ZIP footer is invalid.");
  const count = u16(bytes, end + 10);
  const centralSize = u32(bytes, end + 12);
  const centralOffset = u32(bytes, end + 16);
  if (centralOffset + centralSize !== end) fail("ZIP central directory is invalid.");
  const records: { path: string; crc: number; size: number; offset: number }[] = [];
  const names = new Set<string>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) fail("ZIP central record is invalid.");
    const madeBy = u16(bytes, cursor + 4);
    const needed = u16(bytes, cursor + 6);
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const time = u16(bytes, cursor + 12);
    const date = u16(bytes, cursor + 14);
    const crc = u32(bytes, cursor + 16);
    const compressed = u32(bytes, cursor + 20);
    const size = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const disk = u16(bytes, cursor + 34);
    const internalAttributes = u16(bytes, cursor + 36);
    const externalAttributes = u32(bytes, cursor + 38);
    const offset = u32(bytes, cursor + 42);
    if (needed !== 20 || flags !== 0x0800 || method || time || date !== 0x0021 ||
        compressed !== size || extraLength || commentLength || disk || internalAttributes) fail("ZIP feature is unsupported.");
    if ((madeBy >>> 8) === 3) {
      const fileType = (externalAttributes >>> 16) & 0xf000;
      if (fileType && fileType !== 0x8000) fail("ZIP links and special files are forbidden.");
    }
    const nameStart = cursor + 46;
    const path = strictText(bytes.slice(nameStart, nameStart + nameLength));
    if (!validPath(path) || names.has(path)) fail("ZIP path is unsafe or duplicated.");
    names.add(path);
    records.push({ path, crc, size, offset });
    cursor = nameStart + nameLength;
  }
  if (cursor !== end) fail("ZIP central directory has trailing bytes.");
  const result = new Map<string, Uint8Array>();
  const ranges: { start: number; end: number }[] = [];
  let total = 0;
  for (const record of records) {
    const offset = record.offset;
    if (u32(bytes, offset) !== 0x04034b50 || u16(bytes, offset + 4) !== 20 ||
        u16(bytes, offset + 6) !== 0x0800 || u16(bytes, offset + 8) ||
        u16(bytes, offset + 10) || u16(bytes, offset + 12) !== 0x0021 ||
        u32(bytes, offset + 14) !== record.crc || u32(bytes, offset + 18) !== record.size ||
        u32(bytes, offset + 22) !== record.size || u16(bytes, offset + 28)) fail("ZIP local record is invalid.");
    const nameLength = u16(bytes, offset + 26);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength;
    const dataEnd = dataStart + record.size;
    if (dataEnd > centralOffset || strictText(bytes.slice(nameStart, dataStart)) !== record.path) fail("ZIP local path is invalid.");
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== record.crc) fail("ZIP CRC does not match.");
    total += data.byteLength;
    if (total > MAX_PORTABILITY_BYTES) fail("uncompressed ZIP data is larger than 32 MiB.");
    ranges.push({ start: offset, end: dataEnd });
    result.set(record.path, data);
  }
  let expected = 0;
  for (const range of ranges.sort((left, right) => left.start - right.start)) {
    if (range.start !== expected) fail("ZIP records overlap or contain gaps.");
    expected = range.end;
  }
  if (expected !== centralOffset) fail("ZIP has bytes outside records.");
  return result;
}

const sha256 = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", cryptoBytes(bytes)))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");

const stable = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
};

const exactInstant = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail("date is invalid.");
  return date.toISOString();
};

const mediaInfo = async (bytes: Uint8Array): Promise<MediaReference> => {
  let extension = "bin";
  let mimeType = "application/octet-stream";
  const ascii = (start: number, end: number) => strictText(bytes.slice(start, end));
  if (startsWith(bytes, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    extension = "png"; mimeType = "image/png";
  } else if (startsWith(bytes, new Uint8Array([0xff, 0xd8, 0xff]))) {
    extension = "jpg"; mimeType = "image/jpeg";
  } else if (bytes.byteLength >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) {
    extension = "gif"; mimeType = "image/gif";
  } else if (bytes.byteLength >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    extension = "webp"; mimeType = "image/webp";
  } else if (bytes.byteLength >= 12 && ascii(4, 8) === "ftyp" &&
      ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 12))) {
    extension = "heic"; mimeType = "image/heic";
  }
  const digest = await sha256(bytes);
  return { byteSize: bytes.byteLength, mimeType, path: `media/${digest}.${extension}`, sha256: digest };
};

const photoBytes = (value: string): Uint8Array => {
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value) ??
    fail("profile photo data URL is invalid.");
  try {
    const bytes = decodeBase64(match[1]);
    if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_BYTES) fail("profile photo is outside the size limit.");
    return bytes;
  } catch {
    return fail("profile photo base64 is invalid.");
  }
};

async function archiveEntries(data: AppData, treeId: string, exportedAt: Date | string): Promise<Map<string, Uint8Array>> {
  const clean = validateAppData(data);
  const tree = clean.trees.find((item) => item.id === treeId) ?? fail("selected tree does not exist.");
  const people = clean.people.filter((person) => person.treeId === tree.id);
  const relationships = clean.relationships.filter((relationship) => relationship.treeId === tree.id);
  if (people.length > MAX_PEOPLE || relationships.length > MAX_RELATIONSHIPS) fail("record count is outside the limit.");
  const media = new Map<string, Uint8Array>();
  const peopleRecords: JsonObject[] = [];
  for (const person of people) {
    let profilePhoto: MediaReference | null = null;
    if (person.photoDataUrl) {
      const bytes = photoBytes(person.photoDataUrl);
      profilePhoto = await mediaInfo(bytes);
      const existing = media.get(profilePhoto.path);
      if (existing && (existing.byteLength !== bytes.byteLength ||
          !existing.every((byte, index) => bytes[index] === byte))) fail("media hash collision.");
      media.set(profilePhoto.path, bytes);
    }
    peopleRecords.push({
      addressLine: person.addressLine,
      ...(person.birthDate ? { birthDate: person.birthDate } : {}),
      birthDatePrecision: person.birthDatePrecision,
      city: person.city,
      country: person.country,
      createdAt: exactInstant(person.createdAt),
      ...(person.deathDate ? { deathDate: person.deathDate } : {}),
      displayName: person.displayName,
      gender: person.gender,
      id: person.id,
      notes: person.notes,
      postalCode: person.postalCode,
      ...(profilePhoto ? { profilePhoto } : {}),
      province: person.province,
      schemaVersion: SCHEMA_VERSION,
      treeId: person.treeId
    });
  }
  if (media.size > MAX_MEDIA) fail("media count is outside the limit.");
  const manifest = {
    counts: { media: media.size, people: people.length, relationships: relationships.length },
    createdAt: exactInstant(exportedAt),
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    hashAlgorithm: "sha256",
    schemaVersion: SCHEMA_VERSION,
    treeId: tree.id
  };
  const treeRecord = {
    createdAt: exactInstant(tree.createdAt),
    id: tree.id,
    ...(tree.lastSelectedPersonId ? { lastSelectedPersonId: tree.lastSelectedPersonId } : {}),
    schemaVersion: SCHEMA_VERSION,
    title: tree.title,
    updatedAt: exactInstant(tree.updatedAt)
  };
  const relationshipRecords = relationships.map((relationship) => ({
    createdAt: exactInstant(relationship.createdAt),
    fromPersonId: relationship.fromPersonId,
    id: relationship.id,
    kind: relationship.kind,
    ...(relationship.marriageDate ? { marriageDate: relationship.marriageDate } : {}),
    schemaVersion: SCHEMA_VERSION,
    subtype: relationship.subtype,
    toPersonId: relationship.toPersonId,
    treeId: relationship.treeId
  }));
  const files = new Map<string, Uint8Array>([
    ["manifest.json", encoder.encode(stable(manifest))],
    ["tree.json", encoder.encode(stable(treeRecord))],
    ["people.jsonl", encoder.encode(peopleRecords.map(stable).map((line) => `${line}\n`).join(""))],
    ["relationships.jsonl", encoder.encode(relationshipRecords.map(stable).map((line) => `${line}\n`).join(""))]
  ]);
  for (const [path, bytes] of media) files.set(path, bytes);
  const checksums = (await Promise.all([...files].sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(async ([path, bytes]) => `${await sha256(bytes)}  ${path}\n`))).join("");
  files.set("checksums.sha256", encoder.encode(checksums));
  return files;
}

export async function exportHeritgArchive(
  data: AppData,
  treeId: string,
  password: string
): Promise<Uint8Array> {
  const files = await archiveEntries(data, treeId, new Date());
  const zip = encodeHeritgZip(files);
  return sealZip(zip, password);
}

const object = (value: unknown, label: string): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as JsonObject;
};
const text = (value: unknown, label: string, maximum = MAX_SHORT_BYTES): string => {
  if (typeof value !== "string" || encoder.encode(value).byteLength > maximum) fail(`${label} is invalid.`);
  return value as string;
};
const integer = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid.`);
  return value as number;
};
const nullableText = (value: unknown, label: string): string | undefined =>
  value === null || value === undefined ? undefined : text(value, label);
const parsedJson = (bytes: Uint8Array, label: string): JsonObject => {
  try { return object(JSON.parse(strictText(bytes)), label); } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid .heritg")) throw error;
    return fail(`${label} is not valid JSON.`);
  }
};
const jsonLines = (bytes: Uint8Array, label: string, maximum: number): JsonObject[] => {
  if (!bytes.byteLength) return [];
  const value = strictText(bytes);
  if (!value.endsWith("\n") || value.includes("\r")) fail(`${label} must use one LF-terminated object per line.`);
  const lines = value.slice(0, -1).split("\n");
  if (lines.length > maximum || lines.some((line) => !line)) fail(`${label} record count is invalid.`);
  return lines.map((line, index) => parsedJson(encoder.encode(line), `${label} record ${index}`));
};
const exactArchiveInstant = (value: unknown, label: string): string => {
  const result = text(value, label, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) ||
      new Date(result).toISOString() !== result) fail(`${label} is not a canonical UTC instant.`);
  return result;
};
const calendarDate = (value: unknown, label: string): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const result = text(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T00:00:00.000Z`).toISOString().slice(0, 10) !== result) {
    fail(`${label} is not a calendar date.`);
  }
  return result;
};

async function verifyChecksums(files: Map<string, Uint8Array>) {
  const checksumBytes = files.get("checksums.sha256") ?? fail("checksums.sha256 is missing.");
  const contents = strictText(checksumBytes);
  if (!contents.endsWith("\n") || contents.includes("\r")) fail("checksum file is malformed.");
  const listed = new Set<string>();
  for (const line of contents.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line) ?? fail("checksum line is malformed.");
    if (match[2] === "checksums.sha256" || listed.has(match[2])) fail("checksum line is malformed.");
    const bytes = files.get(match[2]) ?? fail("checksum path is missing.");
    if (await sha256(bytes) !== match[1]) fail("archive checksum does not match.");
    listed.add(match[2]);
  }
  const expected = new Set([...files.keys()].filter((path) => path !== "checksums.sha256"));
  if (listed.size !== expected.size || [...expected].some((path) => !listed.has(path))) fail("checksum path set is incomplete.");
}

async function dataFromZip(zip: Uint8Array, into?: AppData): Promise<AppData> {
  const files = decodeHeritgZip(zip);
  await verifyChecksums(files);
  const required = new Set(["manifest.json", "tree.json", "people.jsonl", "relationships.jsonl", "checksums.sha256"]);
  const mediaPaths = [...files.keys()].filter((path) => path.startsWith("media/"));
  if (mediaPaths.length > MAX_MEDIA || [...files.keys()].some((path) => !required.has(path) && !path.startsWith("media/")) ||
      [...required].some((path) => !files.has(path))) fail("archive entry set is invalid.");
  const manifest = parsedJson(files.get("manifest.json")!, "manifest");
  if (manifest.format !== FORMAT || manifest.formatVersion !== FORMAT_VERSION || manifest.schemaVersion !== SCHEMA_VERSION ||
      manifest.hashAlgorithm !== "sha256") fail("manifest format or version is unsupported.");
  const counts = object(manifest.counts, "manifest.counts");
  const treeRecord = parsedJson(files.get("tree.json")!, "tree");
  if (treeRecord.schemaVersion !== SCHEMA_VERSION || treeRecord.id !== manifest.treeId) fail("tree schema does not match manifest.");
  const peopleRecords = jsonLines(files.get("people.jsonl")!, "people", MAX_PEOPLE);
  const relationshipRecords = jsonLines(files.get("relationships.jsonl")!, "relationships", MAX_RELATIONSHIPS);
  if (integer(counts.people, "counts.people") !== peopleRecords.length ||
      integer(counts.relationships, "counts.relationships") !== relationshipRecords.length ||
      integer(counts.media, "counts.media") !== mediaPaths.length) fail("manifest counts do not match entries.");
  exactArchiveInstant(manifest.createdAt, "manifest.createdAt");
  const treeId = text(treeRecord.id, "tree.id");
  const tree: FamilyTree = {
    id: treeId,
    title: text(treeRecord.title, "tree.title"),
    createdAt: exactArchiveInstant(treeRecord.createdAt, "tree.createdAt"),
    updatedAt: exactArchiveInstant(treeRecord.updatedAt, "tree.updatedAt"),
    lastSelectedPersonId: nullableText(treeRecord.lastSelectedPersonId, "tree.lastSelectedPersonId")
  };
  const referencedMedia = new Set<string>();
  const people: Person[] = [];
  for (const [index, record] of peopleRecords.entries()) {
    if (record.schemaVersion !== SCHEMA_VERSION) fail(`person ${index} schema is unsupported.`);
    const birthDate = calendarDate(record.birthDate, `person ${index}.birthDate`);
    const deathDate = calendarDate(record.deathDate, `person ${index}.deathDate`);
    if (birthDate && deathDate && deathDate < birthDate) fail(`person ${index} dates are invalid.`);
    let photoDataUrl: string | undefined;
    if (record.profilePhoto !== null && record.profilePhoto !== undefined) {
      const reference = object(record.profilePhoto, `person ${index}.profilePhoto`);
      const path = text(reference.path, "media.path");
      const media = files.get(path) ?? fail("media reference is missing.");
      if (media.byteLength > MAX_MEDIA_BYTES ||
          integer(reference.byteSize, "media.byteSize") !== media.byteLength) fail("media reference is invalid.");
      const actual = await mediaInfo(media);
      if (actual.path !== path || actual.sha256 !== reference.sha256 || actual.mimeType !== reference.mimeType) {
        fail("media identity does not match its content.");
      }
      referencedMedia.add(path);
      photoDataUrl = `data:${actual.mimeType};base64,${encodeBase64(media)}`;
    }
    people.push({
      id: text(record.id, `person ${index}.id`),
      treeId: text(record.treeId, `person ${index}.treeId`),
      displayName: text(record.displayName, `person ${index}.displayName`),
      gender: text(record.gender, `person ${index}.gender`) as Gender,
      createdAt: exactArchiveInstant(record.createdAt, `person ${index}.createdAt`),
      birthDate,
      deathDate,
      birthDatePrecision: text(record.birthDatePrecision, `person ${index}.birthDatePrecision`) as Person["birthDatePrecision"],
      notes: text(record.notes, `person ${index}.notes`, MAX_NOTES_BYTES),
      addressLine: text(record.addressLine, `person ${index}.addressLine`),
      city: text(record.city, `person ${index}.city`),
      province: text(record.province, `person ${index}.province`),
      country: text(record.country, `person ${index}.country`),
      postalCode: text(record.postalCode, `person ${index}.postalCode`),
      photoDataUrl
    });
  }
  if (referencedMedia.size !== mediaPaths.length || mediaPaths.some((path) => !referencedMedia.has(path))) {
    fail("archive has unreferenced media.");
  }
  const relationships: FamilyRelationship[] = relationshipRecords.map((record, index) => {
    if (record.schemaVersion !== SCHEMA_VERSION) fail(`relationship ${index} schema is unsupported.`);
    return {
      id: text(record.id, `relationship ${index}.id`),
      treeId: text(record.treeId, `relationship ${index}.treeId`),
      fromPersonId: text(record.fromPersonId, `relationship ${index}.fromPersonId`),
      toPersonId: text(record.toPersonId, `relationship ${index}.toPersonId`),
      kind: text(record.kind, `relationship ${index}.kind`) as RelationshipKind,
      subtype: text(record.subtype, `relationship ${index}.subtype`) as RelationshipSubtype,
      createdAt: exactArchiveInstant(record.createdAt, `relationship ${index}.createdAt`),
      marriageDate: calendarDate(record.marriageDate, `relationship ${index}.marriageDate`)
    };
  });
  const imported = validateAppData({
    version: 1,
    trees: [tree],
    people,
    relationships,
    selectedTreeId: tree.id,
    language: into?.language ?? "en",
    viewports: { [tree.id]: { scrollX: 0, scrollY: 0, zoom: 1 } }
  });
  if (!into) return imported;
  const target = validateAppData(into);
  const used = new Set([...target.trees, ...target.people, ...target.relationships].map((item) => item.id));
  if ([tree.id, ...people.map((person) => person.id), ...relationships.map((item) => item.id)].some((id) => used.has(id))) {
    fail("an imported identifier already exists; no data was changed.");
  }
  return validateAppData({
    version: 1,
    trees: [...target.trees, tree],
    people: [...target.people, ...people],
    relationships: [...target.relationships, ...relationships],
    selectedTreeId: tree.id,
    language: target.language,
    viewports: { ...target.viewports, [tree.id]: { scrollX: 0, scrollY: 0, zoom: 1 } }
  });
}

export async function importHeritgArchive(
  source: ArrayBuffer | Uint8Array,
  password = "",
  options: BackupImportOptions = {}
): Promise<AppData> {
  const bytes = bytesOf(source);
  switch (heritgArchiveProtection(bytes)) {
    case "legacy-unencrypted":
      return importNativeHeritgArchive(bytes, options);
    case "legacy-encrypted":
      return importNativeHeritgArchive(await openLegacyEnvelope(bytes, password), options);
    case "encrypted":
      return dataFromZip(await openEnvelope(bytes, password), options.into);
    case "unencrypted":
      return dataFromZip(bytes, options.into);
  }
}
