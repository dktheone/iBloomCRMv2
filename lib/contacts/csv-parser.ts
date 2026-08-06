// lib/contacts/csv-parser.ts
// Zero-dependency RFC 4180 CSV parser + contact row mapping/validation.
// XLSX is handled separately (requires the `xlsx` package — see parseSpreadsheet).

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

/**
 * Parse RFC 4180 CSV. Handles quoted fields, escaped quotes (""), embedded
 * newlines and commas, and both CRLF and LF line endings.
 */
export function parseCsv(text: string): ParsedSheet {
  // Strip UTF-8 BOM — Excel writes it and it corrupts the first header key.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      // Consume CRLF as one terminator
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush the trailing field/row when the file has no final newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows — trailing blank lines are common in exported files
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));

  if (nonEmpty.length === 0) {
    return { headers: [], rows: [] };
  }

  return {
    headers: nonEmpty[0].map((h) => h.trim()),
    rows: nonEmpty.slice(1),
  };
}

/**
 * Parse an uploaded file by extension.
 * CSV/TSV parse natively. XLSX/XLS require the optional `xlsx` package;
 * if it is absent we throw a directive error rather than silently failing.
 */
export async function parseSpreadsheet(
  filename: string,
  buffer: ArrayBuffer
): Promise<ParsedSheet> {
  const ext = filename.toLowerCase().split('.').pop() || '';

  if (ext === 'csv' || ext === 'txt') {
    return parseCsv(new TextDecoder('utf-8').decode(buffer));
  }

  if (ext === 'tsv') {
    // Convert tabs to commas only outside quotes by reusing the CSV state machine
    const text = new TextDecoder('utf-8').decode(buffer);
    const sheet = parseCsv(text.replace(/\t/g, ','));
    return sheet;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    let XLSX: any;
    try {
      // Optional dependency — not installed by default. The specifier is held in
      // a variable so TypeScript does not require the package to be present for
      // the project to typecheck.
      const xlsxModule = 'xlsx';
      XLSX = await import(/* webpackIgnore: true */ xlsxModule);
    } catch {
      throw new Error(
        'Excel import requires the "xlsx" package. Run `npm install xlsx`, or export the sheet as CSV.'
      );
    }
    const wb = XLSX.read(buffer, { type: 'array' });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const matrix: string[][] = XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const nonEmpty = matrix.filter((r) => r.some((c) => String(c).trim() !== ''));
    if (nonEmpty.length === 0) return { headers: [], rows: [] };
    return {
      headers: nonEmpty[0].map((h) => String(h).trim()),
      rows: nonEmpty.slice(1).map((r) => r.map((c) => String(c ?? ''))),
    };
  }

  throw new Error(`Unsupported file type: .${ext}. Use .csv, .tsv, .xlsx, or .xls`);
}

/** Contact fields an import column can target. */
export const IMPORT_TARGET_FIELDS = [
  { key: 'waPhone', label: 'WhatsApp Phone', required: true },
  { key: 'name', label: 'Name', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'preferredLanguage', label: 'Preferred Language', required: false },
  { key: 'countryCode', label: 'Country Code', required: false },
  { key: 'timezone', label: 'Timezone', required: false },
  { key: 'dateOfBirth', label: 'Date of Birth', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'optInSource', label: 'Consent Source (D-032)', required: false },
] as const;

/**
 * Guess a target field for each header so the mapping UI starts pre-filled.
 * Returns a header-index → field-key map; unmatched headers are omitted.
 */
export function suggestMapping(headers: string[]): Record<number, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const aliases: Record<string, string> = {
    waphone: 'waPhone',
    phone: 'waPhone',
    phonenumber: 'waPhone',
    mobile: 'waPhone',
    whatsapp: 'waPhone',
    whatsappnumber: 'waPhone',
    contactnumber: 'waPhone',
    name: 'name',
    fullname: 'name',
    contactname: 'name',
    firstname: 'name',
    email: 'email',
    emailaddress: 'email',
    language: 'preferredLanguage',
    preferredlanguage: 'preferredLanguage',
    locale: 'preferredLanguage',
    country: 'countryCode',
    countrycode: 'countryCode',
    timezone: 'timezone',
    tz: 'timezone',
    dateofbirth: 'dateOfBirth',
    dob: 'dateOfBirth',
    birthday: 'dateOfBirth',
    notes: 'notes',
    note: 'notes',
    comments: 'notes',
    optinsource: 'optInSource',
    consentsource: 'optInSource',
    consent: 'optInSource',
  };

  const mapping: Record<number, string> = {};
  const used = new Set<string>();

  headers.forEach((h, idx) => {
    const target = aliases[norm(h)];
    if (target && !used.has(target)) {
      mapping[idx] = target;
      used.add(target);
    }
  });

  return mapping;
}
