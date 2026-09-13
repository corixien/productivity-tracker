ALTER TABLE users DROP COLUMN IF EXISTS reload;
ALTER TABLE users DROP COLUMN IF EXISTS times_reloaded;
DROP INDEX IF EXISTS idx_users_reload;

ALTER TABLE users ADD COLUMN position_based_multiplier DECIMAL(3,2) DEFAULT 1.0;
ALTER TABLE users ADD COLUMN rank_based_multiplier DECIMAL(3,2) DEFAULT 1.0;
