/**
 * Browser-compatible .msg (OLE2/CFB) parser.
 * Reads directory entries named "__substg1.0_PPPPTTTT" where
 * PPPP = property ID (hex), TTTT = type (hex).
 */

function readUint32LE(buf, offset) {
  return ((buf[offset] | (buf[offset+1] << 8) | (buf[offset+2] << 16) | (buf[offset+3] << 24)) >>> 0);
}
function readUint16LE(buf, offset) {
  return (buf[offset] | (buf[offset+1] << 8)) >>> 0;
}

function utf16leToString(data) {
  const chars = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = data[i] | (data[i+1] << 8);
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

function latin1ToString(data) {
  let s = "";
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) break;
    s += String.fromCharCode(data[i]);
  }
  return s;
}

export function parseMsgFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // Validate OLE2 magic
  if (bytes[0] !== 0xD0 || bytes[1] !== 0xCF) {
    return { subject: "", from: "", to: "", cc: "", date: "", body: "" };
  }

  const secSizeExp = readUint16LE(bytes, 30);
  const secSize = Math.pow(2, secSizeExp); // typically 512

  // Build FAT from DIFAT (first 109 entries in header at offset 76)
  const fat = new Array(bytes.length / secSize + 1).fill(0xFFFFFFFF);
  for (let di = 0; di < 109; di++) {
    const fatSec = readUint32LE(bytes, 76 + di * 4);
    if (fatSec >= 0xFFFFFFFA) break;
    const off = (fatSec + 1) * secSize;
    for (let i = 0; i < secSize / 4; i++) {
      fat[fatSec * (secSize / 4) + i] = readUint32LE(bytes, off + i * 4);
    }
    // Rebuild as flat array indexed by sector id
  }

  // Simpler FAT: just read all FAT sectors in order
  const flatFat = [];
  for (let di = 0; di < 109; di++) {
    const fatSec = readUint32LE(bytes, 76 + di * 4);
    if (fatSec >= 0xFFFFFFFA) break;
    const off = (fatSec + 1) * secSize;
    for (let i = 0; i < secSize / 4; i++) {
      flatFat.push(readUint32LE(bytes, off + i * 4));
    }
  }

  function followChain(start) {
    const sectors = [];
    let cur = start;
    let guard = 0;
    while (cur < 0xFFFFFFFA && cur < flatFat.length && guard++ < 10000) {
      sectors.push(cur);
      cur = flatFat[cur];
    }
    return sectors;
  }

  function readStreamData(startSector, size) {
    const sectors = followChain(startSector);
    const buf = new Uint8Array(sectors.length * secSize);
    for (let i = 0; i < sectors.length; i++) {
      const off = (sectors[i] + 1) * secSize;
      buf.set(bytes.slice(off, off + secSize), i * secSize);
    }
    return buf.slice(0, size);
  }

  // Mini stream support
  const miniStreamCutoff = readUint32LE(bytes, 56); // usually 4096
  const firstMiniFATSector = readUint32LE(bytes, 60);
  
  // Read mini FAT
  const miniFat = [];
  if (firstMiniFATSector < 0xFFFFFFFA) {
    const mfSectors = followChain(firstMiniFATSector);
    for (const s of mfSectors) {
      const off = (s + 1) * secSize;
      for (let i = 0; i < secSize / 4; i++) {
        miniFat.push(readUint32LE(bytes, off + i * 4));
      }
    }
  }

  // Read directory
  const firstDirSector = readUint32LE(bytes, 48);
  const dirSectors = followChain(firstDirSector);
  const DIRENT = 128;

  // Root entry: sector 0 in directory, gives us mini stream location
  let rootStartSector = 0xFFFFFFFF;
  let rootSize = 0;

  // Parse all directory entries
  const streamMap = {}; // name -> {startSector, size, inMini}

  for (let si = 0; si < dirSectors.length; si++) {
    const secOff = (dirSectors[si] + 1) * secSize;
    const entriesPerSec = secSize / DIRENT;
    for (let ei = 0; ei < entriesPerSec; ei++) {
      const off = secOff + ei * DIRENT;
      const objType = bytes[off + 66];
      const nameLen = readUint16LE(bytes, off + 64);
      if (nameLen < 2) continue;

      const nameChars = [];
      for (let ni = 0; ni < nameLen - 2; ni += 2) {
        nameChars.push(String.fromCharCode(readUint16LE(bytes, off + ni)));
      }
      const name = nameChars.join("");

      const startSector = readUint32LE(bytes, off + 116);
      const size = readUint32LE(bytes, off + 120);

      if (objType === 5 && name === "Root Entry") {
        // Root entry - holds mini stream start
        rootStartSector = startSector;
        rootSize = size;
      } else if (objType === 2) {
        // Stream entry
        const inMini = size < miniStreamCutoff && rootStartSector !== 0xFFFFFFFF;
        streamMap[name] = { startSector, size, inMini };
      }
    }
  }

  // Read mini stream container
  let miniStreamData = null;
  function getMiniStreamData() {
    if (!miniStreamData && rootStartSector < 0xFFFFFFFA) {
      miniStreamData = readStreamData(rootStartSector, rootSize);
    }
    return miniStreamData;
  }

  function readMiniStreamEntry(startSector, size) {
    const miniSectorSize = 64;
    const container = getMiniStreamData();
    if (!container) return new Uint8Array(0);
    
    const sectors = [];
    let cur = startSector;
    let guard = 0;
    while (cur < 0xFFFFFFFA && cur < miniFat.length && guard++ < 10000) {
      sectors.push(cur);
      cur = miniFat[cur];
    }
    
    const buf = new Uint8Array(sectors.length * miniSectorSize);
    for (let i = 0; i < sectors.length; i++) {
      const off = sectors[i] * miniSectorSize;
      buf.set(container.slice(off, off + miniSectorSize), i * miniSectorSize);
    }
    return buf.slice(0, size);
  }

  function readStream(name) {
    const entry = streamMap[name];
    if (!entry) return null;
    if (entry.inMini && miniFat.length > 0) {
      return readMiniStreamEntry(entry.startSector, entry.size);
    }
    return readStreamData(entry.startSector, entry.size);
  }

  // Get property by ID, trying unicode first then ascii
  function getProp(propId) {
    const hex = propId.toString(16).toUpperCase().padStart(4, "0");
    
    // Try Unicode (001F) first
    const uName = `__substg1.0_${hex}001F`;
    const uData = readStream(uName);
    if (uData && uData.length > 0) {
      const s = utf16leToString(uData).trim();
      if (s) return s;
    }

    // Try ASCII (001E)
    const aName = `__substg1.0_${hex}001E`;
    const aData = readStream(aName);
    if (aData && aData.length > 0) {
      const s = latin1ToString(aData).trim();
      if (s) return s;
    }

    return "";
  }

  // Get binary property (e.g. HTML body stored as 0102)
  function getPropBinary(propId) {
    const hex = propId.toString(16).toUpperCase().padStart(4, "0");
    const name = `__substg1.0_${hex}0102`;
    const data = readStream(name);
    return data;
  }

  const subject      = getProp(0x0037); // PR_SUBJECT
  const senderName   = getProp(0x0C1A); // PR_SENDER_NAME
  const senderEmail  = getProp(0x0C1F); // PR_SENDER_EMAIL_ADDRESS (SMTP)
  const senderEmail2 = getProp(0x0065); // PR_SENT_REPRESENTING_EMAIL_ADDRESS (fallback)
  const displayTo    = getProp(0x0E04); // PR_DISPLAY_TO
  const toEmail      = getProp(0x0076); // PR_RECEIVED_BY_EMAIL_ADDRESS (fallback for To email)
  const displayCC    = getProp(0x0E03); // PR_DISPLAY_CC
  const bodyText     = getProp(0x1000); // PR_BODY (plain text)

  // PR_HTML_BODY is binary (0102)
  let bodyHtml = "";
  const htmlData = getPropBinary(0x1013);
  if (htmlData && htmlData.length > 0) {
    try {
      bodyHtml = new TextDecoder("utf-8").decode(htmlData);
    } catch {
      bodyHtml = latin1ToString(htmlData);
    }
  }

  // Build From: "Name <email>"
  const resolvedEmail = senderEmail || senderEmail2;
  let from = "";
  if (senderName && resolvedEmail) from = `${senderName} <${resolvedEmail}>`;
  else if (senderName) from = senderName;
  else if (resolvedEmail) from = resolvedEmail;

  // Build To: append email if missing from displayTo
  let to = displayTo;
  if (toEmail && to && !to.includes("@")) to = `${to} <${toEmail}>`;
  else if (toEmail && !to) to = toEmail;

  const body = bodyHtml || bodyText.replace(/\n/g, "<br>");

  return { subject, from, to, cc: displayCC, date: "", body };
}