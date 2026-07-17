-- ====================================================================
-- SUPABASE SECURITY UPGRADES & DATABASE HARDENING FOR FUGAEA
-- Run this in the Supabase SQL Editor for your project.
-- ====================================================================

-- 1. HARDEN USER PROFILES (Prevent client credit tampering)
-- This trigger blocks direct UPDATE queries on the 'credits' column
-- initiated by client roles (authenticated/anon).

CREATE OR REPLACE FUNCTION public.check_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Block client-side direct credit updates
    IF (current_setting('role', true) = 'authenticated' OR current_setting('role', true) = 'anon') 
       AND NEW.credits IS DISTINCT FROM OLD.credits THEN
        RAISE EXCEPTION 'Unauthorized: You cannot modify credits directly.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_profile_update ON public.profiles;
CREATE TRIGGER trg_check_profile_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_profile_update();


-- 2. ENABLE SECURE DAILY BONUS RPC (Server-side once-per-day enforcement)
-- Adds a tracked date column to profile and implements the row-locked RPC.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_daily_claim_at DATE;

CREATE OR REPLACE FUNCTION public.claim_daily_bonus()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as DB owner to bypass profile write restriction
AS $$
DECLARE
    curr_user_id UUID;
    last_claimed DATE;
    today_date DATE;
BEGIN
    -- Authoritatively resolve logged in user ID
    curr_user_id := auth.uid();
    IF curr_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    today_date := CURRENT_DATE;

    -- Row-lock the profile row to prevent concurrent race-condition claims
    SELECT last_daily_claim_at INTO last_claimed
    FROM public.profiles
    WHERE id = curr_user_id
    FOR UPDATE;

    -- Enforce once per calendar day constraint
    IF last_claimed = today_date THEN
        RAISE EXCEPTION 'Daily bonus already claimed today.';
    END IF;

    -- Update credits and claim date safely
    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + 1,
        last_daily_claim_at = today_date
    WHERE id = curr_user_id;

    RETURN TRUE;
END;
$$;


-- 3. SERVER-SIDE POST MODERATION & ATOMIC CREDIT DEDUCTION
-- Enforces text constraints, keyword/domain blocklists, and deducts 1 credit before insert.

CREATE OR REPLACE FUNCTION public.on_post_created()
RETURNS TRIGGER AS $$
DECLARE
    user_credits INT;
    lower_text TEXT;
    lower_url TEXT;
    blocked_keywords TEXT[] := ARRAY['spam', 'scam', 'illegal', 'hack', 'viagra', 'casino', 'lottery', 'free money', 'porn', 'pornhub', 'xvideos', 'nsfw', 'adult content', 'xxx'];
    blocked_domains TEXT[] := ARRAY['malware-site.com', 'phish-bank.net', 'virus-download.org', 'spyware-central.com', 'illegal-content.xyz', 'darkweb-link.ru', 'scam-cash.info', 'class1-content.gov.au', 'bit.ly/malicious-link', 'tinyurl.com/spyware-redir', 'pornhub.com', 'xvideos.com', 'xnxx.com', 'redtube.com', 'youporn.com', 'onlyfans.com', 'xhamster.com', 'chaturbate.com', 'bongacams.com', 'stripchat.com', 'spankbang.com'];
    kw TEXT;
    dom TEXT;
BEGIN
    -- Ensure user_id is authoritatively set to the session user if empty
    IF NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
    END IF;

    IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to post links.';
    END IF;

    -- Validate content length
    IF NEW.text IS NULL OR length(trim(NEW.text)) = 0 OR length(trim(NEW.text)) > 40 THEN
        RAISE EXCEPTION 'Text must be between 1 and 40 characters.';
    END IF;

    -- Enforce URL format using basic regex
    IF NEW.url IS NULL OR NOT (NEW.url ~* '^https?://[^\s/$.?#].[^\s]*$') THEN
        RAISE EXCEPTION 'Invalid link URL format. Enter a valid web address.';
    END IF;

    -- Moderation: Check keyword blocklist
    lower_text := lower(NEW.text);
    lower_url := lower(NEW.url);
    FOREACH kw IN ARRAY blocked_keywords LOOP
        IF position(kw in lower_text) > 0 OR position(kw in lower_url) > 0 THEN
            RAISE EXCEPTION 'Content contains blocked keywords or phrases.';
        END IF;
    END LOOP;

    -- Moderation: Check domain blocklist
    FOREACH dom IN ARRAY blocked_domains LOOP
        IF position(dom in lower_url) > 0 THEN
            RAISE EXCEPTION 'Blocked by DB Moderation: Malicious or illegal destination domain detected.';
        END IF;
    END LOOP;

    -- Atomic Credit Check and Deduction
    -- Select and lock the profile row
    SELECT credits INTO user_credits
    FROM public.profiles
    WHERE id = NEW.user_id
    FOR UPDATE;

    IF user_credits IS NULL OR user_credits < 1 THEN
        RAISE EXCEPTION 'INSUFFICIENT CREDITS TO POST A LINK.';
    END IF;

    -- Deduct 1 credit
    UPDATE public.profiles
    SET credits = credits - 1
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_on_post_created ON public.posts;
CREATE TRIGGER trg_on_post_created
BEFORE INSERT ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.on_post_created();


-- 4. SECURE POSTS INSERT POLICY (Restricted to authenticated users)
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to insert posts" ON public.posts;
CREATE POLICY "Allow authenticated users to insert posts"
ON public.posts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);


-- 5. SOCIAL SHARE CREDIT REWARDS (Unique platform claims & server-side awards)
-- Prevent multiple claims for the same platform per user, and automatically award +10 credits.

-- Add unique constraint to prevent duplicate platform claims per user
ALTER TABLE public.claimed_shares
DROP CONSTRAINT IF EXISTS unique_user_platform;

ALTER TABLE public.claimed_shares
ADD CONSTRAINT unique_user_platform UNIQUE (user_id, platform);

-- Trigger to award +10 credits automatically upon successful share claim
CREATE OR REPLACE FUNCTION public.on_share_claimed()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + 10
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_on_share_claimed ON public.claimed_shares;
CREATE TRIGGER trg_on_share_claimed
AFTER INSERT ON public.claimed_shares
FOR EACH ROW
EXECUTE FUNCTION public.on_share_claimed();


-- 6. PURCHASES SECURITY LOCKDOWN (Prevent client purchases simulation)
-- Lock down inserts into the purchases table so only Stripe webhooks (service_role) can write.

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Drop any existing client insert policies
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.purchases;
DROP POLICY IF EXISTS "Allow public insert" ON public.purchases;
DROP POLICY IF EXISTS "Allow user insert" ON public.purchases;
DROP POLICY IF EXISTS "Users can insert own purchases" ON public.purchases;

-- Keep/Create select policy so users can read their purchase history
DROP POLICY IF EXISTS "Users can view own purchases" ON public.purchases;
CREATE POLICY "Users can view own purchases"
ON public.purchases
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
