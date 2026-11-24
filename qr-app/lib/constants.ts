import { AppSettings, FieldConfig, PrintSettings, QRAppearanceSettings } from "@/types";

export const DEFAULT_APPEARANCE: QRAppearanceSettings = {
  codeType: 'qr',
  barcodeFormat: 'CODE128',
  barcodeField: 'register_no',
  includeBarcodeText: true,
  sizeUnit: 'px',
  sizeValue: 600,
  dpi: 300,
  size: '600',
  format: 'PNG',
  ecc: 'M',
  quiet: '4',
  naming: 'reg',
  transparentBackground: true,
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  pageSize: 'A4',
  orientation: 'portrait',
  codeType: 'qr',
  columns: 3,
  rows: 5,
  marginMm: 12,
  spacingMm: 6,
  qrSizeMm: 45,
  sizeUnit: 'mm',
  sizeValue: 45,
  showRegisterNo: true,
  showStudentName: true,
  showBorder: true,
  fontSizePt: 8,
};

export const EMPTY_SETTINGS: AppSettings = {
  institutionName: '',
  institutionCode: '',
  institutionAddress: '',
  defaultFormat: 'colon',
  defaultBlank: 'omit',
  qrDefaults: DEFAULT_APPEARANCE,
  retentionDays: 30,
  autoDeleteExpired: false,
  adminName: '',
  adminEmail: '',
};

export const DEFAULT_FIELDS: FieldConfig[] = [
  { key: 'serial_no', label: 'Serial Number', qrLabel: 'S.No', type: 'Text', required: false, active: true, inQr: false, col: 'S.No', system: true, help: 'Serial order from Excel sheet (1, 2, 3...)' },
  { key: 'name', label: 'Name', qrLabel: 'Name', type: 'Text', required: true, active: true, inQr: true, col: 'Student Name', system: true, help: 'Student or staff name. Preserves Unicode and Tamil characters' },
  { key: 'register_no', label: 'Register / ID Number', qrLabel: 'Register No', type: 'Text', required: true, active: true, inQr: true, col: 'Register Number', system: true, help: 'Unique student register number or staff/employee ID, leading zeros preserved' },
  { key: 'course', label: 'Course', qrLabel: 'Course', type: 'Text', required: false, active: true, inQr: true, col: 'Course', help: 'Degree or programme name' },
  { key: 'department', label: 'Department', qrLabel: 'Department', type: 'Text', required: false, active: true, inQr: true, col: 'Department', help: 'Academic department' },
  { key: 'academic_year', label: 'Academic Year', qrLabel: 'Academic Year', type: 'Text', required: false, active: true, inQr: true, col: 'Academic Year', help: 'Cohort batch years' },
  { key: 'blood_group', label: 'Blood Group', qrLabel: 'Blood Group', type: 'Text', required: false, active: true, inQr: true, col: 'Blood Group', help: 'Medical blood group' },
  { key: 'dob', label: 'Date of Birth', qrLabel: 'DOB', type: 'Date', required: false, active: true, inQr: true, col: 'DOB', help: 'Date of birth' },
  { key: 'father_name', label: "Father's Name", qrLabel: "Father's Name", type: 'Text', required: false, active: true, inQr: true, col: "Father's Name", help: 'Parent or guardian name' },
  { key: 'aadhar', label: 'Aadhar No.', qrLabel: 'Aadhar No', type: 'Text', required: false, active: true, inQr: true, col: 'Aadhar NO.', help: 'Aadhar identification number' },
  { key: 'address', label: 'Address', qrLabel: 'Address', type: 'Text', required: false, active: true, inQr: true, col: 'Address', help: 'Residential address' },
  { key: 'mobile', label: 'Mobile', qrLabel: 'Mobile', type: 'Text', required: false, active: true, inQr: true, col: 'Mobile', help: 'Mobile contact number' },
  { key: 'phone', label: 'Phone No.', qrLabel: 'Phone No', type: 'Text', required: false, active: true, inQr: true, col: 'Phone No.', help: 'Telephone or alternate phone' },
  { key: 'photo_no', label: 'Photo No.', qrLabel: 'Photo No', type: 'Text', required: false, active: true, inQr: true, col: 'Photo No.', help: 'Photo index or serial' },
];

export const COLUMN_ALIAS_MAP: Record<string, string[]> = {
  serial_no: [
    's no', 's no.', 's.no', 's.no.', 'sl no', 'sl no.', 'sl.no', 'sl.no.', 'sno', 'serial no', 'serial no.',
    'serial number', 'serial', 'sr no', 'sr no.', 'sr.no', 'sr.no.', 'seq', 'sequence', 's. number'
  ],
  register_no: [
    'register number', 'register no', 'register no.', 'reg no', 'reg no.', 'roll no', 'roll no.', 'roll number',
    'student id', 'reg_no', 'registration no', 'reg', 'roll', 'registerno', 'rollno', 'register', 'id',
    'student id', 'admission no', 'admission number', 'adm no', 'enrollment no', 'enrollment number', 'reg.no', 'reg.no.',
    // Staff / employee identifiers
    'employee id', 'employee no', 'employee number', 'employee code', 'emp id', 'emp no', 'emp code', 'empid', 'empno',
    'staff id', 'staff no', 'staff number', 'staff code', 'faculty id', 'faculty code', 'id no', 'id number', 'id card no'
  ],
  name: [
    'student name', 'name', 'full name', 'candidate name', 'student_name', 'student', 'candidate',
    'name of the student', 'name of student', 'studentname', 'name of candidate',
    // Staff names
    'staff name', 'employee name', 'emp name', 'faculty name', 'teacher name', 'name of the staff', 'name of staff',
    'name of the employee'
  ],
  course: [
    'course', 'programme', 'degree', 'branch', 'stream', 'program', 'course name', 'degree/branch', 'dept/branch'
  ],
  department: [
    'department', 'dept', 'dept.', 'department name', 'major', 'discipline'
  ],
  designation: ['designation', 'position', 'role', 'job title', 'cadre'],
  academic_year: [
    'academic year', 'batch', 'year', 'session', 'duration', 'academic_year', 'acad year', 'class'
  ],
  blood_group: ['blood group', 'blood grp', 'blood', 'bg', 'bloodgroup', 'blood_group', 'b.g', 'b.g.'],
  dob: ['date of birth', 'dob', 'birth date', 'd.o.b', 'd.o.b.', 'birthdate'],
  father_name: ['father\'s name', 'father name', 'fathers name', 'father', 'parent name', 'guardian name', 'father s name'],
  aadhar: ['aadhar no', 'aadhar no.', 'aadhar', 'aadhar number', 'adhaar', 'adhaar no', 'adhaar no.', 'aadhaar', 'aadhaar no', 'aadhaar no.', 'uid', 'aadhaar number'],
  address: ['address', 'addr', 'residential address', 'permanent address', 'residence address'],
  mobile: ['mobile', 'mobile no', 'mobile no.', 'mobile number', 'cell', 'cell no'],
  phone: ['phone no', 'phone no.', 'phone number', 'phone', 'telephone', 'landline', 'tel'],
  photo_no: ['photo no', 'photo no.', 'photo', 'photo number', 'image no', 'img no'],
  hostel: ['hostel', 'hostel block', 'room', 'hostel name'],
  section: ['section', 'sec', 'div', 'division'],
  emergency_contact: ['emergency contact', 'emergency phone', 'guardian phone', 'parent mobile', 'contact no'],
  valid_until: ['valid until', 'expiry', 'validity', 'valid thru'],
};
