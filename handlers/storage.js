// ========================================
// handlers/storage.js — Property & CSV persistence
// ========================================
// Extracted from service.js (verbatim, zero behavior change) so the
// orchestrator stays lean. Handles:
//   - property ID allocation (PROPERTY_ROOT folder scan)
//   - property folder creation (photos/documents/history + property.json)
//   - CSV output with header migration
// ========================================
import fs from 'fs';
import { join, dirname } from 'path';
import { getRentDefaults, calculateRentCommission } from '../lib/commission.js';
import { config } from '../config.js';

// ========================================
// CONSTANTS
// ========================================
// Paths come from config (project-root-relative defaults, env-overridable)
// — previously hardcoded to the old machine's /home/metropolis2/... paths,
// which broke after the Linux migration (EACCES/ENOENT).
const PROPERTY_ROOT = config.PROPERTY_ROOT;
const START_ID = 100;
const CSV_PATH = config.CSV_OUTPUT_PATH;

// ========================================
// HELPER: Get next property ID
// ========================================
export function getNextPropertyId() {
  if (!fs.existsSync(PROPERTY_ROOT)) {
    fs.mkdirSync(PROPERTY_ROOT, { recursive: true });
    return START_ID;
  }

  const folders = fs.readdirSync(PROPERTY_ROOT);
  const numericFolders = folders
    .map(f => parseInt(f))
    .filter(n => !isNaN(n) && n >= START_ID);

  if (numericFolders.length === 0) return START_ID;
  return Math.max(...numericFolders) + 1;
}

// ========================================
// HELPER: Create property folder
// ========================================
export function createPropertyFolder(propertyId, data) {
  const folderPath = join(PROPERTY_ROOT, String(propertyId));

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.mkdirSync(join(folderPath, 'photos'), { recursive: true });
    fs.mkdirSync(join(folderPath, 'documents'), { recursive: true });
    fs.mkdirSync(join(folderPath, 'history'), { recursive: true });
  }

  const jsonPath = join(folderPath, 'property.json');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

  return folderPath;
}

// ========================================
// HELPER: Format phone for Lovable
// ========================================
export function formatPhoneForLovable(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('389')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.startsWith('00389')) {
    cleaned = cleaned.substring(5);
  }
  if (cleaned.length === 9) {
    return `${cleaned.substring(0, 3)}/${cleaned.substring(3, 6)}-${cleaned.substring(6, 9)}`;
  }
  return phone;
}

// ========================================
// HELPER: Save to CSV
// ========================================
function csvBool(value) {
  return value === undefined || value === null ? '' : String(value);
}
function csvNum(value) {
  return value === undefined || value === null ? '' : value;
}

export function saveToCSV(data, phone, propertyId) {
  const dir = dirname(CSV_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const csvPath = CSV_PATH;
  const isRent = data.transactionType === 'rent';

  let headers = [
    'phone', 'formattedPhone', 'propertyId',
    'transactionType'
  ];

  if (isRent) {
    headers = headers.concat([
      'monthlyRent',
      'availableFrom',
      'depositMonths',
      'minimumStayMonths',
      'advanceRentMonths',
      'ownerCommissionFee',
      'tenantCommissionFee',
      'totalCommissionFee',
      'commissionRule'
    ]);
  } else {
    headers = headers.concat(['price']);
  }

  headers = headers.concat([
    'sqm', 'hasTerrace', 'terraceSqm',
    'bedrooms', 'floor', 'totalFloors', 'elevator',
    'heating', 'heatingType', 'ac', 'parking', 'parkingType',
    'parkingSeparate', 'parkingPrice',
    'orientation', 'orientationPrimary', 'orientationSecondary',
    'furnished', 'furnishedLevel',
    'yearBuilt', 'renovated', 'renovationYear',
    'documentationClean', 'documentationIssues',
    'photosPermission', 'photosSource', 'photosStatus', 'photosPending', 'photosManagerReview',
    'ownerName', 'address'
  ]);

  let row = [
    phone || '',
    formatPhoneForLovable(phone || ''),
    propertyId || '',
    data.transactionType || 'sale'
  ];

  if (isRent) {
    const rentDefaults = getRentDefaults();
    const commission = data.monthlyRent ? calculateRentCommission(data.monthlyRent) : null;
    row = row.concat([
      data.monthlyRent || '',
      data.availableFrom || '',
      data.depositMonths || rentDefaults.depositMonths,
      data.minimumStayMonths || rentDefaults.minimumStayMonths,
      data.advanceRentMonths || rentDefaults.advanceRentMonths,
      commission ? commission.ownerFee : '',
      commission ? commission.tenantFee : '',
      commission ? commission.totalFee : '',
      commission ? commission.rule : ''
    ]);
  } else {
    row = row.concat([data.cleanPrice || '']);
  }

  row = row.concat([
    csvNum(data.totalSqm),
    csvBool(data.hasTerrace),
    data.terraceSqm !== undefined && data.terraceSqm !== null ? data.terraceSqm : '',
    csvNum(data.bedrooms),
    csvNum(data.floor),
    csvNum(data.totalFloors),
    csvBool(data.elevator),
    data.heating || '',
    data.heatingType || '',
    csvBool(data.ac),
    csvBool(data.parking),
    data.parkingType || '',
    csvBool(data.parkingSeparate),
    csvNum(data.parkingPrice),
    data.orientation || '',
    data.orientationPrimary || '',
    data.orientationSecondary || '',
    csvBool(data.furnished),
    data.furnishedLevel || '',
    csvNum(data.yearBuilt),
    csvBool(data.renovated),
    csvNum(data.renovationYear),
    csvBool(data.documentationClean),
    data.documentationIssues || '',
    csvBool(data.photosPermission),
    data.photosSource || '',
    data.photosStatus || '',
    csvBool(data.photosPending),
    csvBool(data.photosManagerReview),
    data.ownerName || '',
    data.address || ''
  ]);

  const exists = fs.existsSync(csvPath);
  const line = row.join(',') + '\n';
  const headerLine = headers.join(',');

  if (!exists) {
    fs.writeFileSync(csvPath, headerLine + '\n' + line);
  } else {
    const existing = fs.readFileSync(csvPath, 'utf8');
    const existingLines = existing.split('\n');
    const firstLine = existingLines[0] || '';
    // TYPE-AWARE HEADER COMPATIBILITY (reported): the append check must test
    // the CURRENT call's header columns — the rent and sale layouts differ
    // (rent: monthlyRent/availableFrom/deposit…; sale: a single price column).
    // A RENT-header file receiving a SALE row (or vice versa) must go through
    // migration, otherwise the row misaligns with the on-disk header. Checking
    // only a few known column names let a rent header (which contains
    // availableFrom too) pass for a SALE write and append a misaligned row.
    const existingHeaderCols = firstLine.split(',');
    const headerCompatible = headers.every(h => existingHeaderCols.includes(h));
    if (headerCompatible) {
      // Header already has ALL current columns — append normally
      fs.appendFileSync(csvPath, line);
    } else if (existing.trim() === '') {
      // File exists but is empty (0 bytes / blank) — write header + line
      // directly, otherwise the migration path would emit a leading blank line.
      fs.writeFileSync(csvPath, headerLine + '\n' + line);
    } else {
      // Header migration: the existing CSV was written before the CURRENT
      // header gained columns — parkingSeparate/parkingPrice, availableFrom,
      // and photosPending in earlier changes (the on-disk file predates
      // them). Rewrite with the new header and re-map every old row BY
      // COLUMN NAME,
      // so any column missing from the old file becomes empty. This stays
      // correct for sale (old 32 cols → new 35), rent (old 40 → new 43) and
      // any column added at any point in time. Rows whose part count deviates
      // from the OLD header length (e.g. a comma inside an address value)
      // are left byte-identical to avoid misalignment.
      const oldHeader = firstLine.split(',');
      const migrated = existingLines
        .map(l => {
          if (l.trim() === '') return l;
          if (l === firstLine) return headerLine;
          const parts = l.split(',');
          if (parts.length !== oldHeader.length) return l;
          const rowMap = {};
          oldHeader.forEach((name, i) => { rowMap[name] = parts[i]; });
          return headers.map(name => rowMap[name] !== undefined ? rowMap[name] : '').join(',');
        })
        .join('\n');
      fs.writeFileSync(csvPath, migrated.trimEnd() + '\n' + line);
      console.log(`[CSV MIGRATED: added ${headers.length - oldHeader.length} column(s), re-mapped ${existingLines.length - 1} existing rows by name]`);
    }
  }

  console.log(`[CSV SAVED: ${row.join(', ')}]`);
}
