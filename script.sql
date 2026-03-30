-- ============================================
-- MIGRACIÓN: De JSONB a columnas individuales
-- + Renombrar kill_switch a visita
-- ============================================

-- Paso 1: Agregar columnas individuales por pregunta
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tipologia_answer TEXT,
  ADD COLUMN IF NOT EXISTS tipologia_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS separacion_answer TEXT,
  ADD COLUMN IF NOT EXISTS separacion_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financiacion_answer TEXT,
  ADD COLUMN IF NOT EXISTS financiacion_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plazo_answer TEXT,
  ADD COLUMN IF NOT EXISTS plazo_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_answer TEXT,
  ADD COLUMN IF NOT EXISTS decision_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visita_answer TEXT,
  ADD COLUMN IF NOT EXISTS visita_score INTEGER DEFAULT 0;

-- Paso 2: Si existian columnas kill_switch, migrar datos y eliminar
-- (si ya corriste el script anterior con kill_switch, renombra)
ALTER TABLE users RENAME COLUMN kill_switch_answer TO visita_answer;
ALTER TABLE users RENAME COLUMN kill_switch_score TO visita_score;
-- Si el RENAME falla porque no existen, ignora el error y continua

-- Paso 3: Eliminar columnas viejas
ALTER TABLE users
  DROP COLUMN IF EXISTS qualification_answers,
  DROP COLUMN IF EXISTS questions_asked,
  DROP COLUMN IF EXISTS score,
  DROP COLUMN IF EXISTS rooms,
  DROP COLUMN IF EXISTS budget,
  DROP COLUMN IF EXISTS financing,
  DROP COLUMN IF EXISTS location;

-- ============================================
-- SCHEMA FINAL: Tabla users
-- ============================================
-- CREATE TABLE users (
--   id SERIAL PRIMARY KEY,
--   current_session_id TEXT UNIQUE,
--   status TEXT,
--   person_name TEXT,
--   project_name TEXT,
--   priority TEXT DEFAULT 'baja',
--   tipologia_answer TEXT,
--   tipologia_score INTEGER DEFAULT 0,
--   separacion_answer TEXT,
--   separacion_score INTEGER DEFAULT 0,
--   financiacion_answer TEXT,
--   financiacion_score INTEGER DEFAULT 0,
--   plazo_answer TEXT,
--   plazo_score INTEGER DEFAULT 0,
--   decision_answer TEXT,
--   decision_score INTEGER DEFAULT 0,
--   visita_answer TEXT,
--   visita_score INTEGER DEFAULT 0,
--   created_at TIMESTAMP DEFAULT now()
-- );
