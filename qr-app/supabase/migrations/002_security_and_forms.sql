-- ==============================================================================
-- 002: Security fix + data collection forms
-- Run this ONLY if you already ran an older 001_initial_schema.sql / master_schema.sql.
-- (A fresh setup should just run master_schema.sql, which already includes all of this.)
-- ==============================================================================
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

-- Admin profiles
-- Only super admins can add, change or remove admins
DROP POLICY IF EXISTS "Admins manage admin profiles" ON public.admin_profiles;
DROP POLICY IF EXISTS "Super admins manage admin profiles" ON public.admin_profiles;
CREATE POLICY "Super admins manage admin profiles" ON public.admin_profiles
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Audit logs
-- Read and append only: nobody can edit or delete audit history through the app
DROP POLICY IF EXISTS "Admins view and insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins append audit_logs" ON public.audit_logs;
CREATE POLICY "Admins read audit_logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins append audit_logs" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());

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
