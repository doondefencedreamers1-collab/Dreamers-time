-- ============================================================
--  TIMETABLE FIX — `cells` table (asli timetable data)
--
--  Note: timetable_change_logs sirf HISTORY hai. Asli timetable `cells` table mein hai:
--    cell_key   text   'Mon-08:00-NDA 1'   (day-time-batch, har period ki pehchaan)
--    day        text   'Mon'
--    time_slot  text   '08:00'
--    batch      text   'NDA 1'
--    subject    text
--    teacher    text   (teacher ka short name)
--    room       text
--
--  Kaise chalana hai:
--    Supabase → SQL Editor → New query → ek-ek PART copy-paste karke "Run".
--    PART A sirf dekhta hai (kuch nahi badalta). PART B fix karta hai.
-- ============================================================


-- ============================================================
-- PART A — DIAGNOSIS (safe, read-only). Har query ka result dekho.
-- ============================================================

-- A1. Columns: cell_key, day, time_slot, batch, subject, teacher, room, id hone chahiye
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'cells'
ORDER BY ordinal_position;

-- A2. Constraints: cell_key par UNIQUE (ya PRIMARY KEY) hona chahiye.
--     Nahi hai to purana code ka upsert({ onConflict: 'cell_key' }) HAR BAAR fail hota tha.
SELECT conname AS constraint_name,
       CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE'
                    WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK' ELSE contype::text END AS type,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.cells'::regclass;

-- A3. Indexes
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'cells';

-- A4. RLS on hai ya off?
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class WHERE oid = 'public.cells'::regclass;

-- A5. RLS policies — SELECT, INSERT, UPDATE, DELETE chaaron ke liye `anon` role ki policy chahiye
--     (app Supabase Auth use nahi karta, publishable key = `anon` role).
--     Agar UPDATE ki policy nahi hai: naya period assign hota hai par CHANGE save nahi hota.
SELECT policyname, cmd, roles, permissive, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cells'
ORDER BY cmd;

-- A6. Table-level grants (anon/authenticated ke paas SELECT/INSERT/UPDATE/DELETE hone chahiye)
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'cells'
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee;

-- A7. Kitni rows hain? 1000 se zyada = purana app baaki rows load hi nahi karta tha
SELECT count(*) AS total_cells FROM cells;

-- A8. Duplicate cell_key (ek hi period ki 2+ rows) — 0 rows aani chahiye.
--     Duplicates hon to refresh par kabhi purani row dikh jati hai.
SELECT cell_key, count(*) AS kitni_baar, array_agg(id ORDER BY id) AS ids
FROM cells
GROUP BY cell_key
HAVING count(*) > 1
ORDER BY kitni_baar DESC;

-- A9. Triggers jo save hui value badal sakte hain
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.cells'::regclass AND NOT tgisinternal;


-- ============================================================
-- PART B — FIX. Upar ka result dekh lo, phir ye poora block ek saath Run karo.
--   Safe hai: pehle backup banta hai, sirf duplicate rows hatti hain
--   (har period ki sabse NAYI row — highest id — bachti hai).
-- ============================================================

BEGIN;

-- B1. Backup (ek baar ke liye) — koi gadbad ho to yahan se wapas la sakte ho
CREATE TABLE IF NOT EXISTS cells_backup_timetable_fix AS SELECT * FROM cells;

-- B2. Duplicate cell_key hatao — sabse nayi row (highest id) rakho
DELETE FROM cells c
USING cells newer
WHERE c.cell_key = newer.cell_key
  AND c.id < newer.id;

-- B3. cell_key par UNIQUE constraint (agar pehle se nahi hai)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cells'::regclass
      AND contype IN ('u', 'p')
      AND pg_get_constraintdef(oid) = 'UNIQUE (cell_key)'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cells'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (cell_key)'
  ) THEN
    ALTER TABLE cells ADD CONSTRAINT cells_cell_key_unique UNIQUE (cell_key);
  END IF;
END $$;

-- B4. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cells TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- B5. RLS policies — SELECT / INSERT / UPDATE / DELETE, anon + authenticated
--     (Aapki purani policies nahi hatti — sirf ye 4 naam wali dobara banti hain.)
ALTER TABLE public.cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cells_app_select ON public.cells;
DROP POLICY IF EXISTS cells_app_insert ON public.cells;
DROP POLICY IF EXISTS cells_app_update ON public.cells;
DROP POLICY IF EXISTS cells_app_delete ON public.cells;

CREATE POLICY cells_app_select ON public.cells FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY cells_app_insert ON public.cells FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY cells_app_update ON public.cells FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY cells_app_delete ON public.cells FOR DELETE TO anon, authenticated USING (true);

-- B6. History table: app isme sirf INSERT + SELECT karta hai
GRANT SELECT, INSERT ON public.timetable_change_logs TO anon, authenticated;
DROP POLICY IF EXISTS tcl_app_select ON public.timetable_change_logs;
DROP POLICY IF EXISTS tcl_app_insert ON public.timetable_change_logs;
CREATE POLICY tcl_app_select ON public.timetable_change_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY tcl_app_insert ON public.timetable_change_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

COMMIT;

-- B7. PostgREST schema cache refresh ("column not found in schema cache" error ke liye)
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- PART C — VERIFY (Part B ke baad)
-- ============================================================

-- C1. 0 rows aani chahiye
SELECT cell_key, count(*) FROM cells GROUP BY cell_key HAVING count(*) > 1;

-- C2. 4 policies (SELECT, INSERT, UPDATE, DELETE) dikhni chahiye
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cells' ORDER BY cmd;

-- C3. Sab theek hone ke kuch din baad backup hata sakte ho:
-- DROP TABLE cells_backup_timetable_fix;
