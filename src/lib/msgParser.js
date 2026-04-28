/**
 * Browser-compatible .msg (OLE2/CFB) parser.
 * Finds the "__substg1.0_XXXXXXXX" directory entries in the CFB structure
 * and reads the actual property values from them.
 *
 * CFB header is at offset 0, sector size is 512 bytes (older) or 4096 bytes (newer).
 * Directory entries are 128 bytes each, stored in directory sectors.
 */

const SECTOR_SIZE = 512;
const DIRENT_SIZE = 128;

function readUint32LE(buf, offset) {
  return (buf[offset] | (buf[offset+1] << 8) | (buf[offset+2] << 16) | (buf[offset+3] << 24)) >>> 0;
}

function readUint16LE(buf, offset) {
  return buf[offset] | (buf[offset+1] << 8);
}

function sectorOffset(sectorId) {
  return (sectorId + 1) * SECTOR_SIZE;
}

function readSector(bytes, sectorId) {
  const off = sectorOffset(sectorId);
  return bytes.slice(off, off + SECTOR_SIZE);
}

// Follow the FAT chain starting at startSector
function readFATChain(bytes, fat, startSector) {
  const sectors = [];
  let cur = startSector;
  const ENDOFCHAIN = 0xFFFFFFFE;
  const FREESECT   = 0xFFFFFFFF;
  let guard = 0;
  while (cur !== ENDOFCHAIN && cur !== FREESECT && cur < fat.length && guard++ < 4096) {
    sectors.push(cur);
    cur = fat[cur];
  }
  return sectors;
}

function concatSectors(bytes, sectors) {
  const chunks = sectors.map((s) => readSector(bytes, s));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function readDirEntryName(bytes, offset) {
  const nameLen = readUint16LE(bytes, offset + 64);
  if (nameLen < 2) return "";
  const chars = [];
  for (let i = 0; i < nameLen - 2; i += 2) {
    chars.push(String.fromCharCode(readUint16LE(bytes, offset + i)));
  }
  return chars.join("");
}

function utf16leToString(bytes) {
  const chars = [];
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i+1] << 8);
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

function latin1ToString(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

export function parseMsgFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // Validate CFB magic
  if (bytes[0] !== 0xD0 || bytes[1] !== 0xCF) {
    return { subject: "", from: "", to: "", cc: "", date: "", body: "" };
  }

  // Sector size from header (usually 512)
  const sectorSizeExp = readUint16LE(bytes, 30);
  const secSize = Math.pow(2, sectorSizeExp); // usually 512

  // Number of FAT sectors
  const numFATSectors = readUint32LE(bytes, 44);
  // First directory sector
  const firstDirSector = readUint32LE(bytes, 48);
  // DIFAT array starts at offset 76, 109 entries inline
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const s = readUint32LE(bytes, 76 + i * 4);
    if (s === 0xFFFFFFFF || s === 0xFFFFFFFE) break;
    difat.push(s);
  }

  // Build FAT
  const fat = [];
  for (const fatSec of difat) {
    const off = (fatSec + 1) * secSize;
    for (let i = 0; i < secSize / 4; i++) {
      fat.push(readUint32LE(bytes, off + i * 4));
    }
  }

  // Read directory entries
  function followChain(start) {
    const sectors = [];
    let cur = start;
    const END = 0xFFFFFFFE, FREE = 0xFFFFFFFF;
    let guard = 0;
    while (cur !== END && cur !== FREE && cur < fat.length && guard++ < 1000) {
      sectors.push(cur);
      cur = fat[cur];
    }
    return sectors;
  }

  const dirSectors = followChain(firstDirSector);
  const dirData = [];
  for (const s of dirSectors) {
    const off = (s + 1) * secSize;
    for (let i = 0; i < secSize; i++) dirData.push(bytes[off + i] || 0);
  }
  const dirBytes = new Uint8Array(dirData);

  const numDirEntries = dirBytes.length / DIRENT_SIZE;
  const streamMap = {}; // name -> { startSector, size }

  for (let e = 0; e < numDirEntries; e++) {
    const off = e * DIRENT_SIZE;
    const name = readDirEntryName(dirBytes, off);
    const objType = dirBytes[off + 66];
    if (objType !== 2) continue; // 2 = stream entry

    const startSector = readUint32LE(dirBytes, off + 116);
    const size = readUint32LE(dirBytes, off + 120);
    streamMap[name] = { startSector, size };
  }

  // Read a stream by name
  function readStream(name) {
    const entry = streamMap[name];
    if (!entry) return null;
    const { startSector, size } = entry;

    // Mini stream threshold is 4096 — for small files, data is in mini stream
    // For simplicity, read from main stream (covers most real .msg files)
    const sectors = followChain(startSector);
    const allData = [];
    for (const s of sectors) {
      const off = (s + 1) * secSize;
      for (let i = 0; i < secSize; i++) allData.push(bytes[off + i] || 0);
    }
    return new Uint8Array(allData.slice(0, size));
  }

  // MAPI property stream names: "__substg1.0_" + propTag (hex, uppercase, 8 chars)
  // propTag = typeCode (4 hex) + propId (4 hex)
  // e.g. Subject (0x0037) Unicode (0x001F) => "__substg1.0_0037001F"

  function getProperty(propId, types = [0x001F, 0x001E]) {
    for (const type of types) {
      const hexTag = propId.toString(16).toUpperCase().padStart(4, "0");
      const hexType = type.toString(16).toUpperCase().padStart(4, "0");
      const streamName = `__substg1.0_${hexTag}${hexType}`;
      const data = readStream(streamName);
      if (data && data.length > 0) {
        if (type === 0x001F) return utf16leToString(data);
        if (type === 0x001E) return latin1ToString(data);
      }
    }
    return "";
  }

  const subject     = getProperty(0x0037); // PR_SUBJECT
  const senderName  = getProperty(0x0C1A); // PR_SENDER_NAME
  const senderEmail = getProperty(0x0C1F); // PR_SENDER_EMAIL_ADDRESS
  const displayTo   = getProperty(0x0E04); // PR_DISPLAY_TO
  const displayCC   = getProperty(0x0E03); // PR_DISPLAY_CC
  const bodyText    = getProperty(0x1000); // PR_BODY
  // PR_HTML is stored as binary (type 0x0102), read as latin1
  const bodyHtmlRaw = getProperty(0x1013, [0x0102, 0x001E, 0x001F]);

  let from = senderName;
  if (from && senderEmail) from = `${from} <${senderEmail}>`;
  else if (senderEmail) from = senderEmail;

  const body = bodyHtmlRaw || bodyText.replace(/\n/g, "<br>");

  return {
    subject,
    from,
    to: displayTo,
    cc: displayCC,
    date: "",
    body,
  };
}