export type FieldType = 'Text' | 'Date' | 'Number';

export interface FieldConfig {
  key: string;
  label: string;
  qrLabel: string;
  type: FieldType;
  required: boolean;
  active: boolean;
  inQr: boolean;
  col?: string;
  system?: boolean;
  custom?: boolean;
  help?: string;
  sortOrder?: number;
}

export type PayloadFormat = 'colon' | 'dash' | 'value';
export type BlankHandling = 'omit' | 'show';
export type DuplicateRule = 'keep' | 'skip'; // 'keep' keeps 1st, 'skip' skips all duplicates

export type SizeUnit = 'px' | 'in' | 'cm';
export type CodeType = 'qr' | 'barcode' | 'both';
export type BarcodeFormat = 'CODE128' | 'CODE39';

export interface QRAppearanceSettings {
  codeType?: CodeType; // 'qr' | 'barcode' | 'both' (default 'qr')
  barcodeFormat?: BarcodeFormat; // 'CODE128' | 'CODE39' (default 'CODE128')
  barcodeField?: string; // field to encode in barcode, default 'register_no'
  includeBarcodeText?: boolean; // display text below barcode bars
  sizeUnit?: SizeUnit; // 'px' | 'in' | 'cm'
  sizeValue?: number; // dimension value in sizeUnit
  dpi?: number; // default 300
  size: string; // resolved pixel dimension or preset string e.g. '300' | '600' | '1200'
  format: 'PNG' | 'SVG' | 'JPEG';
  ecc: 'L' | 'M' | 'Q' | 'H';
  quiet: '2' | '4' | '6';
  naming: 'serial' | 'reg' | 'regname' | 'serial_reg' | 'custom';
  /** For naming 'custom': up to 3 parts — field keys, or '__sheet' for the sheet name */
  namingFields?: string[];
  /** For naming 'custom': text placed between the parts */
  namingSeparator?: '_' | '-';
  transparentBackground?: boolean;
}

export interface PrintSettings {
  pageSize: 'A4';
  orientation: 'portrait' | 'landscape';
  codeType?: CodeType; // 'qr' | 'barcode'
  columns: number; // e.g. 3
  rows: number; // e.g. 5
  marginMm: number; // e.g. 10
  spacingMm: number; // e.g. 4
  qrSizeMm: number; // item size in mm, e.g. 45
  sizeUnit?: 'mm' | 'cm' | 'in';
  sizeValue?: number;
  showRegisterNo: boolean;
  showStudentName: boolean;
  showBorder: boolean;
  fontSizePt: number;
}

export interface BatchSummary {
  id: string;
  name: string;
  file: string;
  fileSize?: number;
  date: string;
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  status: 'pending' | 'processing' | 'done' | 'errors' | 'failed' | 'cancelled';
  expiresAt?: string;
  templateSnapshot?: {
    fields: FieldConfig[];
    format: PayloadFormat;
    blank: BlankHandling;
    appearance: QRAppearanceSettings;
  };
  columnMapping?: Record<string, string>;
  createdAt?: string;
}

export interface StudentRecord {
  id?: string;
  batchId?: string;
  sheetName?: string;
  /** 1-based row number of this record inside its sheet */
  rowNumber?: number;
  serialNo?: string;
  registerNo: string;
  name: string;
  course?: string;
  department?: string;
  academicYear?: string;
  bloodGroup?: string;
  dob?: string;
  hostel?: string;
  section?: string;
  emergencyContact?: string;
  validUntil?: string;
  studentData: Record<string, unknown>;
  qrPayload: string;
  status: 'gen' | 'dup' | 'skip' | 'proc' | 'failed';
  errorReason?: string;
  version?: number;
  createdAt?: string;
}

export interface RowValidationIssue {
  rowNumber: number;
  sheetName?: string;
  registerNo?: string;
  studentName?: string;
  status: 'invalid' | 'duplicate';
  errorReason: string;
}

export interface TemplateConfig {
  id: string;
  templateName: string;
  description?: string;
  fieldConfiguration: FieldConfig[];
  printConfiguration: PrintSettings;
  qrAppearance: QRAppearanceSettings;
  isDefault: boolean;
  version: number;
  updatedAt?: string;
}

export interface ImportProfile {
  id: string;
  profileName: string;
  description?: string;
  columnAliases: Record<string, string>;
  fieldMappings: Record<string, string>;
  duplicateRule: DuplicateRule;
  defaultTemplateId?: string;
  filenameConvention: 'reg' | 'regname';
  updatedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  userId?: string;
  userEmail?: string;
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface AppSettings {
  institutionName: string;
  institutionCode: string;
  institutionAddress: string;
  defaultFormat: PayloadFormat;
  defaultBlank: BlankHandling;
  qrDefaults: QRAppearanceSettings;
  retentionDays: number;
  autoDeleteExpired: boolean;
  adminName: string;
  adminEmail: string;
}
