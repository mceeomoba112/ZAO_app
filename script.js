// Supabase configuration
const SUPABASE_URL = 'https://dtieffqfbepwpuogjurq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aWVmZnFmYmVwd3B1b2dqdXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2MjI5NTYsImV4cCI6MjA3MTE5ODk1Nn0.WlsC2x1TQJhc5uJjjqWtwsd0lgC0Yk3yikG-FRvnOzU';

// Initialize Supabase client with error handling
let supabase;
try {
    if (typeof window !== 'undefined' && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized successfully');
    } else {
        throw new Error('Supabase library not loaded');
    }
} catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    showError('Failed to initialize authentication system. Please refresh the page.');
}

let currentUser = null;
let currentUserProfile = null;
let messagesSubscription = null;
let activeChat = null;
let activeChatType = 'user'; // 'user' or 'group'
let notificationPermission = 'default';
let isOnline = navigator.onLine;
let lastActivity = Date.now();

// Test Supabase connection
async function testSupabaseConnection() {
    try {
        if (!supabase) {
            throw new Error('Supabase client not initialized');
        }

        // Test connection by trying to get session
        const { data, error } = await supabase.auth.getSession();
        
        if (error && !error.message.includes('No active session')) {
            throw error;
        }

        console.log('Supabase connection test successful');
        return true;
    } catch (error) {
        console.error('Supabase connection test failed:', error);
        showError('Connection to authentication service failed. Please check your internet connection and try again.');
        return false;
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    // Test connection first
    const connectionOk = await testSupabaseConnection();
    
    if (connectionOk) {
        await checkAuthState();
        setupEventListeners();
        initializeMobileFeatures();
        initializeNotifications();
        setupActivityTracking();
        registerServiceWorker();
        setupNetworkStatusIndicator();
    } else {
        showError('Unable to connect to authentication service. Please refresh the page and try again.');
    }
});

// Register service worker for PWA
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered successfully:', registration.scope);

            // Handle service worker updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showError('App updated! Refresh to see changes.', 'success');
                    }
                });
            });
        } catch (error) {
            console.log('Service Worker registration failed:', error);
        }
    }
}

// Setup network status indicator
function setupNetworkStatusIndicator() {
    // Create network status element
    const networkStatus = document.createElement('div');
    networkStatus.className = 'network-status';
    networkStatus.id = 'network-status';
    document.body.prepend(networkStatus);

    function updateNetworkStatus() {
        const isOnline = navigator.onLine;
        networkStatus.textContent = isOnline ? 'Back online' : 'No internet connection';
        networkStatus.className = `network-status ${isOnline ? 'online' : ''} show`;

        // Hide online message after 3 seconds
        if (isOnline) {
            setTimeout(() => {
                networkStatus.classList.remove('show');
            }, 3000);
        }
    }

    // Update on network change
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // Initial check
    if (!navigator.onLine) {
        updateNetworkStatus();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Close modals when clicking outside
    window.onclick = function(event) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.classList.add('hidden');
            }
        });
    };

    // Handle online/offline status
    window.addEventListener('online', () => {
        isOnline = true;
        showError('Connection restored', 'success');
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        showError('Connection lost - you are offline', 'error');
    });

    // Handle visibility change for activity tracking
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            updateUserStatus(false);
        } else {
            updateUserStatus(true);
            lastActivity = Date.now();
        }
    });
}

// Initialize mobile features
function initializeMobileFeatures() {
    // Add viewport meta tag for mobile optimization
    if (!document.querySelector('meta[name="viewport"]')) {
        const viewport = document.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(viewport);
    }

    // Add mobile app capabilities
    const webAppCapable = document.createElement('meta');
    webAppCapable.name = 'mobile-web-app-capable';
    webAppCapable.content = 'yes';
    document.head.appendChild(webAppCapable);

    const appleWebAppCapable = document.createElement('meta');
    appleWebAppCapable.name = 'apple-mobile-web-app-capable';
    appleWebAppCapable.content = 'yes';
    document.head.appendChild(appleWebAppCapable);

    const appleWebAppStatus = document.createElement('meta');
    appleWebAppStatus.name = 'apple-mobile-web-app-status-bar-style';
    appleWebAppStatus.content = 'black-translucent';
    document.head.appendChild(appleWebAppStatus);

    // Prevent zoom on input focus (iOS)
    document.querySelectorAll('input, select, textarea').forEach(element => {
        element.addEventListener('focus', () => {
            if (window.innerWidth < 768) {
                document.querySelector('meta[name="viewport"]').content = 
                    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            }
        });

        element.addEventListener('blur', () => {
            if (window.innerWidth < 768) {
                document.querySelector('meta[name="viewport"]').content = 
                    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            }
        });
    });

    // Handle mobile keyboard
    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                messagesContainer.style.height = `${window.visualViewport.height - 200}px`;
            }
        });
    }

    // Add touch gestures for mobile
    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });

    document.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        // Swipe right to open sidebar (mobile)
        if (Math.abs(diffX) > Math.abs(diffY) && diffX < -100 && touchStartX < 50) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && window.innerWidth < 768) {
                sidebar.classList.add('open');
            }
        }

        // Swipe left to close sidebar (mobile)
        if (Math.abs(diffX) > Math.abs(diffY) && diffX > 100) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        }
    });
}

// Initialize push notifications
async function initializePushNotifications() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return;
    }

    if (!('serviceWorker' in navigator)) {
        console.log('This browser does not support service workers');
        return;
    }

    try {
        // Request notification permission
        notificationPermission = await Notification.requestPermission();

        if (notificationPermission === 'granted') {
            console.log('Notification permission granted');

            // Register service worker for push notifications
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration);

            // Subscribe to push notifications
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array('YOUR_VAPID_PUBLIC_KEY') // You'll need to generate VAPID keys
            });

            // Save subscription to database
            await savePushSubscription(subscription);
        }
    } catch (error) {
        console.error('Error setting up push notifications:', error);
    }
}

// Initialize notifications
function initializeNotifications() {
    if ('Notification' in window) {
        notificationPermission = Notification.permission;

        if (notificationPermission === 'default') {
            // Show notification request prompt after user interaction
            setTimeout(() => {
                if (currentUser) {
                    requestNotificationPermission();
                }
            }, 5000);
        }
    }
}

// Request notification permission with device integration
async function requestNotificationPermission() {
    try {
        // Check if notifications are supported
        if (!('Notification' in window)) {
            showError('Notifications are not supported on this device', 'error');
            return;
        }

        const permission = await Notification.requestPermission();
        notificationPermission = permission;

        if (permission === 'granted') {
            showError('🔔 Device notifications enabled!', 'success');

            // Update user settings
            await supabase
                .from('user_settings')
                .upsert({ 
                    user_id: currentUser.id,
                    notifications_enabled: true,
                    sound_enabled: true
                }, {
                    onConflict: 'user_id'
                });

            // Register for push notifications if supported
            await registerForPushNotifications();

            // Enable sound notifications on the device
            enableDeviceSounds();

        } else if (permission === 'denied') {
            showError('❌ Notifications blocked. Please enable them in your browser settings for the best experience.', 'error');

            // Update settings to reflect user choice
            await supabase
                .from('user_settings')
                .upsert({ 
                    user_id: currentUser.id,
                    notifications_enabled: false 
                }, {
                    onConflict: 'user_id'
                });
        } else {
            showError('Notification permission pending. Click the notification icon in your address bar to enable.', 'error');
        }
    } catch (error) {
        console.error('Error requesting notification permission:', error);
        showError('Error setting up notifications: ' + error.message, 'error');
    }
}

// Register for push notifications
async function registerForPushNotifications() {
    try {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            const registration = await navigator.serviceWorker.register('/sw.js');

            // Check if user is already subscribed
            const existingSubscription = await registration.pushManager.getSubscription();

            if (!existingSubscription) {
                console.log('Setting up push notifications...');
                // In a real app, you would subscribe with your VAPID keys here
                // For now, we'll just log that the setup is ready
            }
        }
    } catch (error) {
        console.error('Error setting up push notifications:', error);
    }
}

// Enable device sounds for notifications
function enableDeviceSounds() {
    try {
        // Create audio context for notification sounds (if supported)
        if ('AudioContext' in window || 'webkitAudioContext' in window) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Store the audio context for playing notification sounds
            window.notificationAudioContext = audioContext;

            console.log('Device audio for notifications enabled');
        }
    } catch (error) {
        console.error('Error enabling device sounds:', error);
    }
}

// Play notification sound
function playNotificationSound() {
    try {
        if (window.notificationAudioContext) {
            // Create a simple notification beep
            const oscillator = window.notificationAudioContext.createOscillator();
            const gainNode = window.notificationAudioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(window.notificationAudioContext.destination);

            oscillator.frequency.setValueAtTime(800, window.notificationAudioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, window.notificationAudioContext.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0.3, window.notificationAudioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, window.notificationAudioContext.currentTime + 0.2);

            oscillator.start(window.notificationAudioContext.currentTime);
            oscillator.stop(window.notificationAudioContext.currentTime + 0.2);
        }
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}

// Setup activity tracking with more frequent updates
function setupActivityTracking() {
    // Update last activity every 10 seconds when user is active
    setInterval(() => {
        if (currentUser && document.visibilityState === 'visible') {
            lastActivity = Date.now();
            updateUserStatus(true);
        }
    }, 10000);

    // Check for inactive users and update status every 30 seconds
    setInterval(() => {
        if (currentUser && Date.now() - lastActivity > 120000) { // 2 minutes
            updateUserStatus(false);
        }
    }, 30000);

    // Track user activity events
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, () => {
            if (currentUser) {
                lastActivity = Date.now();
                if (document.visibilityState === 'visible') {
                    updateUserStatus(true);
                }
            }
        }, { passive: true });
    });
}

// Update user online status
async function updateUserStatus(isOnline) {
    if (!currentUser) return;

    try {
        await supabase
            .from('user_profiles')
            .update({
                is_online: isOnline,
                last_seen: new Date().toISOString()
            })
            .eq('user_id', currentUser.id);
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}

// Show local notification with sound
function showLocalNotification(title, body, data = {}) {
    if (notificationPermission !== 'granted') {
        return;
    }

    // Check user's sound preference
    const soundEnabled = currentUserProfile?.sound_enabled !== false;

    const notification = new Notification(title, {
        body: body,
        icon: '/icon-192.png', // You'll need to add this icon
        badge: '/badge-72.png', // You'll need to add this badge
        tag: data.type || 'message',
        data: data,
        requireInteraction: false,
        silent: !soundEnabled // Use user's sound preference
    });

    // Play custom notification sound if enabled and app is not visible
    if (soundEnabled && document.visibilityState === 'hidden') {
        playNotificationSound();
    }

    notification.onclick = function() {
        window.focus();
        notification.close();

        // Handle notification click based on type
        if (data.type === 'message' && data.sender_id) {
            // Find and open chat with sender
            const senderElement = document.querySelector(`[data-user-id="${data.sender_id}"]`);
            if (senderElement) {
                senderElement.click();
            }
        }
    };

    // Auto close notification after 6 seconds
    setTimeout(() => {
        notification.close();
    }, 6000);

    // Vibrate device if supported (for mobile)
    if ('vibrate' in navigator && soundEnabled) {
        navigator.vibrate([200, 100, 200]);
    }
}

// Helper function for VAPID key conversion
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Check if user is authenticated
async function checkAuthState() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('Error getting session:', error);
            showAuthInterface();
            return;
        }

        if (session && session.user) {
            currentUser = session.user;
            
            try {
                await loadUserProfile();
                showChatInterface();
                
                // Load data with error handling
                await Promise.allSettled([
                    loadFriends(),
                    loadGroups(),
                    loadFriendRequests()
                ]);
                
                subscribeToMessages();
            } catch (profileError) {
                console.error('Error loading user data:', profileError);
                showError('Error loading profile data. Please try refreshing the page.', 'error');
            }
        } else {
            showAuthInterface();
        }
    } catch (error) {
        console.error('Error in checkAuthState:', error);
        showAuthInterface();
    }
}

// Load user profile data
async function loadUserProfile() {
    try {
        let { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();

        if (error && error.code === 'PGRST116') {
            // Profile doesn't exist, create it
            await createUserProfile();
            // Try loading again
            const result = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', currentUser.id)
                .single();
            data = result.data;
            error = result.error;
        }

        if (error) throw error;

        if (data) {
            currentUserProfile = data;
            document.getElementById('user-name').textContent = data.full_name;
            document.getElementById('user-username').textContent = `@${data.username}`;

            // Set avatar with first letter of name or profile picture
            const avatar = document.getElementById('user-avatar');
            if (data.avatar_url) {
                avatar.innerHTML = `<img src="${data.avatar_url}" alt="Profile Picture" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            } else {
                avatar.innerHTML = data.full_name.charAt(0).toUpperCase();
            }

            // Check if user needs username (for existing users)
            if (!data.username || data.username === '' || data.username === 'undefined') {
                await ensureUserHasUsername();
            }

            // Auto-enable notifications for existing users
            await ensureNotificationsEnabled();
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Ensure user has a username (for existing users)
async function ensureUserHasUsername() {
    try {
        // Use the database function to ensure username
        const { data, error } = await supabase.rpc('ensure_user_has_username', {
            user_uuid: currentUser.id
        });

        if (error) {
            console.error('Error calling ensure_user_has_username:', error);
            // Fallback: try to generate username directly
            await generateUsernameDirectly();
            return;
        }

        if (data) {
            // Update current profile with new username
            if (currentUserProfile) {
                currentUserProfile.username = data;
            }
            
            // Update UI elements
            const usernameElement = document.getElementById('user-username');
            if (usernameElement) {
                usernameElement.textContent = `@${data}`;
            }

            const settingsUsernameElement = document.getElementById('settings-username');
            if (settingsUsernameElement) {
                settingsUsernameElement.value = data;
                settingsUsernameElement.style.color = '#667eea';
                settingsUsernameElement.style.fontWeight = '600';
            }

            console.log('Username assigned successfully:', data);
        }
    } catch (error) {
        console.error('Error ensuring username:', error);
        await generateUsernameDirectly();
    }
}

// Fallback function to generate username directly
async function generateUsernameDirectly() {
    try {
        // Generate a simple unique username
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 1000);
        const username = `ZAO_${timestamp.toString().slice(-6)}${randomNum.toString().padStart(3, '0')}`;

        const { error } = await supabase
            .from('user_profiles')
            .update({ username: username })
            .eq('user_id', currentUser.id);

        if (error) throw error;

        // Update current profile and UI
        if (currentUserProfile) {
            currentUserProfile.username = username;
        }

        const usernameElement = document.getElementById('user-username');
        if (usernameElement) {
            usernameElement.textContent = `@${username}`;
        }

        const settingsUsernameElement = document.getElementById('settings-username');
        if (settingsUsernameElement) {
            settingsUsernameElement.value = username;
            settingsUsernameElement.style.color = '#667eea';
            settingsUsernameElement.style.fontWeight = '600';
        }

        console.log('Username generated directly:', username);
    } catch (error) {
        console.error('Error generating username directly:', error);
    }
}

// Create user profile if it doesn't exist
async function createUserProfile() {
    try {
        const { error } = await supabase
            .from('user_profiles')
            .insert([
                {
                    user_id: currentUser.id,
                    full_name: currentUser.user_metadata?.full_name || currentUser.email.split('@')[0],
                    email: currentUser.email,
                    phone_number: currentUser.phone || '',
                    username: '' // Will be auto-generated by trigger
                }
            ]);

        if (error) throw error;

        // Create default settings
        await supabase
            .from('user_settings')
            .insert([
                {
                    user_id: currentUser.id,
                    theme: 'dark',
                    notifications_enabled: true,
                    sound_enabled: true,
                    profile_visibility: 'public'
                }
            ]);

        // Reload profile
        await loadUserProfile();
    } catch (error) {
        console.error('Error creating profile:', error);
    }
}

// Ensure notifications are enabled and request permission
async function ensureNotificationsEnabled() {
    try {
        // Load user settings
        const { data: settings } = await supabase
            .from('user_settings')
            .select('notifications_enabled, sound_enabled')
            .eq('user_id', currentUser.id)
            .single();

        if (settings && settings.notifications_enabled && notificationPermission !== 'granted') {
            // Auto-request notification permission if user has it enabled in settings
            setTimeout(() => {
                requestNotificationPermission();
            }, 1000);
        }
    } catch (error) {
        console.error('Error checking notification settings:', error);
    }
}

// Show/Hide interfaces
function showAuthInterface() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('chat-container').classList.add('hidden');
}

function showChatInterface() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('chat-container').classList.remove('hidden');

    // Ensure cancel button is hidden when chat interface loads
    const cancelButton = document.querySelector('.cancel-chat-button');
    if (cancelButton) {
        cancelButton.classList.add('hidden');
    }
}

// Tab switching
function showLogin() {
    document.getElementById('login-tab').classList.add('active');
    document.getElementById('register-tab').classList.remove('active');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
}

function showRegister() {
    document.getElementById('register-tab').classList.add('active');
    document.getElementById('login-tab').classList.remove('active');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
}

// Navigation tabs
function showChats() {
    setActiveNavTab(0);
    document.getElementById('chats-content').classList.remove('hidden');
    document.getElementById('friends-content').classList.add('hidden');
    document.getElementById('friend-requests-content').classList.add('hidden');
}

function showFriends() {
    setActiveNavTab(1);
    document.getElementById('chats-content').classList.add('hidden');
    document.getElementById('friends-content').classList.remove('hidden');
    document.getElementById('friend-requests-content').classList.add('hidden');
}

function showFriendRequests() {
    setActiveNavTab(2);
    document.getElementById('chats-content').classList.add('hidden');
    document.getElementById('friends-content').classList.add('hidden');
    document.getElementById('friend-requests-content').classList.remove('hidden');
}

function setActiveNavTab(index) {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach((tab, i) => {
        tab.classList.toggle('active', i === index);
    });
}

// Handle registration
async function handleRegister(event) {
    event.preventDefault();

    const fullName = document.getElementById('register-fullname').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const phone = document.getElementById('register-phone').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    // Validation
    if (!fullName) {
        showError('Please enter your full name');
        return;
    }

    if (!email || !email.includes('@')) {
        showError('Please enter a valid email address');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    if (!supabase) {
        showError('Authentication system not available. Please refresh the page.');
        return;
    }

    try {
        showError('Creating account...', 'success');

        // Sign up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    phone: phone
                }
            }
        });

        if (error) {
            console.error('Registration error:', error);
            if (error.message.includes('User already registered')) {
                showError('An account with this email already exists. Please try logging in instead.');
            } else if (error.message.includes('Invalid email')) {
                showError('Please enter a valid email address.');
            } else {
                showError('Registration failed: ' + error.message);
            }
            return;
        }

        if (data.user) {
            // Wait a moment for auth to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Create user profile with auto-generated username
            const { error: profileError } = await supabase
                .from('user_profiles')
                .insert([
                    {
                        user_id: data.user.id,
                        full_name: fullName,
                        email: email,
                        phone_number: phone,
                        username: '' // Will be auto-generated by trigger
                    }
                ]);

            if (profileError) throw profileError;

            // Create default user settings with notifications enabled
            const { error: settingsError } = await supabase
                .from('user_settings')
                .insert([
                    {
                        user_id: data.user.id,
                        theme: 'dark',
                        notifications_enabled: true,
                        sound_enabled: true,
                        profile_visibility: 'public'
                    }
                ]);

            if (settingsError) throw settingsError;

            // Ensure username is assigned immediately for new accounts
            await ensureUserHasUsername();

            // Automatically request notification permissions for new users
            setTimeout(() => {
                requestNotificationPermission();
            }, 2000);

            showError('Registration successful! Please check your email to verify your account.', 'success');
        }
    } catch (error) {
        showError(error.message);
    }
}

// Handle login
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    // Validation
    if (!email || !email.includes('@')) {
        showError('Please enter a valid email address');
        return;
    }

    if (!password) {
        showError('Please enter your password');
        return;
    }

    if (!supabase) {
        showError('Authentication system not available. Please refresh the page.');
        return;
    }

    try {
        showError('Signing in...', 'success');

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error('Login error:', error);
            if (error.message.includes('Invalid login credentials')) {
                showError('Invalid email or password. Please check your credentials and try again.');
            } else if (error.message.includes('Email not confirmed')) {
                showError('Please check your email and click the confirmation link before signing in.');
            } else {
                showError('Login failed: ' + error.message);
            }
            return;
        }

        currentUser = data.user;
        await loadUserProfile();
        showChatInterface();
        await loadFriends();
        await loadGroups();
        await loadFriendRequests();
        subscribeToMessages();
    } catch (error) {
        showError(error.message);
    }
}

// Handle logout with proper cleanup
async function handleLogout() {
    try {
        // Update user status to offline before logout
        if (currentUser) {
            await updateUserStatus(false);
        }

        // Cleanup subscriptions and intervals
        if (messagesSubscription) {
            messagesSubscription.unsubscribe();
            messagesSubscription = null;
        }

        if (window.messageRefreshInterval) {
            clearInterval(window.messageRefreshInterval);
            window.messageRefreshInterval = null;
        }

        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        // Reset all global variables
        currentUser = null;
        currentUserProfile = null;
        activeChat = null;
        activeChatType = null;

        // Clear UI
        showAuthInterface();
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('user-list').innerHTML = '';
        document.getElementById('friends-list').innerHTML = '';
        document.getElementById('friend-requests-list').innerHTML = '';

        console.log('User logged out successfully');
    } catch (error) {
        console.error('Error during logout:', error);
        showError(error.message);
    }
}

// Load friends list
async function loadFriends() {
    try {
        // Get friendships first
        const { data: friendships, error: friendshipError } = await supabase
            .from('friendships')
            .select('*')
            .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');

        if (friendshipError) throw friendshipError;

        const friendsList = document.getElementById('friends-list');
        const userList = document.getElementById('user-list');

        friendsList.innerHTML = '';
        userList.innerHTML = '';

        if (friendships && friendships.length > 0) {
            // Get friend user IDs
            const friendIds = friendships.map(friendship => 
                friendship.requester_id === currentUser.id 
                    ? friendship.addressee_id 
                    : friendship.requester_id
            );

            // Get friend profiles
            const { data: friendProfiles, error: profileError } = await supabase
                .from('user_profiles')
                .select('full_name, username, avatar_url, user_id')
                .in('user_id', friendIds);

            if (profileError) throw profileError;

            friendProfiles.forEach(friend => {
                const friendElement = createUserElement(friend, 'friend');
                friendsList.appendChild(friendElement);

                const chatElement = createUserElement(friend, 'chat');
                userList.appendChild(chatElement);
            });
        }
    } catch (error) {
        console.error('Error loading friends:', error);
        showError('Error loading friends: ' + error.message, 'error');
    }
}

// Groups functionality removed
async function loadGroups() {
    // Groups functionality has been removed
    const groupsList = document.getElementById('group-list');
    if (groupsList) {
        groupsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">Groups have been disabled</p>';
    }
}

// Load friend requests
async function loadFriendRequests() {
    try {
        // Ensure user is logged in
        if (!currentUser || !currentUser.id) {
            console.log('User not logged in, skipping friend requests load');
            return;
        }

        // Get pending requests with better error handling
        const { data: requests, error: requestError } = await supabase
            .from('friendships')
            .select('*')
            .eq('addressee_id', currentUser.id)
            .eq('status', 'pending');

        if (requestError) {
            console.error('Error loading friend requests:', requestError);
            
            // Handle specific error types
            if (requestError.code === '42501' || requestError.message.includes('permission denied')) {
                console.log('Permission denied for friendships table - user may need to re-authenticate');
                // Don't show error to user, just log and continue
                const friendRequestsList = document.getElementById('friend-requests-list');
                if (friendRequestsList) {
                    friendRequestsList.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center; padding: 20px;">Unable to load friend requests. Please try refreshing the page.</p>';
                }
                return;
            }
            throw requestError;
        }

        const friendRequestsList = document.getElementById('friend-requests-list');
        friendRequestsList.innerHTML = '';

        // Update request count badge
        const requestCountBadge = document.getElementById('request-count');
        if (requestCountBadge) {
            if (!requests || requests.length === 0) {
                requestCountBadge.classList.add('hidden');
                requestCountBadge.textContent = '0';
            } else {
                requestCountBadge.classList.remove('hidden');
                requestCountBadge.textContent = requests.length.toString();
            }
        }

        if (!requests || requests.length === 0) {
            friendRequestsList.innerHTML = '<p style="color: rgba(255,255,255,0.6); text-align: center; padding: 20px;">No pending friend requests.</p>';
            return;
        }

        // Get requester profiles
        const requesterIds = requests.map(request => request.requester_id);
        const { data: requesterProfiles, error: profileError } = await supabase
            .from('user_profiles')
            .select('full_name, username, avatar_url, user_id')
            .in('user_id', requesterIds);

        if (profileError) throw profileError;

        requests.forEach(request => {
            const requester = requesterProfiles.find(profile => profile.user_id === request.requester_id);
            if (requester) {
                const requestWithProfile = {
                    ...request,
                    requester: requester
                };
                const friendRequestElement = createFriendRequestElement(requestWithProfile);
                friendRequestsList.appendChild(friendRequestElement);
            }
        });
    } catch (error) {
        console.error('Error loading friend requests:', error);
        showError('Error loading friend requests: ' + error.message, 'error');
    }
}

// Create user element with online indicators
function createUserElement(user, type) {
    const element = document.createElement('div');
    element.className = 'user-item';
    element.dataset.userId = user.user_id;
    element.onclick = () => {
        if (type === 'chat') {
            openChat(user);
        }
    };

    const avatar = user.avatar_url 
        ? `<img src="${user.avatar_url}" class="user-avatar" alt="${user.full_name}">` 
        : `<div class="user-avatar">${user.full_name.charAt(0).toUpperCase()}</div>`;

    const onlineIndicator = `<div class="online-indicator" id="online-${user.user_id}"></div>`;

    element.innerHTML = `
        <div class="user-avatar-container">
            ${avatar}
            ${onlineIndicator}
        </div>
        <div class="user-details">
            <div class="user-name">${user.full_name}</div>
            <div class="user-username">@${user.username}</div>
            <div class="user-status" id="status-${user.user_id}">Offline</div>
        </div>
    `;

    // Check and set initial online status
    checkUserOnlineStatus(user.user_id, element);

    return element;
}

// Check user online status
async function checkUserOnlineStatus(userId, element) {
    try {
        const { data } = await supabase
            .from('user_profiles')
            .select('is_online, last_seen')
            .eq('user_id', userId)
            .single();

        if (data) {
            updateUserOnlineIndicator(element, data.is_online, data.last_seen);
        }
    } catch (error) {
        console.error('Error checking online status:', error);
    }
}

// Update user online indicator
function updateUserOnlineIndicator(element, isOnline, lastSeen) {
    const indicator = element.querySelector('.online-indicator');
    const status = element.querySelector('.user-status');
    
    if (indicator) {
        if (isOnline) {
            indicator.className = 'online-indicator online';
            indicator.title = 'Online';
        } else {
            indicator.className = 'online-indicator offline';
            const lastSeenTime = new Date(lastSeen);
            const now = new Date();
            const diffMinutes = Math.floor((now - lastSeenTime) / (1000 * 60));
            
            if (diffMinutes < 5) {
                indicator.title = 'Just now';
            } else if (diffMinutes < 60) {
                indicator.title = `${diffMinutes} minutes ago`;
            } else {
                const diffHours = Math.floor(diffMinutes / 60);
                indicator.title = `${diffHours} hours ago`;
            }
        }
    }
    
    if (status) {
        if (isOnline) {
            status.textContent = 'Online';
            status.style.color = '#22c55e';
        } else {
            const lastSeenTime = new Date(lastSeen);
            const now = new Date();
            const diffMinutes = Math.floor((now - lastSeenTime) / (1000 * 60));
            
            if (diffMinutes < 5) {
                status.textContent = 'Just now';
            } else if (diffMinutes < 60) {
                status.textContent = `${diffMinutes}m ago`;
            } else {
                const diffHours = Math.floor(diffMinutes / 60);
                if (diffHours < 24) {
                    status.textContent = `${diffHours}h ago`;
                } else {
                    const diffDays = Math.floor(diffHours / 24);
                    status.textContent = `${diffDays}d ago`;
                }
            }
            status.style.color = 'rgba(255,255,255,0.6)';
        }
    }
}

// Group functionality removed

// Create friend request element
function createFriendRequestElement(request) {
    const element = document.createElement('div');
    element.className = 'friend-request-item';

    const requester = request.requester;
    const avatar = requester.avatar_url 
        ? `<img src="${requester.avatar_url}" class="user-avatar" alt="${requester.full_name}">` 
        : `<div class="user-avatar">${requester.full_name.charAt(0).toUpperCase()}</div>`;

    element.innerHTML = `
        ${avatar}
        <div class="user-details">
            <div class="user-name">${requester.full_name}</div>
            <div class="user-username">@${requester.username}</div>
            <div class="request-actions">
                <button class="accept-request-button" data-request-id="${request.id}" data-requester-id="${requester.user_id}">Accept</button>
                <button class="reject-request-button" data-request-id="${request.id}">Reject</button>
            </div>
        </div>
    `;

    // Add event listeners for accept/reject buttons
    element.querySelector('.accept-request-button').addEventListener('click', () => acceptFriendRequest(request.id, requester.user_id));
    element.querySelector('.reject-request-button').addEventListener('click', () => rejectFriendRequest(request.id));

    return element;
}

// Accept friend request
async function acceptFriendRequest(requestId, requesterId) {
    try {
        // Update friendship status to 'accepted'
        const { error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', requestId);

        if (error) throw error;

        showError('Friend request accepted!', 'success');

        // Reload friends and requests
        await loadFriends();
        await loadFriendRequests();
    } catch (error) {
        showError('Error accepting request: ' + error.message);
    }
}

// Reject friend request
async function rejectFriendRequest(requestId) {
    try {
        // Delete the friendship request
        const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

        showError('Friend request rejected.', 'success');

        // Reload requests
        await loadFriendRequests();
    } catch (error) {
        showError('Error rejecting request: ' + error.message);
    }
}


// Open user chat
function openChat(user) {
    activeChat = user;
    activeChatType = 'user';

    // Update chat header
    document.getElementById('chat-title-text').textContent = user.full_name;

    // Enable message input
    document.getElementById('message-input').disabled = false;
    document.getElementById('message-input').placeholder = `Message ${user.full_name}...`;
    document.getElementById('send-button').disabled = false;

    // Show cancel button only when conversation is active
    const cancelButton = document.querySelector('.cancel-chat-button');
    if (cancelButton) {
        cancelButton.classList.remove('hidden');
    }

    // Load messages
    loadMessages();

    // Update active state
    updateActiveChat();

    // Close sidebar on mobile after selecting chat
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 768) {
        sidebar.classList.remove('open');
    }
}

// Group chat functionality removed

// Update active chat UI
function updateActiveChat() {
    // Remove active class from all items
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });

    // Add active class to current chat
    // This would need more specific targeting based on the chat ID
}

// Load messages for active chat
async function loadMessages() {
    if (!activeChat || activeChatType !== 'user') return;

    try {
        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                user_profiles(full_name, username)
            `)
            .or(`and(user_id.eq.${currentUser.id},recipient_id.eq.${activeChat.user_id}),and(user_id.eq.${activeChat.user_id},recipient_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) throw error;

        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = '';

        data.forEach(message => {
            displayMessage(message);
        });

        scrollToBottom();
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Subscribe to real-time messages
function subscribeToMessages() {
    // Unsubscribe from existing subscription if any
    if (messagesSubscription) {
        messagesSubscription.unsubscribe();
    }

    // Subscribe to ALL messages for current user (both sent and received)
    messagesSubscription = supabase
        .channel('messages_channel', {
            config: {
                broadcast: { self: true },
                presence: { key: currentUser.id }
            }
        })
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            },
            async (payload) => {
                console.log('New message detected:', payload);
                // Handle all messages and filter in the handler
                await handleNewMessage(payload);
            }
        )
        .on('presence', { event: 'sync' }, () => {
            updateOnlineUsers();
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('User joined:', key, newPresences);
            updateOnlineUsers();
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('User left:', key, leftPresences);
            updateOnlineUsers();
        })
        .subscribe(async (status) => {
            console.log('Subscription status:', status);
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to real-time updates');
                // Update user presence
                await messagesSubscription.track({
                    user_id: currentUser.id,
                    online_at: new Date().toISOString(),
                });
            }
        });

    // Auto-refresh every 3 seconds to ensure sync and get notifications
    if (window.messageRefreshInterval) {
        clearInterval(window.messageRefreshInterval);
    }
    
    window.messageRefreshInterval = setInterval(async () => {
        if (currentUser) {
            // Always refresh to check for new messages
            await refreshMessages();
            await updateFriendsOnlineStatus();
            await checkForNewNotifications();
        }
    }, 3000);
}

// Handle new message with better error handling
async function handleNewMessage(payload) {
    try {
        // Only process messages involving current user
        const isRelevant = payload.new.user_id === currentUser.id || payload.new.recipient_id === currentUser.id;
        if (!isRelevant) {
            return;
        }

        // Get user profile for the new message
        const { data: userProfile, error } = await supabase
            .from('user_profiles')
            .select('full_name, username')
            .eq('user_id', payload.new.user_id)
            .single();

        if (error) {
            console.error('Error fetching user profile:', error);
            return;
        }

        const messageWithProfile = {
            ...payload.new,
            user_profiles: userProfile
        };

        // Show notification if message is not from current user and app is not focused
        if (payload.new.user_id !== currentUser.id && document.hidden) {
            const senderName = userProfile ? userProfile.full_name : 'Someone';
            let notificationBody = '';

            if (payload.new.message_type === 'text') {
                notificationBody = payload.new.content;
            } else if (payload.new.message_type === 'image') {
                notificationBody = `📷 Image`;
            } else if (payload.new.message_type === 'video') {
                notificationBody = `🎥 Video`;
            }

            // Play notification sound and show notification
            playNotificationSound();
            showLocalNotification(
                `💬 ${senderName}`,
                notificationBody,
                {
                    type: 'message',
                    sender_id: payload.new.user_id,
                    message_id: payload.new.id
                }
            );
        }

        // Always refresh current conversation if message is relevant
        if (shouldDisplayMessage(messageWithProfile)) {
            // Force refresh the entire conversation to ensure sync
            setTimeout(async () => {
                await loadMessages();
            }, 100);
        }

        // Update friends list to show latest activity
        await loadFriends();
    } catch (error) {
        console.error('Error handling new message:', error);
    }
}

// Refresh messages from database
async function refreshMessages() {
    if (!activeChat || activeChatType !== 'user') return;

    try {
        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                user_profiles(full_name, username)
            `)
            .or(`and(user_id.eq.${currentUser.id},recipient_id.eq.${activeChat.user_id}),and(user_id.eq.${activeChat.user_id},recipient_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;

        // Always refresh to ensure latest messages are shown
        const messagesContainer = document.getElementById('chat-messages');
        const currentMessageIds = Array.from(document.querySelectorAll('.message')).map(el => el.dataset.messageId);
        const newMessageIds = data.map(msg => msg.id);

        // Check if there are any differences
        const hasNewMessages = newMessageIds.some(id => !currentMessageIds.includes(id));
        const hasMissingMessages = currentMessageIds.some(id => !newMessageIds.includes(id));

        if (hasNewMessages || hasMissingMessages || data.length !== currentMessageIds.length) {
            // Store scroll position
            const wasAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;
            
            // Clear and reload all messages
            messagesContainer.innerHTML = '';

            data.forEach(message => {
                displayMessage(message);
            });

            // Restore scroll position
            if (wasAtBottom) {
                scrollToBottom();
            }
        }
    } catch (error) {
        console.error('Error refreshing messages:', error);
    }
}

// Check for new notifications when app is in background
async function checkForNewNotifications() {
    if (!currentUser || !document.hidden) return;

    try {
        // Check for new messages received in the last 10 seconds
        const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
        
        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                user_profiles(full_name, username)
            `)
            .eq('recipient_id', currentUser.id)
            .gt('created_at', tenSecondsAgo)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Show notifications for recent messages
        data.forEach(message => {
            if (message.user_id !== currentUser.id) {
                const senderName = message.user_profiles?.full_name || 'Someone';
                let notificationBody = '';

                if (message.message_type === 'text') {
                    notificationBody = message.content;
                } else if (message.message_type === 'image') {
                    notificationBody = `📷 Image`;
                } else if (message.message_type === 'video') {
                    notificationBody = `🎥 Video`;
                }

                showLocalNotification(
                    `💬 ${senderName}`,
                    notificationBody,
                    {
                        type: 'message',
                        sender_id: message.user_id,
                        message_id: message.id
                    }
                );
            }
        });
    } catch (error) {
        console.error('Error checking for notifications:', error);
    }
}

// Update online status for friends
async function updateFriendsOnlineStatus() {
    try {
        const friendElements = document.querySelectorAll('.user-item');
        if (friendElements.length === 0) return;

        // Get all friend user IDs
        const userIds = Array.from(friendElements).map(el => el.dataset.userId).filter(Boolean);
        if (userIds.length === 0) return;

        // Batch query for all friends
        const { data: friendsStatus } = await supabase
            .from('user_profiles')
            .select('user_id, is_online, last_seen')
            .in('user_id', userIds);

        if (friendsStatus) {
            friendElements.forEach((element) => {
                const userId = element.dataset.userId;
                const userStatus = friendsStatus.find(status => status.user_id === userId);
                if (userStatus) {
                    updateUserOnlineIndicator(element, userStatus.is_online, userStatus.last_seen);
                }
            });
        }
    } catch (error) {
        console.error('Error updating online status:', error);
    }
}

// Update online users from presence
function updateOnlineUsers() {
    const presenceState = messagesSubscription.presenceState();
    console.log('Current presence state:', presenceState);
    
    // Update UI based on presence
    Object.keys(presenceState).forEach(userId => {
        const userElement = document.querySelector(`[data-user-id="${userId}"]`);
        if (userElement) {
            updateUserOnlineIndicator(userElement, true, new Date().toISOString());
        }
    });
}
}

// Check if message should be displayed in current chat
function shouldDisplayMessage(message) {
    if (!activeChat || activeChatType !== 'user') return false;

    return (message.user_id === currentUser.id && message.recipient_id === activeChat.user_id) ||
           (message.user_id === activeChat.user_id && message.recipient_id === currentUser.id);
}

// Display a message with duplicate prevention
function displayMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');
    
    // Check if message already exists
    const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
    if (existingMessage) {
        console.log('Message already displayed:', message.id);
        return;
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.user_id === currentUser.id ? 'own' : 'other'}`;
    messageElement.dataset.messageId = message.id;

    const messageTime = new Date(message.created_at).toLocaleTimeString();

    let contentHtml = '';

    if (message.message_type === 'text') {
        contentHtml = `<div class="message-content">${escapeHtml(message.content)}</div>`;
    } else if (message.message_type === 'image') {
        contentHtml = `
            <div class="message-content">${message.content ? escapeHtml(message.content) : ''}</div>
            <img src="${message.media_url}" class="message-media" alt="Image" onclick="openImageModal('${message.media_url}')">
        `;
    } else if (message.message_type === 'video') {
        contentHtml = `
            <div class="message-content">${message.content ? escapeHtml(message.content) : ''}</div>
            <video src="${message.media_url}" class="message-media" controls></video>
        `;
    }

    // Add sender name for other users' messages
    const senderName = message.user_id !== currentUser.id && message.user_profiles 
        ? `<div class="message-sender">${message.user_profiles.full_name}</div>` 
        : '';

    messageElement.innerHTML = `
        ${senderName}
        ${contentHtml}
        <div class="message-time">${messageTime}</div>
    `;

    messagesContainer.appendChild(messageElement);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Send message with better confirmation
async function sendMessage() {
    if (!activeChat || activeChatType !== 'user') return;

    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();

    if (!content) return;

    // Clear input immediately for better UX
    messageInput.value = '';

    try {
        const messageData = {
            content: content,
            user_id: currentUser.id,
            recipient_id: activeChat.user_id,
            message_type: 'text'
        };

        const { data, error } = await supabase
            .from('messages')
            .insert([messageData])
            .select(`
                *,
                user_profiles(full_name, username)
            `);

        if (error) throw error;

        // Display the message immediately
        if (data && data[0]) {
            const messageWithProfile = {
                ...data[0],
                user_profiles: currentUserProfile
            };
            
            // Always display immediately for sender
            displayMessage(messageWithProfile);
            scrollToBottom();
        }

        console.log('Message sent successfully:', data);
        
        // Force a refresh after sending to ensure sync
        setTimeout(async () => {
            await refreshMessages();
        }, 500);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Failed to send message: ' + error.message);
        // Restore message content if failed
        messageInput.value = content;
    }
}

// Media functions
function selectImage() {
    const input = document.getElementById('media-input');
    input.accept = 'image/*';
    input.click();
}

function selectVideo() {
    const input = document.getElementById('media-input');
    input.accept = 'video/*';
    input.click();
}

async function handleMediaUpload(event) {
    if (!activeChat) return;

    const file = event.target.files[0];
    if (!file) return;

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
        showError('File size must be less than 50MB');
        return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(file.type)) {
        showError('Unsupported file type. Please upload images (JPEG, PNG, GIF, WebP) or videos (MP4, WebM, MOV)');
        return;
    }

    try {
        showError('Uploading media...', 'success');

        // Create unique filename with user folder structure
        const fileExtension = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;

        // Upload file to Supabase Storage
        const { data, error } = await supabase.storage
            .from('media')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(fileName);

        // Send message with media
        const messageData = {
            content: '',
            user_id: currentUser.id,
            message_type: file.type.startsWith('image/') ? 'image' : 'video',
            media_url: publicUrl,
            media_type: file.type,
            media_size: file.size,
            media_name: file.name
        };

        messageData.recipient_id = activeChat.user_id;

        const { data: mediaMessage, error: messageError } = await supabase
            .from('messages')
            .insert([messageData])
            .select('*');

        if (messageError) throw messageError;

        // Display media message immediately
        if (mediaMessage && mediaMessage[0]) {
            const messageWithProfile = {
                ...mediaMessage[0],
                user_profiles: currentUserProfile
            };
            
            displayMessage(messageWithProfile);
            scrollToBottom();
        }

        showError('Media sent successfully!', 'success');
        
        // Force refresh to ensure sync
        setTimeout(async () => {
            await refreshMessages();
        }, 500);
    } catch (error) {
        showError('Error uploading media: ' + error.message);
    } finally {
        // Clear the file input
        event.target.value = '';
    }
}

// Friend request functions
function showAddFriend() {
    document.getElementById('add-friend-modal').classList.remove('hidden');
}

// Group functionality completely removed

async function showBlockedUsers() {
    try {
        // Ensure user is logged in
        if (!currentUser || !currentUser.id) {
            showError('Please log in first');
            return;
        }

        // Get blocked users with proper error handling
        const { data: blockedUsers, error: blockedError } = await supabase
            .from('blocked_users')
            .select('id, blocker_id, blocked_id, reason, created_at')
            .eq('blocker_id', currentUser.id);

        if (blockedError) {
            console.error('Error fetching blocked users:', blockedError);
            
            // Check if table doesn't exist or permission issue
            if (blockedError.code === '42P01' || blockedError.message.includes('does not exist')) {
                showError('Blocked users feature is not available. Please contact support.');
            } else if (blockedError.code === '42501' || blockedError.message.includes('permission denied')) {
                showError('Permission error. Please try logging out and back in.');
            } else {
                showError('Unable to load blocked users. Please try again later.');
            }
            return;
        }

        const blockedUsersList = document.getElementById('blocked-users-list');
        blockedUsersList.innerHTML = '';

        if (!blockedUsers || blockedUsers.length === 0) {
            blockedUsersList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-user-check" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;"></i>
                    <h3>No Blocked Users</h3>
                    <p>You haven't blocked anyone yet.</p>
                </div>
            `;
        } else {
            // Get blocked user profiles
            const blockedIds = blockedUsers.map(blocked => blocked.blocked_id);
            const { data: profiles, error: profileError } = await supabase
                .from('user_profiles')
                .select('full_name, username, avatar_url, user_id')
                .in('user_id', blockedIds);

            if (profileError) {
                console.error('Error fetching profiles:', profileError);
                showError('Error loading user profiles');
                return;
            }

            blockedUsers.forEach(blockedUser => {
                const user = profiles.find(profile => profile.user_id === blockedUser.blocked_id);
                if (!user) return;

                const userElement = document.createElement('div');
                userElement.className = 'blocked-user-item';

                const avatar = user.avatar_url 
                    ? `<img src="${user.avatar_url}" alt="${user.full_name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` 
                    : `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary-gradient); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">${user.full_name.charAt(0).toUpperCase()}</div>`;

                const blockedDate = new Date(blockedUser.created_at).toLocaleDateString();

                userElement.innerHTML = `
                    <div class="blocked-user-info" style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        ${avatar}
                        <div class="user-details">
                            <div class="user-name" style="color: var(--text-primary); font-weight: 600;">${user.full_name}</div>
                            <div class="user-username" style="color: var(--text-secondary); font-size: 14px;">@${user.username}</div>
                            <div class="blocked-date" style="color: var(--text-secondary); font-size: 12px;">Blocked on ${blockedDate}</div>
                            ${blockedUser.reason ? `<div class="block-reason" style="color: var(--text-secondary); font-size: 12px; font-style: italic;">"${blockedUser.reason}"</div>` : ''}
                        </div>
                    </div>
                    <button class="unblock-button" onclick="unblockUser('${blockedUser.id}')" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 2px solid rgba(34, 197, 94, 0.3); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-unlock"></i> Unblock
                    </button>
                `;

                userElement.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 12px; margin-bottom: 10px; border: 1px solid rgba(255, 255, 255, 0.1);';
                
                blockedUsersList.appendChild(userElement);
            });
        }

        document.getElementById('blocked-users-modal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading blocked users:', error);
        showError('Error loading blocked users: ' + error.message);
    }
}

async function unblockUser(blockedUserId) {
    try {
        const { error } = await supabase
            .from('blocked_users')
            .delete()
            .eq('id', blockedUserId);

        if (error) {
            console.error('Error unblocking user:', error);
            showError('Error unblocking user: ' + error.message);
            return;
        }

        showError('User unblocked successfully!', 'success');
        
        // Refresh the blocked users list
        setTimeout(async () => {
            await showBlockedUsers();
        }, 500);
    } catch (error) {
        console.error('Error unblocking user:', error);
        showError('Error unblocking user: ' + error.message);
    }
}

async function blockUser() {
    if (!activeChat || activeChatType !== 'user') {
        showError('Please select a user conversation first');
        return;
    }

    try {
        const { error } = await supabase
            .from('blocked_users')
            .insert([{
                blocker_id: currentUser.id,
                blocked_id: activeChat.user_id,
                reason: 'Blocked from conversation'
            }]);

        if (error) throw error;

        showError('User blocked successfully!', 'success');
        closeModal('user-profile-modal');

        // Reload friends to remove blocked user
        await loadFriends();
    } catch (error) {
        showError('Error blocking user: ' + error.message);
    }
}

// Settings functions
function showSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    loadUserSettings();
}

async function loadUserSettings() {
    try {
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();

        if (error) throw error;

        if (data) {
            document.getElementById('profile-visibility').value = data.profile_visibility;
            document.getElementById('notifications-enabled').checked = data.notifications_enabled;
            document.getElementById('sound-enabled').checked = data.sound_enabled;
        }

        // Load profile data
        if (currentUserProfile) {
            document.getElementById('settings-bio').value = currentUserProfile.bio || '';

            // Load profile picture
            const profileAvatar = document.getElementById('profile-avatar');
            if (profileAvatar) {
                if (currentUserProfile.avatar_url) {
                    profileAvatar.innerHTML = `<img src="${currentUserProfile.avatar_url}" alt="Profile Picture">`;
                } else {
                    profileAvatar.innerHTML = currentUserProfile.full_name.charAt(0).toUpperCase();
                }
            }
        }

        // Always refresh user profile to ensure we have the latest username
        await loadUserProfile();

        // Update username field with current profile data - this should always show the username
        const usernameField = document.getElementById('settings-username');
        if (usernameField && currentUserProfile) {
            if (currentUserProfile.username && currentUserProfile.username !== '' && currentUserProfile.username !== 'undefined') {
                usernameField.value = currentUserProfile.username;
                usernameField.style.color = '#667eea';
                usernameField.style.fontWeight = '600';
            } else {
                usernameField.value = 'Generating username...';
                usernameField.style.color = '#fbbf24';
                usernameField.style.fontWeight = '400';

                // Try to generate username if missing
                try {
                    await ensureUserHasUsername();

                    // Reload after generation
                    setTimeout(async () => {
                        await loadUserProfile();
                        if (currentUserProfile && currentUserProfile.username && currentUserProfile.username !== 'undefined') {
                            usernameField.value = currentUserProfile.username;
                            usernameField.style.color = '#667eea';
                            usernameField.style.fontWeight = '600';
                        } else {
                            usernameField.value = 'Username assignment failed';
                            usernameField.style.color = '#ef4444';
                            usernameField.style.fontWeight = '400';
                        }
                    }, 2000);
                } catch (error) {
                    console.error('Error generating username:', error);
                    usernameField.value = 'Username generation failed';
                    usernameField.style.color = '#ef4444';
                    usernameField.style.fontWeight = '400';
                }
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Profile picture functions
function selectProfilePicture() {
    document.getElementById('profile-picture-input').click();
}

async function handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Ensure we have a current user and profile
    if (!currentUser) {
        showError('Please log in first');
        return;
    }

    if (!currentUserProfile) {
        showError('Profile not loaded. Please try again.');
        await loadUserProfile();
        return;
    }

    // Validate file size (max 5MB for profile pictures)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showError('Profile picture must be less than 5MB');
        return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showError('Please upload a valid image (JPEG, PNG, GIF, WebP)');
        return;
    }

    try {
        showError('Uploading profile picture...', 'success');

        // Create unique filename for profile picture
        const fileExtension = file.name.split('.').pop();
        const fileName = `${currentUser.id}/profile_${Date.now()}.${fileExtension}`;

        // Upload file to Supabase Storage
        const { data, error } = await supabase.storage
            .from('media')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(fileName);

        // Update user profile with new avatar URL
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ avatar_url: publicUrl })
            .eq('user_id', currentUser.id);

        if (updateError) throw updateError;

        // Update current user profile safely
        if (currentUserProfile) {
            currentUserProfile.avatar_url = publicUrl;
        }

        // Update avatar in settings modal
        const profileAvatar = document.getElementById('profile-avatar');
        if (profileAvatar) {
            profileAvatar.innerHTML = `<img src="${publicUrl}" alt="Profile Picture" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }

        // Update avatar in header
        const headerAvatar = document.getElementById('user-avatar');
        if (headerAvatar) {
            headerAvatar.innerHTML = `<img src="${publicUrl}" alt="Profile Picture" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }

        showError('Profile picture updated successfully!', 'success');
    } catch (error) {
        showError('Error uploading profile picture: ' + error.message);
    } finally {
        // Clear the file input
        event.target.value = '';
    }
}

// Cancel chat function - returns to homepage
function cancelCurrentChat() {
    activeChat = null;
    activeChatType = null;

    // Clear chat messages
    document.getElementById('chat-messages').innerHTML = `
        <div class="welcome-message">
            <div style="text-align: center; padding: 50px; color: rgba(255,255,255,0.6);">
                <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 20px;"></i>
                <h3>Welcome to ZAO</h3>
                <p>Select a conversation to start chatting</p>
            </div>
        </div>
    `;

    // Update chat header to homepage state
    document.getElementById('chat-title-text').textContent = 'Select a conversation';

    // Disable message input
    document.getElementById('message-input').disabled = true;
    document.getElementById('message-input').placeholder = 'Select a conversation to start messaging...';
    document.getElementById('send-button').disabled = true;

    // Hide cancel button when no conversation is active
    const cancelButton = document.querySelector('.cancel-chat-button');
    if (cancelButton) {
        cancelButton.classList.add('hidden');
    }

    // Remove active state from all chat items
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });

    // Ensure we're on the Chats tab (homepage)
    showChats();

    // Close sidebar on mobile if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 768) {
        sidebar.classList.remove('open');
    }
}

async function saveSettings() {
    try {
        // Update user settings
        const { error: settingsError } = await supabase
            .from('user_settings')
            .update({
                profile_visibility: document.getElementById('profile-visibility').value,
                notifications_enabled: document.getElementById('notifications-enabled').checked,
                sound_enabled: document.getElementById('sound-enabled').checked
            })
            .eq('user_id', currentUser.id);

        if (settingsError) throw settingsError;

        // Update profile bio
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({
                bio: document.getElementById('settings-bio').value
            })
            .eq('user_id', currentUser.id);

        if (profileError) throw profileError;

        showError('Settings saved successfully!', 'success');
        closeModal('settings-modal');
    } catch (error) {
        showError('Error saving settings: ' + error.message);
    }
}

// Send friend request from settings
async function sendFriendRequestFromSettings() {
    const username = document.getElementById('invite-username').value.trim();

    if (!username) {
        showError('Please enter a username');
        return;
    }

    try {
        // Find user by username
        const { data: targetUser, error: userError } = await supabase
            .from('user_profiles')
            .select('user_id, username, full_name')
            .eq('username', username)
            .single();

        if (userError || !targetUser) {
            showError('User not found');
            return;
        }

        if (targetUser.user_id === currentUser.id) {
            showError('You cannot send a friend request to yourself');
            return;
        }

        // Check if friendship already exists
        const { data: existingFriendship, error: checkError } = await supabase
            .from('friendships')
            .select('*')
            .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${targetUser.user_id}),and(requester_id.eq.${targetUser.user_id},addressee_id.eq.${currentUser.id})`)
            .single();

        if (existingFriendship) {
            if (existingFriendship.status === 'accepted') {
                showError('You are already friends with this user');
            } else if (existingFriendship.status === 'pending') {
                showError('Friend request already sent');
            }
            return;
        }

        // Send friend request
        const { error: requestError } = await supabase
            .from('friendships')
            .insert([
                {
                    requester_id: currentUser.id,
                    addressee_id: targetUser.user_id,
                    status: 'pending'
                }
            ]);

        if (requestError) throw requestError;

        showError(`Friend request sent to ${targetUser.full_name}!`, 'success');
        document.getElementById('invite-username').value = '';

    } catch (error) {
        showError('Error sending friend request: ' + error.message);
    }
}

// Utility functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showError(message, type = 'error') {
    const errorElement = document.getElementById('error-message');
    errorElement.textContent = message;
    errorElement.className = `error-message ${type === 'success' ? 'success-message' : ''}`;
    errorElement.classList.remove('hidden');

    setTimeout(() => {
        errorElement.classList.add('hidden');
    }, 5000);
}

function openImageModal(imageUrl) {
    // Create and show image modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.onclick = () => modal.remove();
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 80%; max-height: 80%;">
            <img src="${imageUrl}" style="width: 100%; height: auto; border-radius: 10px;">
        </div>
    `;
    document.body.appendChild(modal);
}