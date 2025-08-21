
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS blocked_users CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- Drop existing functions and triggers
DROP FUNCTION IF EXISTS generate_unique_zao_username() CASCADE;
DROP FUNCTION IF EXISTS auto_generate_username() CASCADE;
DROP FUNCTION IF EXISTS update_existing_users_with_usernames() CASCADE;
DROP FUNCTION IF EXISTS ensure_user_has_username(UUID) CASCADE;

-- Create user_profiles table
CREATE TABLE user_profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    email TEXT NOT NULL,
    phone_number TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_settings table
CREATE TABLE user_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    sound_enabled BOOLEAN DEFAULT TRUE,
    profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'friends', 'private')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create friendships table
CREATE TABLE friendships (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);

-- Create messages table
CREATE TABLE messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'file')),
    media_url TEXT DEFAULT '',
    media_type TEXT DEFAULT '',
    media_size INTEGER DEFAULT 0,
    media_name TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('message', 'friend_request', 'group_invite', 'system')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create blocked_users table
CREATE TABLE blocked_users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

-- Username generation function
CREATE OR REPLACE FUNCTION generate_unique_zao_username()
RETURNS TEXT AS $$
DECLARE
    username_candidate TEXT;
    counter INTEGER := 1;
    max_attempts INTEGER := 100000;
BEGIN
    LOOP
        username_candidate := 'ZAO_' || LPAD(counter::TEXT, 6, '0');

        IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE username = username_candidate) THEN
            RETURN username_candidate;
        END IF;

        counter := counter + 1;

        IF counter > max_attempts THEN
            RAISE EXCEPTION 'Unable to generate unique ZAO username after % attempts', max_attempts;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to auto-generate username for new users
CREATE OR REPLACE FUNCTION auto_generate_username()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.username IS NULL OR NEW.username = '' OR NEW.username = 'undefined' THEN
        NEW.username := generate_unique_zao_username();
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-generating usernames on INSERT and UPDATE
CREATE TRIGGER auto_generate_username_trigger
    BEFORE INSERT OR UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_username();

-- Function to update existing users with usernames
CREATE OR REPLACE FUNCTION update_existing_users_with_usernames()
RETURNS VOID AS $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT user_id FROM user_profiles 
        WHERE username IS NULL OR username = '' OR username = 'undefined'
    LOOP
        UPDATE user_profiles 
        SET username = generate_unique_zao_username(),
            updated_at = NOW()
        WHERE user_id = user_record.user_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to ensure user has username (called from application)
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
        new_username := generate_unique_zao_username();

        UPDATE user_profiles 
        SET username = new_username,
            updated_at = NOW()
        WHERE user_id = user_uuid;

        RETURN new_username;
    END IF;

    RETURN current_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- User profiles policies (more permissive for debugging)
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Enable read access for all users" ON user_profiles
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update for users based on user_id" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- User settings policies
DROP POLICY IF EXISTS "Users can manage own settings" ON user_settings;

CREATE POLICY "Enable all for users based on user_id" ON user_settings
    FOR ALL USING (auth.uid() = user_id);

-- Friendships policies
DROP POLICY IF EXISTS "Users can view friendships they're part of" ON friendships;
DROP POLICY IF EXISTS "Users can create friendship requests" ON friendships;
DROP POLICY IF EXISTS "Users can update friendships they're part of" ON friendships;
DROP POLICY IF EXISTS "Users can delete their friendship requests" ON friendships;

CREATE POLICY "Enable read access for users part of friendship" ON friendships
    FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Enable insert for authenticated users only" ON friendships
    FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Enable update for users part of friendship" ON friendships
    FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Enable delete for users part of friendship" ON friendships
    FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Messages policies
DROP POLICY IF EXISTS "Users can view messages they sent or received" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;

CREATE POLICY "Enable read access for message participants" ON messages
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = recipient_id);

CREATE POLICY "Enable insert for authenticated users only" ON messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notifications policies
DROP POLICY IF EXISTS "Users can manage own notifications" ON notifications;

CREATE POLICY "Enable all for users based on user_id" ON notifications
    FOR ALL USING (auth.uid() = user_id);

-- Blocked users policies
DROP POLICY IF EXISTS "Users can manage their blocked users" ON blocked_users;

CREATE POLICY "Enable all for users based on blocker_id" ON blocked_users
    FOR ALL USING (auth.uid() = blocker_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_friendships_requester_addressee ON friendships(requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Update existing users with usernames (run this after schema creation)
SELECT update_existing_users_with_usernames();
