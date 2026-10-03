-- Rank thresholds rescaled by 3.6 so that Master takes about a year at the 50 XP daily goal (18000 XP).
-- Must match backend/services/rankService.js (an integration test checks it).
CREATE OR REPLACE FUNCTION rank_for_xp(p_xp INTEGER) RETURNS VARCHAR LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_xp >= 18000 THEN 'Master' WHEN p_xp >= 8640 THEN 'Diamond' WHEN p_xp >= 4320 THEN 'Platinum'
        WHEN p_xp >= 2160 THEN 'Gold' WHEN p_xp >= 1080 THEN 'Silver' WHEN p_xp >= 360 THEN 'Bronze'
        ELSE 'Newcomer' END
$$;

CREATE OR REPLACE FUNCTION rank_min_xp(p_rank VARCHAR) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_rank WHEN 'Newcomer' THEN 0 WHEN 'Bronze' THEN 360 WHEN 'Silver' THEN 1080 WHEN 'Gold' THEN 2160
        WHEN 'Platinum' THEN 4320 WHEN 'Diamond' THEN 8640 WHEN 'Master' THEN 18000 END
$$;

CREATE OR REPLACE FUNCTION rank_max_xp(p_rank VARCHAR) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_rank WHEN 'Newcomer' THEN 359 WHEN 'Bronze' THEN 1079 WHEN 'Silver' THEN 2159 WHEN 'Gold' THEN 4319
        WHEN 'Platinum' THEN 8639 WHEN 'Diamond' THEN 17999 END
$$;

-- Re-derive rank and level of existing users from their (unchanged) XP; the users_sync_progress trigger does the work.
UPDATE users SET xp = xp;
