-- ============================================================
--  ORPHAN TIMETABLE ROWS — AUDIT & (OPTIONAL) CLEANUP
--  Supabase SQL Editor mein chalao.
--
--  Background:
--    `cells` table batch ko NAAM (text) se refer karti hai, id/FK se nahi.
--    Isliye DB level par koi ON DELETE CASCADE nahi hai — cascade app code karta hai.
--    Agar wo step fail ho jaye, ya batch row seedha SQL/dashboard se delete ho,
--    to us batch ke cells DB mein pade reh jate hain = ORPHAN ROWS.
--
--  App-side fix already deployed hai: aise rows ab kisi bhi view mein nahi dikhte
--  (src/App.jsx → filterCellsToActiveBatches). Ye file sirf DB hygiene ke liye hai.
--
--  ⚠ STEP 1 aur 2 sirf PADHTE hain — kuch delete nahi karte. Pehle wahi chalao.
--  ⚠ STEP 4 (DELETE) tabhi chalao jab STEP 1-3 ka output dekh kar confirm kar lo.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1 — Kitni orphan rows hain, kis batch ki?
-- ------------------------------------------------------------
SELECT
  c.batch                       AS batch_name,
  count(*)                      AS orphan_rows,
  count(DISTINCT c.day)         AS days_affected,
  min(c.time_slot)              AS first_slot,
  max(c.time_slot)              AS last_slot
FROM cells c
LEFT JOIN batches b ON b.name = c.batch
WHERE b.id IS NULL
GROUP BY c.batch
ORDER BY orphan_rows DESC;


-- ------------------------------------------------------------
-- STEP 2 — Poori detail (delete se pehle aankhon se dekh lo)
-- ------------------------------------------------------------
SELECT c.id, c.cell_key, c.day, c.time_slot, c.batch, c.subject, c.teacher, c.room
FROM cells c
LEFT JOIN batches b ON b.name = c.batch
WHERE b.id IS NULL
ORDER BY c.batch, c.day, c.time_slot;


-- ------------------------------------------------------------
-- STEP 2b — Ulta case: `batch` column null/khali hai, par cell_key mein naam hai.
--           Ye rows app ke naam-wale cascade se bach jati hain.
-- ------------------------------------------------------------
SELECT id, cell_key, day, time_slot, batch, subject, teacher
FROM cells
WHERE batch IS NULL OR btrim(batch) = '';


-- ------------------------------------------------------------
-- STEP 2c — Faculty side: cells jinka teacher ab roster mein nahi hai.
--           Inhe DELETE mat karo — class abhi bhi honi hai, bas reassign chahiye.
--           App inhe timetable mein laal rang mein "removed, reassign" dikhati hai.
-- ------------------------------------------------------------
SELECT c.teacher, count(*) AS classes_needing_reassignment
FROM cells c
JOIN batches b ON b.name = c.batch                       -- sirf ACTIVE batches
WHERE c.teacher IS NOT NULL
  AND c.teacher NOT IN (
    SELECT coalesce(short_name, split_part(name, ' ', 1)) FROM teachers
  )
GROUP BY c.teacher
ORDER BY classes_needing_reassignment DESC;


-- ------------------------------------------------------------
-- STEP 3 — BACKUP (delete se pehle HAMESHA chalao)
--          Ek snapshot table ban jayegi; galti ho jaye to wapas insert kar sakte ho.
-- ------------------------------------------------------------
-- CREATE TABLE cells_orphan_backup_20260912 AS
-- SELECT c.*
-- FROM cells c
-- LEFT JOIN batches b ON b.name = c.batch
-- WHERE b.id IS NULL;
--
-- SELECT count(*) FROM cells_orphan_backup_20260912;   -- STEP 1 ke total se match hona chahiye


-- ------------------------------------------------------------
-- STEP 4 — CLEANUP (⚠ DESTRUCTIVE — sirf backup ke baad, aur confirm karne ke baad)
--          Ek baar mein ek batch karo, blanket delete se behtar hai.
-- ------------------------------------------------------------
-- BEGIN;
--   DELETE FROM cells c
--   USING (SELECT 1) _
--   WHERE c.batch = 'YAHAN_BATCH_KA_NAAM'
--     AND NOT EXISTS (SELECT 1 FROM batches b WHERE b.name = c.batch);
--   -- count dekho, sahi lage to COMMIT, warna ROLLBACK
-- COMMIT;


-- ------------------------------------------------------------
-- STEP 5 — AAGE SE ORPHANS BANNE HI NA DEIN (recommended, one-time)
--
--   Asli root cause: cells.batch ek text naam hai, FK nahi.
--   Do options — team ke hisaab se koi ek chuno:
--
--   (a) Sabse pakka: batches.name pe unique constraint + cells.batch pe FK
--       with ON DELETE CASCADE. Iske baad batch delete karte hi uske cells
--       DB khud saaf kar degi, app ke cascade step par bharosa nahi karna padega.
--       Pehle STEP 4 se saare orphans hata lo, warna FK add hi nahi hoga.
--
--       ALTER TABLE batches ADD CONSTRAINT batches_name_unique UNIQUE (name);
--       ALTER TABLE cells
--         ADD CONSTRAINT cells_batch_fkey
--         FOREIGN KEY (batch) REFERENCES batches(name)
--         ON UPDATE CASCADE      -- rename bhi apne aap propagate ho jayega
--         ON DELETE CASCADE;
--
--   (b) Halka option: batches ko soft-delete karo (hard delete band).
--       App ka isActiveBatch() helper is column ko already samajhta hai —
--       column add karte hi wo apne aap honour hone lagega, code change zero.
--
--       ALTER TABLE batches ADD COLUMN is_active boolean NOT NULL DEFAULT true;
--       -- delete ki jagah: UPDATE batches SET is_active = false WHERE id = ...;
-- ------------------------------------------------------------
