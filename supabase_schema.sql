
-- ZAO Chat Database Schema - Direct Messaging Only

-- Drop existing objects to prevent conflicts
DROP TRIGGER IF EXISTS trigger_auto_generate_username ON user_profiles CASCADE;
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles CASCADE;
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings CASCADE;
DROP TRIGGER IF EXISTS update_friendships_updated_at ON friendships CASCADE;
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages CASCADE;

DROP FUNCTION IF EXISTS generate_unique_username() CASCADE;
DROP FUNCTION IF EXISTS ensure_user_has_username(UUID) CASCADE;
DROP FUNCTION IF EXISTS auto_generate_username() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop tables if they exist
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS blocked_users CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User profiles table
CREATE TABLE user_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    email TEXT NOT NULL,
    phone_number TEXT,
    bio TEXT,
    avatar_url TEXT,
    profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'friends', 'private')),
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User settings table
CREATE TABLE user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    theme TEXT DEFAULT 'dark',
    notifications_enabled BOOLEAN DEFAULT true,
    sound_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Friendships table
CREATE TABLE friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    addressee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);

-- Messages table (direct messages only)
CREATE TABLE messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'file')),
    media_url TEXT,
    media_type TEXT,
    media_size BIGINT,
    media_name TEXT,
    is_edited BOOLEAN DEFAULT false,
    is_read BOOLEAN DEFAULT false,
    reply_to_id UUID REFERENCES messages(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blocked users table
CREATE TABLE blocked_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

-- Message reactions table
CREATE TABLE message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    reaction TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, reaction)
);

-- Push subscriptions table for notifications
CREATE TABLE push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_username ON user_profiles(username);
CREATE INDEX idx_user_profiles_is_online ON user_profiles(is_online);
CREATE INDEX idx_user_profiles_last_seen ON user_profiles(last_seen);
CREATE INDEX idx_user_profiles_visibility ON user_profiles(profile_visibility);

CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);
CREATE INDEX idx_friendships_both_users ON friendships(requester_id, addressee_id);

CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_conversation ON messages(user_id, recipient_id, created_at);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_read_status ON messages(is_read);

CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_id);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user ON message_reactions(user_id);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Create function to generate unique usernames
CREATE OR REPLACE FUNCTION generate_unique_username()
RETURNS TEXT AS $$
DECLARE
    new_username TEXT;
    counter INTEGER := 1;
    base_number INTEGER;
BEGIN
    -- Generate a random 6-digit number
    base_number := FLOOR(RANDOM() * 900000) + 100000;
    new_username := 'ZAO_' || LPAD(base_number::TEXT, 6, '0');
    
    -- Check if username exists and increment if needed
    WHILE EXISTS (SELECT 1 FROM user_profiles WHERE username = new_username) LOOP
        new_username := 'ZAO_' || LPAD((base_number + counter)::TEXT, 6, '0');
        counter := counter + 1;
        
        -- Prevent infinite loop
        IF counter > 1000 THEN
            base_number := FLOOR(RANDOM() * 900000) + 100000;
            counter := 1;
        END IF;
    END LOOP;
    
    RETURN new_username;
END;
$$ LANGUAGE plpgsql;

-- Create function to ensure user has username
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
    
    -- If no username or empty/undefined username, generate new one
    IF current_username IS NULL OR current_username = '' OR current_username = 'undefined' THEN
        new_username := generate_unique_username();
        
        UPDATE user_profiles 
        SET username = new_username, updated_at = NOW()
        WHERE user_id = user_uuid;
        
        RETURN new_username;
    END IF;
    
    RETURN current_username;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate username on user profile creation
CREATE OR REPLACE FUNCTION auto_generate_username()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate username if it's empty, null, or 'undefined'
    IF NEW.username IS NULL OR NEW.username = '' OR NEW.username = 'undefined' THEN
        NEW.username := generate_unique_username();
    END IF;
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_auto_generate_username
    BEFORE INSERT OR UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION auto_generate_username();

CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at 
    BEFORE UPDATE ON user_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_friendships_updated_at 
    BEFORE UPDATE ON friendships 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at 
    BEFORE UPDATE ON messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_push_subscriptions_updated_at 
    BEFORE UPDATE ON push_subscriptions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- User profiles policies
DROP POLICY IF EXISTS "Users can view public profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can view public profiles" ON user_profiles
    FOR SELECT USING (
        profile_visibility = 'public' OR 
        user_id = auth.uid() OR
        (profile_visibility = 'friends' AND EXISTS (
            SELECT 1 FROM friendships 
            WHERE ((requester_id = auth.uid() AND addressee_id = user_profiles.user_id) OR 
                   (addressee_id = auth.uid() AND requester_id = user_profiles.user_id))
            AND status = 'accepted'
        ))
    );

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- User settings policies
DROP POLICY IF EXISTS "Users can manage own settings" ON user_settings;
CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING (user_id = auth.uid());

-- Friendships policies
DROP POLICY IF EXISTS "Users can view their friendships" ON friendships;
DROP POLICY IF EXISTS "Users can create friend requests" ON friendships;
DROP POLICY IF EXISTS "Users can update friendships they're part of" ON friendships;
DROP POLICY IF EXISTS "Users can delete friendships they're part of" ON friendships;

CREATE POLICY "Users can view their friendships" ON friendships
    FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "Users can create friend requests" ON friendships
    FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update friendships they're part of" ON friendships
    FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "Users can delete friendships they're part of" ON friendships
    FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Messages policies (direct messages only)
DROP POLICY IF EXISTS "Users can view their direct messages" ON messages;
DROP POLICY IF EXISTS "Users can send direct messages" ON messages;
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON messages;

CREATE POLICY "Users can view their direct messages" ON messages
    FOR SELECT USING (
        user_id = auth.uid() OR recipient_id = auth.uid()
    );

CREATE POLICY "Users can send direct messages" ON messages
    FOR INSERT WITH CHECK (user_id = auth.uid() AND recipient_id IS NOT NULL);

CREATE POLICY "Users can update own messages" ON messages
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own messages" ON messages
    FOR DELETE USING (user_id = auth.uid());

-- Blocked users policies
DROP POLICY IF EXISTS "Users can manage their blocks" ON blocked_users;
CREATE POLICY "Users can manage their blocks" ON blocked_users
    FOR ALL USING (blocker_id = auth.uid());

-- Message reactions policies
DROP POLICY IF EXISTS "Users can manage message reactions" ON message_reactions;
CREATE POLICY "Users can manage message reactions" ON message_reactions
    FOR ALL USING (user_id = auth.uid());

-- Push subscriptions policies
DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- Create or update storage bucket for media files
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('media', 'media', true)
    ON CONFLICT (id) DO NOTHING;
END $$;

-- Storage policies for media bucket
DROP POLICY IF EXISTS "Users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Users can view media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;

CREATE POLICY "Users can upload media" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'media' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can view media" ON storage.objects
    FOR SELECT USING (bucket_id = 'media');

CREATE POLICY "Users can update own media" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'media' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own media" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'media' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
