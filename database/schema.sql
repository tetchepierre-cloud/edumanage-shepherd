-- ============================================================
-- EDUMANAGE GHANA - SCHEMA BASE DE DONNÉES
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: profiles (utilisateurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('owner', 'director', 'manager', 'accountant', 'teacher')),
  phone TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: classes
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  level TEXT NOT NULL CHECK (level IN ('KG', 'Primary', 'JHS')),
  capacity INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: students (élèves)
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  class_id UUID REFERENCES classes(id),
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('M', 'F')),
  parent_name TEXT,
  parent_phone TEXT,
  address TEXT,
  student_id TEXT UNIQUE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: fee_payments (paiements des frais)
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES students(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_type TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Espèces',
  receipt_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  collected_by UUID REFERENCES profiles(id),
  academic_year TEXT DEFAULT '2024-2025',
  term TEXT DEFAULT 'Trimestre 1',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: expenses (dépenses)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  payment_method TEXT DEFAULT 'Espèces',
  receipt_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: staff (personnel)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  position TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  base_salary DECIMAL(10,2) DEFAULT 0,
  hire_date DATE DEFAULT CURRENT_DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: payroll (paie)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) NOT NULL,
  month TEXT NOT NULL,
  base_salary DECIMAL(10,2) NOT NULL,
  bonuses DECIMAL(10,2) DEFAULT 0,
  deductions DECIMAL(10,2) DEFAULT 0,
  net_salary DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'paid' CHECK (status IN ('pending', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: stock_items (stock)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'unité',
  unit_price DECIMAL(10,2) DEFAULT 0,
  minimum_stock INTEGER DEFAULT 5,
  supplier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: audit_logs (journal d audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  description TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FONCTION: mise à jour automatique updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON stock_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Politiques de base (accès authentifié)
CREATE POLICY "Utilisateurs authentifiés" ON profiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON classes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON students FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON fee_payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON expenses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON staff FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON payroll FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON stock_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Utilisateurs authentifiés" ON audit_logs FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- DONNÉES DE TEST : Classes
-- ============================================================
INSERT INTO classes (name, level, capacity) VALUES
  ('KG 1', 'KG', 30),
  ('KG 2', 'KG', 30),
  ('Primary 1', 'Primary', 35),
  ('Primary 2', 'Primary', 35),
  ('Primary 3', 'Primary', 35),
  ('Primary 4', 'Primary', 35),
  ('Primary 5', 'Primary', 35),
  ('Primary 6', 'Primary', 35),
  ('JHS 1', 'JHS', 40),
  ('JHS 2', 'JHS', 40),
  ('JHS 3', 'JHS', 40)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- TRIGGER: Profil automatique à l inscription
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'teacher')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
