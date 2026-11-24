-- ==============================================================================
-- ATHRYAN QR MANAGER - SEED DATA
-- Developed by Athryan Tech Solution Private Limited
-- ==============================================================================

-- 1. Insert Default QR Field Configurations
INSERT INTO public.qr_field_configs (field_key, label, qr_label, source_column, data_type, is_required, is_active, in_qr, sort_order, is_custom, help_text)
VALUES
('serial_no', 'Serial Number', 'S.No', 'S.No', 'Number', false, true, false, 0, false, 'Excel sequence / S.No order'),
('name', 'Name', 'Name', 'Student Name', 'Text', true, true, true, 1, false, 'Student or staff name; preserves Unicode and Tamil characters'),
('register_no', 'Register / ID Number', 'Register No', 'Register Number', 'Text', true, true, true, 2, false, 'Student register number or staff/employee ID; preserves leading zeros'),
('course', 'Course', 'Course', 'Course', 'Text', false, true, true, 3, false, 'Degree or programme name, e.g. B.Sc. Statistics'),
('department', 'Department', 'Department', 'Department', 'Text', false, true, true, 4, false, 'Academic department'),
('academic_year', 'Academic Year', 'Academic Year', 'Academic Year', 'Text', false, true, true, 5, false, 'Batch years, e.g. 2023–2026'),
('blood_group', 'Blood Group', 'Blood Group', 'Blood Group', 'Text', false, true, true, 6, false, 'Blood group, e.g. O+, B+'),
('dob', 'Date of Birth', 'DOB', 'Date of Birth', 'Date', false, true, false, 7, false, 'Date of birth (excluded from QR by default)'),
('hostel', 'Hostel', 'Hostel', 'Hostel Block', 'Text', false, true, false, 8, true, 'Residential block'),
('section', 'Section', 'Section', 'Section', 'Text', false, true, false, 9, true, 'Class section'),
('emergency_contact', 'Emergency Contact', 'Emergency', 'Emergency Contact', 'Number', false, true, false, 10, true, 'Emergency contact phone number'),
('valid_until', 'Valid Until', 'Valid Until', 'Valid Until', 'Date', false, true, true, 11, true, 'Validity date of ID card')
ON CONFLICT (field_key) DO UPDATE
SET 
  label = EXCLUDED.label,
  qr_label = EXCLUDED.qr_label,
  is_required = EXCLUDED.is_required,
  in_qr = EXCLUDED.in_qr,
  sort_order = EXCLUDED.sort_order;

-- 2. Insert Default QR Template
INSERT INTO public.qr_templates (template_name, description, field_configuration, print_configuration, qr_appearance, is_default, version)
VALUES
(
  'Standard Student ID Card Template',
  'Approved institutional template for undergraduate and postgraduate ID cards.',
  '[
    {"key": "serial_no", "label": "Serial Number", "qrLabel": "S.No", "required": false, "active": true, "inQr": false},
    {"key": "name", "label": "Student Name", "qrLabel": "Name", "required": true, "active": true, "inQr": true},
    {"key": "register_no", "label": "Register Number", "qrLabel": "Register No", "required": true, "active": true, "inQr": true},
    {"key": "course", "label": "Course", "qrLabel": "Course", "required": false, "active": true, "inQr": true},
    {"key": "department", "label": "Department", "qrLabel": "Department", "required": false, "active": true, "inQr": true},
    {"key": "academic_year", "label": "Academic Year", "qrLabel": "Academic Year", "required": false, "active": true, "inQr": true},
    {"key": "blood_group", "label": "Blood Group", "qrLabel": "Blood Group", "required": false, "active": true, "inQr": true}
  ]'::jsonb,
  '{
    "pageSize": "A4",
    "orientation": "portrait",
    "columns": 3,
    "rows": 5,
    "marginMm": 12,
    "spacingMm": 6,
    "qrSizeMm": 45,
    "showRegisterNo": true,
    "showStudentName": true,
    "showBorder": true,
    "fontSizePt": 8
  }'::jsonb,
  '{
    "size": "600",
    "sizeUnit": "px",
    "sizeValue": 600,
    "format": "PNG",
    "ecc": "M",
    "quiet": "4",
    "naming": "serial",
    "codeType": "qr",
    "transparentBackground": true
  }'::jsonb,
  true,
  1
)
ON CONFLICT DO NOTHING;

-- 3. Insert Application Settings (if table empty)
INSERT INTO public.app_settings (institution_name, institution_code, institution_address, default_format, default_blank, qr_defaults, retention_days, auto_delete_expired)
SELECT
  'Sri Venkateswara College of Arts and Science',
  'SVCAS',
  'Tiruvallur Road, Chennai 600 072',
  'colon',
  'omit',
  '{"size": "600", "sizeUnit": "px", "sizeValue": 600, "format": "PNG", "ecc": "M", "quiet": "4", "naming": "serial", "codeType": "qr", "transparentBackground": true}'::jsonb,
  30,
  false
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings);
