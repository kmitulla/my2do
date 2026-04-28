/**
 * Lightweight browser-side .msg (Outlook OLE2/CFB) parser.
 * Extracts Subject, From, To, Body from an ArrayBuffer.
 * 
 * .msg is a Compound File Binary (CFB/OLE2). We use a simple
 * approach: scan the raw UTF-16LE strings from the binary.
 */

// Decode a UTF-16LE byte array to a string
function decodeUTF16LE(bytes) {
  const arr = new Uint16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  return String.fromCharCode(...arr);
}

// Find a readable ASCII/UTF-16 string around a known marker
function extractFieldFromBytes(bytes, markerHex) {
  // We'll look for known MAPI property IDs in the raw stream
  // and read the following string data
}

/**
 * Parse a .msg file ArrayBuffer and return { subject, from, to, cc, date, body }
 * 
 * Strategy: scan for UTF-16LE encoded strings in the raw binary.
 * Most text fields in .msg are stored as UTF-16LE.
 */
export function parseMsgFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // Helper: find all UTF-16LE strings of length >= minLen
  function findUTF16Strings(minLen = 4) {
    const results = [];
    let i = 0;
    while (i < bytes.length - 1) {
      // Check if this looks like a UTF-16LE string start (printable ASCII range)
      if (bytes[i] >= 0x20 && bytes[i] <= 0x7E && bytes[i + 1] === 0x00) {
        let j = i;
        let str = "";
        while (j < bytes.length - 1 && bytes[j + 1] === 0x00 && bytes[j] >= 0x20 && bytes[j] <= 0x7E) {
          str += String.fromCharCode(bytes[j]);
          j += 2;
        }
        if (str.length >= minLen) {
          results.push({ offset: i, str });
          i = j;
          continue;
        }
      }
      i++;
    }
    return results;
  }

  // Helper: extract plain text (ASCII) strings from binary
  function findASCIIStrings(minLen = 4) {
    const results = [];
    let i = 0;
    while (i < bytes.length) {
      if (bytes[i] >= 0x20 && bytes[i] <= 0x7E) {
        let j = i;
        let str = "";
        while (j < bytes.length && bytes[j] >= 0x20 && bytes[j] <= 0x7E) {
          str += String.fromCharCode(bytes[j]);
          j++;
        }
        if (str.length >= minLen) {
          results.push({ offset: i, str });
          i = j;
          continue;
        }
      }
      i++;
    }
    return results;
  }

  const utf16Strings = findUTF16Strings(3);
  const asciiStrings = findASCIIStrings(4);

  // Known patterns to identify fields
  // In .msg files, field names appear before their values
  let subject = "";
  let from = "";
  let to = "";
  let body = "";
  let date = "";

  // Search UTF-16 strings for email-like content
  // The subject is typically a short UTF-16 string after the "Subject:" marker
  // We look for known markers in ASCII too
  
  // Try to find Subject from ASCII: look for "Subject:" or "Betreff:" label
  // In the .msg binary, property tags identify fields numerically.
  // Property 0x0037 = Subject, 0x0C1A = SenderName, 0x0076 = ReceivedByEmailAddress
  // We look for these as little-endian uint32 property tags in the stream.

  const view = new DataView(arrayBuffer);

  function searchPropertyValue(propId) {
    // MAPI property tags are stored as 4-byte LE: (type << 16) | propId
    // Common types: 0x001F = PT_UNICODE (UTF-16LE), 0x001E = PT_STRING8
    const tag1 = (0x001F << 16) | propId; // Unicode
    const tag2 = (0x001E << 16) | propId; // ASCII

    for (let i = 0; i < bytes.length - 8; i++) {
      const val = view.getUint32(i, true);
      if (val === tag1 || val === tag2) {
        const isUnicode = (val >>> 16) === 0x001F;
        // Next 4 bytes = size
        const size = view.getUint32(i + 4, true);
        if (size > 0 && size < 100000 && i + 8 + size <= bytes.length) {
          const strBytes = bytes.slice(i + 8, i + 8 + size);
          if (isUnicode) {
            // Remove null terminator
            const chars = [];
            for (let k = 0; k < strBytes.length - 1; k += 2) {
              const code = strBytes[k] | (strBytes[k + 1] << 8);
              if (code === 0) break;
              chars.push(String.fromCharCode(code));
            }
            return chars.join("");
          } else {
            // ASCII
            let s = "";
            for (let k = 0; k < strBytes.length; k++) {
              if (strBytes[k] === 0) break;
              s += String.fromCharCode(strBytes[k]);
            }
            return s;
          }
        }
      }
    }
    return "";
  }

  // MAPI property IDs
  subject = searchPropertyValue(0x0037); // PR_SUBJECT
  from    = searchPropertyValue(0x0C1A); // PR_SENDER_NAME
  const fromEmail = searchPropertyValue(0x0C1F); // PR_SENDER_EMAIL_ADDRESS
  to      = searchPropertyValue(0x0E04); // PR_DISPLAY_TO
  const bodyText  = searchPropertyValue(0x1000); // PR_BODY (plain text)
  const bodyHtml  = searchPropertyValue(0x1013); // PR_HTML (body HTML, stored as binary/ASCII)
  date    = searchPropertyValue(0x0039); // PR_CLIENT_SUBMIT_TIME (usually binary, skip if garbage)

  // Build "From" string
  if (from && fromEmail) from = `${from} <${fromEmail}>`;
  else if (fromEmail) from = fromEmail;

  // Body: prefer HTML
  body = bodyHtml || bodyText.replace(/\n/g, "<br>");

  // Fallback: scan UTF-16 strings for subject if not found via property
  if (!subject && utf16Strings.length > 0) {
    // Subject is usually a short-ish standalone string
    const candidates = utf16Strings.filter((s) => s.str.length > 2 && s.str.length < 200 && !s.str.startsWith("http") && !s.str.includes("\\"));
    if (candidates.length > 0) subject = candidates[0].str;
  }

  // Fallback for "from" — look for SMTP: pattern in ASCII
  if (!from) {
    const smtpMatch = asciiStrings.find((s) => s.str.startsWith("SMTP:"));
    if (smtpMatch) from = smtpMatch.str.replace("SMTP:", "");
  }

  // Clean up date (if binary garbage, discard)
  if (date && !/\d{4}/.test(date)) date = "";

  return { subject, from, to, cc: "", date, body };
}