-- Money made with a task (euros, 0-100 where 100 means "100 or more"): pays a tiered XP bonus (rankService.MONEY_BONUS).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS money INTEGER NOT NULL DEFAULT 0 CHECK (money >= 0 AND money <= 100);
