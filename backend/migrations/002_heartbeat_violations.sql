-- ============================================================================
-- SmartProctor - Migration: Heartbeat & New Violation Types
-- Bu migration'ı mevcut veritabanına uygulayın
-- ============================================================================

-- 1. exam_sessions tablosuna last_heartbeat alanı ekle
ALTER TABLE smartproctor.exam_sessions 
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- Mevcut aktif oturumlar için last_heartbeat'i started_at ile doldur
UPDATE smartproctor.exam_sessions 
SET last_heartbeat = started_at 
WHERE last_heartbeat IS NULL AND status IN ('started', 'in_progress');

-- 2. violation_type enum'ına yeni değerler ekle
-- PostgreSQL'de enum'a yeni değer eklemek için ALTER TYPE kullanılır

-- CONNECTION_LOST ekle
DO $$ 
BEGIN
    ALTER TYPE smartproctor.violation_type ADD VALUE IF NOT EXISTS 'CONNECTION_LOST';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- NO_FACE ekle
DO $$ 
BEGIN
    ALTER TYPE smartproctor.violation_type ADD VALUE IF NOT EXISTS 'NO_FACE';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- HEAD_TURN ekle
DO $$ 
BEGIN
    ALTER TYPE smartproctor.violation_type ADD VALUE IF NOT EXISTS 'HEAD_TURN';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- MULTIPLE_FACES ekle
DO $$ 
BEGIN
    ALTER TYPE smartproctor.violation_type ADD VALUE IF NOT EXISTS 'MULTIPLE_FACES';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- KEYBOARD_SHORTCUT ekle
DO $$ 
BEGIN
    ALTER TYPE smartproctor.violation_type ADD VALUE IF NOT EXISTS 'KEYBOARD_SHORTCUT';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. last_heartbeat için index ekle (zombie hunter performansı için)
CREATE INDEX IF NOT EXISTS idx_sessions_last_heartbeat 
ON smartproctor.exam_sessions(last_heartbeat) 
WHERE status IN ('started', 'in_progress');

-- 4. Verify
SELECT 'Migration tamamlandı!' as status;

-- Yeni enum değerlerini kontrol et
SELECT enum_range(NULL::smartproctor.violation_type);
