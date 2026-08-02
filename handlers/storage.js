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
import { join } from 'path';
import { getRentDefaults, calculateRentCommission } from '../lib/commission.js';

// ========================================
// CONSTANTS
// ========================================
const PROPERTY_ROOT = '/home/metropolis2/Documents/NEKRETNINI_EVBR';
const START_ID = 100;
const CSV_PATH = '/home/metropolis2/real-estate-atoms/data/collected-leads.csv';

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
  const dir = '/home/metropolis2/real-estate-atoms/data';
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
    'photosPermission', 'photosSource', 'photosStatus', 'photosPending',
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
    if (firstLine.includes('parkingSeparate') && firstLine.includes('parkingPrice')) {
      // Header already has the new columns — append normally
      fs.appendFileSync(csvPath, line);
    } else if (existing.trim() === '') {
      // File exists but is empty (0 bytes / blank) — write header + line
      // directly, otherwise the migration path would emit a leading blank line.
      fs.writeFileSync(csvPath, headerLine + '\n' + line);
    } else {
      // Header migration: the existing CSV was written before the CURRENT
      // header gained columns — parkingSeparate/parkingPrice now, and
      // photosPending in an earlier change (the on-disk file predates it).
      // Rewrite with the new header and re-map every old row BY COLUMN NAME,
      // so any column missing from the old file becomes empty. This stays
      // correct for sale (old 32 cols → new 35), rent (old 40 → new 42) and
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
