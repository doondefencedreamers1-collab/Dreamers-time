-- ============================================================
--  SUPABASE MIGRATION — Batch soft-delete (RECOMMENDED)
--
--  Kya thik karta hai:
--    Abhi batch delete karte hi uski saari classes hamesha ke liye mit jati hain
--    aur agar cleanup beech mein fail ho jaye to "orphan rows" reh jati hain.
--    Iske baad batch ko INACTIVE kar sakoge — timetable se turant hat jayegi,
--    par uska data safe rahega aur wapas laayi ja sakti hai.
--
--  Kaise chalana hai:
--    1. Supabase kholo → left sidebar mein "SQL Editor" → "New query"
--    2. Neeche ka SECTION 1 copy-paste karke "Run" dabao
--    3. SECTION 2 (safety check) run karo
--    4. App refresh karo — Batches tab mein har card par naya ⃠ button aa jayega
--
--  Bilkul safe hai: koi row delete ya modify nahi hoti, sirf ek naya column
--  add hota hai jiski default value `true` hai (yaani sab batches active rahengi).
-- ============================================================


-- ------------------------------------------------------------
-- SECTION 1 — Soft delete column (YE CHALAO)
-- ------------------------------------------------------------
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Verify: sab batches active dikhni chahiye
SELECT id, name, is_active FROM batches ORDER BY id;


-- ------------------------------------------------------------
-- SECTION 2 — Duplicate batch names rokna (YE BHI CHALAO)
--
-- Zaroori kyun: timetable ki `cells` table batch ko NAAM se pehchanti hai,
-- id se nahi. Do batches ka naam same ho gaya to dono ki classes aapas mein
-- mix ho jayengi. Ye constraint use hone hi nahi dega.
-- ------------------------------------------------------------

-- Pehle check karo koi duplicate hai to nahi. 0 rows aane chahiye:
SELECT name, count(*) AS kitni_baar
FROM batches
GROUP BY name
HAVING count(*) > 1;

-- Upar 0 rows aayi? Tabhi ye chalao:
ALTER TABLE batches
  ADD CONSTRAINT batches_name_unique UNIQUE (name);

-- Agar duplicate mile the, to pehle unhe rename karo (UPDATE batches SET name = '...' WHERE id = ...),
-- phir upar wala ALTER chalao.


-- ------------------------------------------------------------
-- SECTION 3 — App ab kaise behave karega
-- ------------------------------------------------------------
--   Batches tab mein har card par teen button honge:
--
--     ✎  Edit          — naam/strength/class teacher badlo
--     ⃠  Inactive      — NAYA. Timetable se hatao, data safe rakho (undo ho sakta hai)
--     ✗  Delete        — hamesha ke liye mitao (undo NAHI hoga) — ab kam hi zaroorat padegi
--
--   Inactive batch:
--     • timetable grid, by-teacher/by-room view, conflicts, reports, print —
--       kahin nahi dikhegi
--     • student count aur "N batches" ginti mein nahi aayegi
--     • Batches tab mein halki (faded) dikhegi "Inactive" tag ke saath,
--       jahan se ✓ dabakar wapas active kar sakte ho
--
--   Har saal naye session par: purani batches ko DELETE karne ke bajaye
--   INACTIVE kar dena — pichle saal ka record poora bacha rahega.


-- ------------------------------------------------------------
-- SECTION 4 — (OPTIONAL) Foreign key
--
-- Ye DB ko majboor kar deta hai ki batch delete hote hi uski classes bhi
-- delete ho jayein. SECTION 1 ke baad iski zaroorat kam hai, aur ye khatarnak
-- bhi hai (delete = history hamesha ke liye gayi).
--
-- ⚠ Ye tabhi chalega jab DB mein ek bhi orphan row na bachi ho —
--   pehle ORPHAN_CELLS_AUDIT.sql se cleanup karna padega.
--
-- Meri salah: ISE CHHOD DO. Soft delete (SECTION 1) kaafi hai aur behtar hai.
-- ------------------------------------------------------------
-- ALTER TABLE cells
--   ADD CONSTRAINT cells_batch_fkey
--   FOREIGN KEY (batch) REFERENCES batches(name)
--   ON UPDATE CASCADE
--   ON DELETE CASCADE;
