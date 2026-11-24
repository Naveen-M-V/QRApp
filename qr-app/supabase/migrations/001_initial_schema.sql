-- ==============================================================================
-- ATHRYAN QR MANAGER - MASTER DATABASE SETUP SCRIPT
-- Developed by Athryan Tech Solution Private Limited
--
-- INSTRUCTIONS:
-- 1. Open your Supabase project dashboard (https://supabase.com/dashboard).
-- 2. Go to the "SQL Editor" tab (left sidebar).
-- 3. Click "New Query", paste this entire script, and click "Run".
-- ==============================================================================

-- 0. Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ADMIN PROFILES
-- Role-based access control linked directly to Supabase auth.users
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. QR FIELD CONFIGURATIONS
-- Field mapping order, custom labels, and QR payload inclusion rules
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.qr_field_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    qr_label TEXT NOT NULL,
    source_column TEXT,
    data_type TEXT NOT NULL DEFAULT 'Text' CHECK (data_type IN ('Text', 'Date', 'Number')),
    is_required BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    in_qr BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    is_custom BOOLEAN NOT NULL DEFAULT false,
    help_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. QR & BARCODE TEMPLATES
-- Reusable cohorts presets (field order, print sheet geometries, dimensions)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.qr_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name TEXT NOT NULL,
    description TEXT,
    field_configuration JSONB NOT NULL DEFAULT '[]'::jsonb,
    print_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    qr_appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT false,
    version INT NOT NULL DEFAULT 1,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 4. QR BATCHES
-- Batch lifecycle management, upload audit, and retention expiry
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.qr_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'errors', 'failed', 'cancelled')),
    total_rows INT NOT NULL DEFAULT 0,
    generated_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMPTZ
);

-- ==============================================================================
-- 5. STUDENT RECORDS
-- CRITICAL: register_no is stored strictly as TEXT to preserve leading zeros
-- Includes sheet_name (multi-sheet support) and serial_no (Excel row order)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.qr_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.qr_batches(id) ON DELETE CASCADE,
    sheet_name TEXT,
    serial_no TEXT,
    register_no TEXT NOT NULL,
    student_name TEXT NOT NULL,
    course TEXT,
    department TEXT,
    academic_year TEXT,
    student_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    qr_payload TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Idempotent column additions for existing installations
ALTER TABLE public.qr_students ADD COLUMN IF NOT EXISTS sheet_name TEXT;
ALTER TABLE public.qr_students ADD COLUMN IF NOT EXISTS serial_no TEXT;

-- ==============================================================================
-- 6. BATCH RESULTS
-- Row-level processing audit for spreadsheet reconciliation
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.qr_batch_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.qr_batches(id) ON DELETE CASCADE,
    sheet_name TEXT,
    row_number INT NOT NULL,
    register_no TEXT,
    student_name TEXT,
    status TEXT NOT NULL CHECK (status IN ('generated', 'skipped_duplicate', 'skipped_missing', 'error')),
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.qr_batch_results ADD COLUMN IF NOT EXISTS sheet_name TEXT;

-- ==============================================================================
-- 7. QR VERSION HISTORY
-- Audit trail comparing changes between re-generated codes
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.qr_version_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.qr_students(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.qr_batches(id) ON DELETE CASCADE,
    register_no TEXT NOT NULL,
    version INT NOT NULL,
    previous_payload TEXT,
    new_payload TEXT NOT NULL,
    changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 8. IMPORT PROFILES
-- Reusable spreadsheet header mapping rules and duplication policies
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.import_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_name TEXT NOT NULL UNIQUE,
    description TEXT,
    column_aliases JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
    duplicate_rule TEXT NOT NULL DEFAULT 'keep' CHECK (duplicate_rule IN ('keep', 'skip')),
    default_template_id UUID REFERENCES public.qr_templates(id) ON DELETE SET NULL,
    filename_convention TEXT NOT NULL DEFAULT 'serial' CHECK (filename_convention IN ('serial', 'reg', 'regname')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 9. AUDIT LOGS
-- Immutable administrative activity history (exports, generation, settings)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    event_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 10. APPLICATION SETTINGS
-- Institutional identity, delimiters, transparent backgrounds, retention configuration
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_name TEXT NOT NULL DEFAULT '',
    institution_code TEXT NOT NULL DEFAULT '',
    institution_address TEXT DEFAULT '',
    default_format TEXT NOT NULL DEFAULT 'colon' CHECK (default_format IN ('colon', 'dash', 'value')),
    default_blank TEXT NOT NULL DEFAULT 'omit' CHECK (default_blank IN ('omit', 'show')),
    qr_defaults JSONB NOT NULL DEFAULT '{"size": "600", "sizeUnit": "px", "sizeValue": 600, "format": "PNG", "ecc": "M", "quiet": "4", "naming": "serial", "codeType": "qr", "transparentBackground": true}'::jsonb,
    retention_days INT NOT NULL DEFAULT 30,
    auto_delete_expired BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- INDEXES FOR FAST QUERYING
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_qr_students_batch_id ON public.qr_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_qr_students_sheet_name ON public.qr_students(sheet_name);
CREATE INDEX IF NOT EXISTS idx_qr_students_serial_no ON public.qr_students(serial_no);
CREATE INDEX IF NOT EXISTS idx_qr_students_register_no ON public.qr_students(register_no);
CREATE INDEX IF NOT EXISTS idx_qr_students_course ON public.qr_students(course);
CREATE INDEX IF NOT EXISTS idx_qr_students_department ON public.qr_students(department);
CREATE INDEX IF NOT EXISTS idx_qr_batches_created_at ON public.qr_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_batches_status ON public.qr_batches(status);
CREATE INDEX IF NOT EXISTS idx_qr_batch_results_batch_id ON public.qr_batch_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_qr_batch_results_sheet_name ON public.qr_batch_results(sheet_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_field_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_batch_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_version_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Helper security function: true only for an ACTIVE admin profile linked to the signed-in user.
-- (No bootstrap clause: an empty admin table means nobody has access until you add yourself — see SETUP below.)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('super_admin', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = auth.uid() AND is_active = true AND role = 'super_admin'
  );
$$;

-- Older versions of this script made EVERY new sign-up an admin. Remove that.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_admin_user();

-- ------------------------------------------------------------------------------
-- SETUP: make yourself an admin (run once, after creating your user in
-- Supabase → Authentication → Users → "Add user"). Replace the email:
--
--   INSERT INTO public.admin_profiles (id, display_name, role, is_active)
--   SELECT id, 'Administrator', 'super_admin', true FROM auth.users
--   WHERE lower(email) = lower('you@example.com')
--   ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
-- ------------------------------------------------------------------------------

-- ==============================================================================
-- RLS POLICIES (Idempotent: drops before creating so it can be re-run safely)
-- ==============================================================================

-- Admin Profiles
DROP POLICY IF EXISTS "Users can read own profile" ON public.admin_profiles;
CREATE POLICY "Users can read own profile" ON public.admin_profiles
    FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());

-- Only super admins can add, change or remove admins
DROP POLICY IF EXISTS "Admins manage admin profiles" ON public.admin_profiles;
DROP POLICY IF EXISTS "Super admins manage admin profiles" ON public.admin_profiles;
CREATE POLICY "Super admins manage admin profiles" ON public.admin_profiles
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- QR Field Configs
DROP POLICY IF EXISTS "Admins full access on qr_field_configs" ON public.qr_field_configs;
CREATE POLICY "Admins full access on qr_field_configs" ON public.qr_field_configs
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- QR Templates
DROP POLICY IF EXISTS "Admins full access on qr_templates" ON public.qr_templates;
CREATE POLICY "Admins full access on qr_templates" ON public.qr_templates
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- QR Batches
DROP POLICY IF EXISTS "Admins full access on qr_batches" ON public.qr_batches;
CREATE POLICY "Admins full access on qr_batches" ON public.qr_batches
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Student Records
DROP POLICY IF EXISTS "Admins full access on qr_students" ON public.qr_students;
CREATE POLICY "Admins full access on qr_students" ON public.qr_students
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Batch Results
DROP POLICY IF EXISTS "Admins full access on qr_batch_results" ON public.qr_batch_results;
CREATE POLICY "Admins full access on qr_batch_results" ON public.qr_batch_results
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Version History
DROP POLICY IF EXISTS "Admins full access on qr_version_history" ON public.qr_version_history;
CREATE POLICY "Admins full access on qr_version_history" ON public.qr_version_history
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Import Profiles
DROP POLICY IF EXISTS "Admins full access on import_profiles" ON public.import_profiles;
CREATE POLICY "Admins full access on import_profiles" ON public.import_profiles
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Audit Logs
-- Read and append only: nobody can edit or delete audit history through the app
DROP POLICY IF EXISTS "Admins view and insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins append audit_logs" ON public.audit_logs;
CREATE POLICY "Admins read audit_logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins append audit_logs" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Application Settings
DROP POLICY IF EXISTS "Admins full access on app_settings" ON public.app_settings;
CREATE POLICY "Admins full access on app_settings" ON public.app_settings
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ==============================================================================
-- DATA COLLECTION FORMS
-- A form is shared as a link (/f/<slug>). Students submit details + a photo.
-- Submissions are written ONLY by the server (service role) after validation;
-- the public has no direct access to these tables or the photos.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.collection_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    departments JSONB NOT NULL DEFAULT '[]'::jsonb,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    require_photo BOOLEAN NOT NULL DEFAULT true,
    is_open BOOLEAN NOT NULL DEFAULT true,
    closes_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES public.collection_forms(id) ON DELETE CASCADE,
    department TEXT NOT NULL DEFAULT '',
    register_no TEXT NOT NULL,
    student_name TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    photo_path TEXT,
    consent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON public.form_submissions(form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_reg ON public.form_submissions(form_id, register_no);

ALTER TABLE public.collection_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on collection_forms" ON public.collection_forms;
CREATE POLICY "Admins full access on collection_forms" ON public.collection_forms
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read and delete form_submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Admins read form_submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Admins delete form_submissions" ON public.form_submissions;
CREATE POLICY "Admins read form_submissions" ON public.form_submissions
    FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins delete form_submissions" ON public.form_submissions
    FOR DELETE TO authenticated USING (public.is_admin());

-- Private bucket for student photos (not publicly readable; admins get short-lived signed links)
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Admins read student photos" ON storage.objects;
CREATE POLICY "Admins read student photos" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'student-photos' AND public.is_admin());
DROP POLICY IF EXISTS "Admins delete student photos" ON storage.objects;
CREATE POLICY "Admins delete student photos" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'student-photos' AND public.is_admin());
