-- ZAO Chat Application - Complete Supabase Database Schema
-- Run this script in your Supabase SQL Editor to create all required tables

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    email TEXT NOT NULL,
    phone_number TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    avatar_url TEXT,
    profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'friends', 'private')),
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    is_verified BOOLEAN DEFAULT false,
    verification_type TEXT DEFAULT NULL CHECK (verification_type IN ('email', 'phone', 'premium', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
    notifications_enabled BOOLEAN DEFAULT true,
    sound_enabled BOOLEAN DEFAULT true,
    profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'friends', 'private')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create friendships table
CREATE TABLE IF NOT EXISTS friendships (
    id BIGSERIAL PRIMARY KEY,
    requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id),
    CHECK (requester_id != addressee_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id BIGINT DEFAULT NULL,
    content TEXT NOT NULL DEFAULT '',
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'file')),
    media_url TEXT,
    media_type TEXT,
    media_size BIGINT,
    media_name TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (recipient_id IS NOT NULL AND group_id IS NULL) OR 
        (recipient_id IS NULL AND group_id IS NOT NULL)
    )
);

-- Create blocked_users table
CREATE TABLE IF NOT EXISTS blocked_users (
    id BIGSERIAL PRIMARY KEY,
    blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    admin_level TEXT DEFAULT 'admin' CHECK (admin_level IN ('admin', 'super_admin')),
    granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    permissions JSONB DEFAULT '{"can_verify_users": true, "can_manage_users": true, "can_view_analytics": true}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create verification_requests table
CREATE TABLE IF NOT EXISTS verification_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    requested_type TEXT DEFAULT 'email' CHECK (requested_type IN ('email', 'phone', 'premium', 'custom')),
    reason TEXT NOT NULL,
    supporting_info JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ DEFAULT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester_id ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_id ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON blocked_users(blocked_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_user_id ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_reviewed_by ON verification_requests(reviewed_by);

-- Function to generate unique usernames
CREATE OR REPLACE FUNCTION generate_unique_username()
RETURNS TEXT AS $$
DECLARE
    new_username TEXT;
    counter INTEGER := 0;
    base_number BIGINT;
BEGIN
    -- Generate a unique 6-digit number
    LOOP
        base_number := 100000 + floor(random() * 900000)::INTEGER;
        new_username := 'ZAO_' || base_number::TEXT;

        -- Check if username already exists
        IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE username = new_username) THEN
            EXIT;
        END IF;

        counter := counter + 1;
        -- Prevent infinite loop
        IF counter > 1000 THEN
            base_number := extract(epoch from now())::BIGINT % 1000000;
            new_username := 'ZAO_' || base_number::TEXT;
            EXIT;
        END IF;
    END LOOP;

    RETURN new_username;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure user has username
CREATE OR REPLACE FUNCTION ensure_user_has_username(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    current_username TEXT;
    new_username TEXT;
BEGIN
    -- Get current username
    SELECT username INTO current_username 
    FROM user_profiles 
    WHERE user_id = user_uuid;

    -- If no username or invalid username, generate new one
    IF current_username IS NULL OR current_username = '' OR current_username = 'undefined' THEN
        new_username := generate_unique_username();

        UPDATE user_profiles 
        SET username = new_username, updated_at = NOW()
        WHERE user_id = user_uuid;

        RETURN new_username;
    ELSE
        RETURN current_username;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate username for new users
CREATE OR REPLACE FUNCTION auto_generate_username()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.username IS NULL OR NEW.username = '' THEN
        NEW.username := generate_unique_username();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_username
    BEFORE INSERT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_username();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER trigger_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_friendships_updated_at
    BEFORE UPDATE ON friendships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- User Profiles Policies
CREATE POLICY "Users can view all public profiles" ON user_profiles
    FOR SELECT USING (profile_visibility = 'public' OR user_id = auth.uid());

CREATE POLICY "Users can view friends-only profiles if friends" ON user_profiles
    FOR SELECT USING (
        profile_visibility = 'friends' AND (
            user_id = auth.uid() OR
            EXISTS (
                SELECT 1 FROM friendships 
                WHERE status = 'accepted' AND (
                    (requester_id = auth.uid() AND addressee_id = user_profiles.user_id) OR
                    (addressee_id = auth.uid() AND requester_id = user_profiles.user_id)
                )
            )
        )
    );

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- User Settings Policies
CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING (user_id = auth.uid());

-- Friendships Policies
CREATE POLICY "Users can view own friendships" ON friendships
    FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "Users can create friend requests" ON friendships
    FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update friendships they're involved in" ON friendships
    FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "Users can delete friendships they're involved in" ON friendships
    FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Messages Policies
CREATE POLICY "Users can view their own messages" ON messages
    FOR SELECT USING (user_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users can send messages" ON messages
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own messages" ON messages
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own messages" ON messages
    FOR DELETE USING (user_id = auth.uid());

-- Blocked Users Policies
CREATE POLICY "Users can manage their blocked list" ON blocked_users
    FOR ALL USING (blocker_id = auth.uid());

-- Admin Users Policies
CREATE POLICY "Only admins can view admin users" ON admin_users
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Only super admins can manage admin users" ON admin_users
    FOR ALL USING (
        EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND admin_level = 'super_admin')
    );

-- Verification Requests Policies
CREATE POLICY "Users can view their own verification requests" ON verification_requests
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create verification requests" ON verification_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all verification requests" ON verification_requests
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Admins can update verification requests" ON verification_requests
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
    );

-- Create storage bucket for media if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for media bucket
CREATE POLICY "Users can upload their own media" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view media" ON storage.objects
    FOR SELECT USING (bucket_id = 'media');

CREATE POLICY "Users can update their own media" ON storage.objects
    FOR UPDATE USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own media" ON storage.objects
    FOR DELETE USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Sample data (optional - remove in production)
-- You can uncomment these to test with sample data
/*
INSERT INTO user_profiles (user_id, full_name, email, username, bio) VALUES 
(gen_random_uuid(), 'Test User 1', 'test1@example.com', 'ZAO_123456', 'Test user for development'),
(gen_random_uuid(), 'Test User 2', 'test2@example.com', 'ZAO_789012', 'Another test user');
*/

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM admin_users WHERE user_id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve verification request
CREATE OR REPLACE FUNCTION approve_verification_request(
    request_id BIGINT,
    admin_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
DECLARE
    request_data verification_requests%ROWTYPE;
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only admins can approve verification requests';
    END IF;

    -- Get request data
    SELECT * INTO request_data FROM verification_requests WHERE id = request_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verification request not found';
    END IF;

    IF request_data.status != 'pending' THEN
        RAISE EXCEPTION 'Request has already been reviewed';
    END IF;

    -- Update verification request
    UPDATE verification_requests 
    SET 
        status = 'approved',
        reviewed_by = auth.uid(),
        review_notes = admin_notes,
        reviewed_at = NOW()
    WHERE id = request_id;

    -- Update user profile with verification
    UPDATE user_profiles 
    SET 
        is_verified = true,
        verification_type = request_data.requested_type,
        updated_at = NOW()
    WHERE user_id = request_data.user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject verification request
CREATE OR REPLACE FUNCTION reject_verification_request(
    request_id BIGINT,
    admin_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only admins can reject verification requests';
    END IF;

    -- Update verification request
    UPDATE verification_requests 
    SET 
        status = 'rejected',
        reviewed_by = auth.uid(),
        review_notes = admin_notes,
        reviewed_at = NOW()
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verification request not found or already reviewed';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to make user admin (only for initial setup)
CREATE OR REPLACE FUNCTION make_user_admin(
    target_email TEXT,
    admin_level TEXT DEFAULT 'admin'
)
RETURNS BOOLEAN AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Only allow if no admins exist yet (initial setup)
    IF EXISTS (SELECT 1 FROM admin_users) THEN
        -- If admins exist, check if current user is super_admin
        IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND admin_level = 'super_admin') THEN
            RAISE EXCEPTION 'Only super admins can create new admins';
        END IF;
    END IF;

    -- Get user ID from email
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User with email % not found', target_email;
    END IF;

    -- Insert admin record
    INSERT INTO admin_users (user_id, admin_level, granted_by)
    VALUES (target_user_id, admin_level, COALESCE(auth.uid(), target_user_id))
    ON CONFLICT (user_id) DO UPDATE SET
        admin_level = EXCLUDED.admin_level,
        granted_by = EXCLUDED.granted_by,
        updated_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'ZAO Chat database schema created successfully!';
    RAISE NOTICE 'Tables created: user_profiles, user_settings, friendships, messages, blocked_users, admin_users, verification_requests';
    RAISE NOTICE 'Functions created: generate_unique_username, ensure_user_has_username, is_admin, approve_verification_request, reject_verification_request, make_user_admin';
    RAISE NOTICE 'RLS policies enabled for security';
    RAISE NOTICE 'Storage bucket "media" configured';
    RAISE NOTICE '';
    RAISE NOTICE 'ADMIN SETUP: To make yourself admin, run:';
    RAISE NOTICE 'SELECT make_user_admin(''your-email@example.com'', ''super_admin'');';
END $$;