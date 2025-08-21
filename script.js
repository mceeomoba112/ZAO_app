// Supabase configuration
const SUPABASE_URL = 'https://dtieffqfbepwpuogjurq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aWVmZnFmYmVwd3B1b2dqdXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2MjI5NTYsImV4cCI6MjA3MTE5ODk1Nn0.WlsC2x1TQJhc5uJjjqWtwsd0lgC0Yk3yikG-FRvnOzU';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentUserProfile = null;
let messagesSubscription = null;
let activeChat = null;
let activeChatType = 'user'; // 'user' or 'group'
let notificationPermission = 'default';
let isOnline = navigator.onLine;
let lastActivity = Date.now();

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthState();
    setupEventListeners();
    initializeMobileFeatures();
    initializeNotifications();
    setupActivityTracking();
    registerServiceWorker();
    setupNetworkStatusIndicator();
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

// Enhanced activity tracking with better online status management
function setupActivityTracking() {
    // Track user activity events
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(event => {
        document.addEventListener(event, () => {
            lastActivity = Date.now();
        }, true);
    });

    // Update activity every 15 seconds when user is active
    setInterval(async () => {
        if (currentUser && document.visibilityState === 'visible') {
            lastActivity = Date.now();
            await updateUserStatus(true);
        }
    }, 15000);

    // Check for inactive users every 30 seconds
    setInterval(async () => {
        if (currentUser) {
            const timeSinceLastActivity = Date.now() - lastActivity;
            const isInactive = timeSinceLastActivity > 180000; // 3 minutes

            if (isInactive || document.visibilityState === 'hidden') {
                await updateUserStatus(false);
            } else if (document.visibilityState === 'visible') {
                await updateUserStatus(true);
            }
        }
    }, 30000);

    // Immediate status update when page becomes visible/hidden
    document.addEventListener('visibilitychange', async () => {
        if (currentUser) {
            if (document.hidden) {
                await updateUserStatus(false);
            } else {
                lastActivity = Date.now();
                await updateUserStatus(true);
                // Trigger a full refresh when user comes back
                setTimeout(async () => {
                    await refreshOnlineStatusIndicators();
                    await updateConversationList();
                }, 1000);
            }
        }
    });

    // Update status when window gains/loses focus
    window.addEventListener('focus', async () => {
        if (currentUser) {
            lastActivity = Date.now();
            await updateUserStatus(true);
            setTimeout(async () => {
                await refreshOnlineStatusIndicators();
            }, 500);
        }
    });

    window.addEventListener('blur', async () => {
        if (currentUser) {
            await updateUserStatus(false);
        }
    });

    // Set user online when they first load the page
    if (currentUser) {
        updateUserStatus(true);
    }
}

// Update user online status with enhanced error handling
async function updateUserStatus(isOnline) {
    if (!currentUser) return;

    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .update({
                is_online: isOnline,
                last_seen: new Date().toISOString()
            })
            .eq('user_id', currentUser.id)
            .select();

        if (error) {
            console.error('Error updating user status:', error);
            return false;
        }

        // Update local profile
        if (currentUserProfile) {
            currentUserProfile.is_online = isOnline;
            currentUserProfile.last_seen = new Date().toISOString();
        }

        console.log(`User status updated: ${isOnline ? 'online' : 'offline'}`, data);
        return true;
    } catch (error) {
        console.error('Error updating user status:', error);
        return false;
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
                    sound_enabled: true
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
        const { data: settings, error: settingsError } = await supabase
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

    const fullName = document.getElementById('register-fullname').value;
    const email = document.getElementById('register-email').value;
    const phone = document.getElementById('register-phone').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    try {
        // Sign up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (error) throw error;

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
                        sound_enabled: true
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

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

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

// Handle logout
async function handleLogout() {
    try {
        if (messagesSubscription) {
            messagesSubscription.unsubscribe();
        }

        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        currentUser = null;
        currentUserProfile = null;
        activeChat = null;
        showAuthInterface();
        document.getElementById('chat-messages').innerHTML = '';
    } catch (error) {
        showError(error.message);
    }
}

// Load friends list with enhanced online status tracking and recent messages
async function loadFriends() {
    try {
        if (!currentUser) return;

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

            // Get friend profiles with real-time online status
            const { data: friendProfiles, error: profileError } = await supabase
                .from('user_profiles')
                .select('full_name, username, avatar_url, user_id, is_online, last_seen, is_verified, verification_type')
                .in('user_id', friendIds);

            if (profileError) throw profileError;

            // Get recent messages for each friend to show conversation previews
            const friendsWithMessages = await Promise.all(
                friendProfiles.map(async (friend) => {
                    try {
                        const { data: recentMessage } = await supabase
                            .from('messages')
                            .select('content, created_at, message_type')
                            .or(`and(user_id.eq.${currentUser.id},recipient_id.eq.${friend.user_id}),and(user_id.eq.${friend.user_id},recipient_id.eq.${currentUser.id})`)
                            .order('created_at', { ascending: false })
                            .limit(1);

                        return {
                            ...friend,
                            lastMessage: recentMessage && recentMessage.length > 0 ? recentMessage[0] : null
                        };
                    } catch (error) {
                        console.error('Error loading recent message for friend:', friend.user_id, error);
                        return {
                            ...friend,
                            lastMessage: null
                        };
                    }
                })
            );

            // Sort friends by online status (online first), then by last message time, then by name
            friendsWithMessages.sort((a, b) => {
                // Online users first
                if (a.is_online && !b.is_online) return -1;
                if (!a.is_online && b.is_online) return 1;

                // Then by last message time
                if (a.lastMessage && b.lastMessage) {
                    return new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at);
                }
                if (a.lastMessage && !b.lastMessage) return -1;
                if (!a.lastMessage && b.lastMessage) return 1;

                // Finally by name
                return a.full_name.localeCompare(b.full_name);
            });

            friendsWithMessages.forEach(friend => {
                const friendElement = createUserElementWithStatus(friend, 'friend');
                friendsList.appendChild(friendElement);

                const chatElement = createUserElementWithStatus(friend, 'chat');
                userList.appendChild(chatElement);
            });

            console.log(`Loaded ${friendsWithMessages.length} friends with online status`);
        } else {
            // Show empty state
            friendsList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">No friends yet. Add some friends to start chatting!</p>';
            userList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">No conversations yet. Add friends to start chatting!</p>';
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

// Create user element with enhanced online status indicators
function createUserElementWithStatus(user, type) {
    const element = document.createElement('div');
    element.className = 'user-item';
    element.setAttribute('data-user-id', user.user_id);
    element.onclick = () => {
        if (type === 'chat') {
            openChat(user);
        }
    };

    const avatarContent = user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="${user.full_name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` 
        : user.full_name.charAt(0).toUpperCase();

    const isOnline = user.is_online === true;
    const onlineStatus = isOnline ? 'online' : 'offline';
    const statusIndicator = `<div class="status-indicator ${onlineStatus}"></div>`;

    // Format last seen time
    let statusText = '';
    if (isOnline) {
        statusText = '<div class="online-text">Online</div>';
    } else {
        const lastSeen = user.last_seen ? new Date(user.last_seen) : new Date();
        const timeDiff = Date.now() - lastSeen.getTime();
        const minutesAgo = Math.floor(timeDiff / 60000);

        if (minutesAgo < 1) {
            statusText = '<div class="offline-text">Just now</div>';
        } else if (minutesAgo < 60) {
            statusText = `<div class="offline-text">${minutesAgo}m ago</div>`;
        } else {
            const hoursAgo = Math.floor(minutesAgo / 60);
            if (hoursAgo < 24) {
                statusText = `<div class="offline-text">${hoursAgo}h ago</div>`;
            } else {
                statusText = '<div class="offline-text">Offline</div>';
            }
        }
    }

    // Create verification badge if user is verified
    const verificationBadge = user.is_verified ? 
        `<span class="verification-badge ${user.verification_type || 'email'}" title="Verified ${user.verification_type || 'user'}">✓</span>` : '';

    element.innerHTML = `
        <div class="user-avatar" style="position: relative;">
            ${avatarContent}
            ${statusIndicator}
        </div>
        <div class="user-details">
            <div class="user-name">${user.full_name}${verificationBadge}</div>
            <div class="user-username">@${user.username}</div>
            ${statusText}
        </div>
    `;

    return element;
}

// Maintain backward compatibility
function createUserElement(user, type) {
    return createUserElementWithStatus(user, type);
}

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

// Update active chat UI
function updateActiveChat() {
    // Remove active class from all items
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });

    // Add active class to current chat
    // This would need more specific targeting based on the chat ID
}

// Load messages for active chat with enhanced error handling
async function loadMessages() {
    if (!activeChat || activeChatType !== 'user') return;

    try {
        console.log('Loading messages for chat with user:', activeChat.user_id);

        // First, try a simpler query without joins to test basic functionality
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(user_id.eq.${currentUser.id},recipient_id.eq.${activeChat.user_id}),and(user_id.eq.${activeChat.user_id},recipient_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) {
            console.error('Error loading messages:', error);

            // Handle specific error cases
            if (error.code === 'PGRST116') {
                // No messages found - this is normal for new conversations
                console.log('No messages found - showing welcome message');
            } else if (error.code === '42501' || error.message.includes('permission denied')) {
                showError('Permission error. Please try logging out and back in.', 'error');
                return;
            } else if (error.code === '42P01' || error.message.includes('does not exist')) {
                showError('Database not properly configured. Please contact support.', 'error');
                return;
            } else {
                console.error('Database error:', error);
                showError('Error loading messages: ' + error.message, 'error');
                return;
            }
        }

        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = '';

        if (!data || data.length === 0) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <div style="text-align: center; padding: 50px; color: rgba(255,255,255,0.6);">
                        <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 20px;"></i>
                        <h3>Start your conversation</h3>
                        <p>Send a message to ${activeChat.full_name} to begin chatting</p>
                    </div>
                </div>
            `;
            console.log('No messages to display - showing welcome message');
        } else {
            console.log(`Displaying ${data.length} messages`);

            // Get user profiles for message senders
            const userIds = [...new Set(data.map(msg => msg.user_id))];
            const { data: profiles, error: profileError } = await supabase
                .from('user_profiles')
                .select('full_name, username')
                .in('user_id', userIds);

            if (profileError) {
                console.error('Error loading user profiles:', profileError);
            }

            // Add profile data to messages
            const messagesWithProfiles = data.map(message => ({
                ...message,
                user_profiles: profiles?.find(p => p.user_id === message.user_id) || {
                    full_name: message.user_id === currentUser.id ? currentUserProfile?.full_name || 'You' : 'User',
                    username: message.user_id === currentUser.id ? currentUserProfile?.username || 'user' : 'user'
                }
            }));

            messagesWithProfiles.forEach(message => {
                displayMessage(message);
            });
        }

        scrollToBottom();

        // Mark messages as read
        await markMessagesAsRead();

        console.log('Messages loaded successfully');
    } catch (error) {
        console.error('Error loading messages:', error);
        showError('Error loading messages: ' + error.message, 'error');

        // Show fallback welcome message
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div style="text-align: center; padding: 50px; color: rgba(255,255,255,0.6);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 20px; color: #ef4444;"></i>
                    <h3>Unable to load messages</h3>
                    <p>There was an error loading the conversation. Please try refreshing the page.</p>
                </div>
            </div>
        `;
    }
}

// Subscribe to real-time messages and user status with enhanced synchronization
function subscribeToMessages() {
    if (messagesSubscription) {
        messagesSubscription.unsubscribe();
    }

    messagesSubscription = supabase
        .channel('realtime-updates-' + currentUser.id)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            },
            async (payload) => {
                try {
                    console.log('New message received via real-time:', payload.new);

                    // Check if this message is relevant to the current user
                    const isRelevantMessage = 
                        (payload.new.user_id === currentUser.id) || 
                        (payload.new.recipient_id === currentUser.id);

                    if (!isRelevantMessage) {
                        console.log('Message not relevant to current user');
                        return;
                    }

                    // Get user profile for the message sender
                    let senderProfile = null;
                    if (payload.new.user_id === currentUser.id) {
                        senderProfile = {
                            full_name: currentUserProfile?.full_name || 'You',
                            username: currentUserProfile?.username || 'user'
                        };
                    } else {
                        try {
                            const { data: userProfile, error: profileError } = await supabase
                                .from('user_profiles')
                                .select('full_name, username')
                                .eq('user_id', payload.new.user_id)
                                .single();

                            if (profileError) {
                                console.error('Error fetching user profile:', profileError);
                                senderProfile = { full_name: 'Unknown User', username: 'unknown' };
                            } else {
                                senderProfile = userProfile;
                            }
                        } catch (error) {
                            console.error('Error loading sender profile:', error);
                            senderProfile = { full_name: 'Unknown User', username: 'unknown' };
                        }
                    }

                    const messageWithProfile = {
                        ...payload.new,
                        user_profiles: senderProfile
                    };

                    // Show notification if message is from another user and they're not currently active
                    if (payload.new.user_id !== currentUser.id) {
                        const senderName = senderProfile.full_name;
                        let notificationBody = '';

                        if (payload.new.message_type === 'text') {
                            notificationBody = payload.new.content;
                        } else if (payload.new.message_type === 'image') {
                            notificationBody = `${senderName} sent you an image`;
                        } else if (payload.new.message_type === 'video') {
                            notificationBody = `${senderName} sent you a video`;
                        }

                        // Show notification if app is not in focus or different chat is open
                        if (document.hidden || !activeChat || activeChat.user_id !== payload.new.user_id) {
                            showLocalNotification(
                                `New message from ${senderName}`,
                                notificationBody,
                                {
                                    type: 'message',
                                    sender_id: payload.new.user_id,
                                    message_id: payload.new.id
                                }
                            );
                        }
                    }

                    // Display message if it belongs to the active chat and isn't already displayed
                    if (activeChat && shouldDisplayMessage(messageWithProfile)) {
                        const existingMessage = document.querySelector(`[data-message-id="${payload.new.id}"]`);
                        if (!existingMessage) {
                            displayMessage(messageWithProfile);
                            scrollToBottom();
                        }
                    }

                    // Always update conversation list to show new message indicator
                    setTimeout(() => {
                        updateConversationList();
                    }, 1000);

                } catch (error) {
                    console.error('Error processing new message:', error);
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_profiles'
            },
            (payload) => {
                // Update online status when user profiles change in real-time
                console.log('User profile updated:', payload.new);
                updateOnlineStatusInRealTime(payload.new);
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to real-time updates');
            } else if (status === 'CHANNEL_ERROR') {
                console.error('Real-time subscription error, attempting to reconnect...');
                // Retry subscription after 5 seconds
                setTimeout(() => {
                    subscribeToMessages();
                }, 5000);
            } else if (status === 'CLOSED') {
                console.log('Real-time subscription closed, attempting to reconnect...');
                setTimeout(() => {
                    subscribeToMessages();
                }, 3000);
            }
        });

    // Set up auto-refresh every 3 seconds for comprehensive sync
    setupAutoRefresh();
}

// Enhanced auto-refresh functionality for comprehensive synchronization
function setupAutoRefresh() {
    // Clear any existing intervals
    if (window.autoRefreshInterval) {
        clearInterval(window.autoRefreshInterval);
    }
    if (window.statusUpdateInterval) {
        clearInterval(window.statusUpdateInterval);
    }
    if (window.onlineStatusInterval) {
        clearInterval(window.onlineStatusInterval);
    }

    // Main auto-refresh every 3 seconds for messages and conversations
    window.autoRefreshInterval = setInterval(async () => {
        if (currentUser && document.visibilityState === 'visible') {
            try {
                // Update user's last activity and online status
                await updateUserStatus(true);
                lastActivity = Date.now();

                // Refresh conversations list to show new messages and online status
                await updateConversationList();

                // If we have an active chat, sync messages
                if (activeChat) {
                    await syncActiveChat();
                }

                // Update online status indicators for all visible users
                await refreshOnlineStatusIndicators();

                console.log('Auto-refresh completed at:', new Date().toLocaleTimeString());
            } catch (error) {
                console.error('Error during auto-refresh:', error);
            }
        }
    }, 3000); // Every 3 seconds

    // Separate interval for user status updates every 10 seconds
    window.statusUpdateInterval = setInterval(async () => {
        if (currentUser && document.visibilityState === 'visible') {
            try {
                await updateUserStatus(true);
                lastActivity = Date.now();
            } catch (error) {
                console.error('Error updating user status:', error);
            }
        }
    }, 10000); // Every 10 seconds

    // Online status check every 5 seconds
    window.onlineStatusInterval = setInterval(async () => {
        if (currentUser) {
            try {
                await refreshOnlineStatusIndicators();
            } catch (error) {
                console.error('Error refreshing online status:', error);
            }
        }
    }, 5000); // Every 5 seconds
}

// Sync active chat messages
async function syncActiveChat() {
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

        // Get current messages in the UI
        const currentMessages = document.querySelectorAll('.message');
        const currentMessageIds = Array.from(currentMessages).map(msg => msg.dataset.messageId).filter(id => id);

        // Find new messages not yet displayed
        const newMessages = data.filter(message => !currentMessageIds.includes(message.id));

        // Display new messages
        newMessages.forEach(message => {
            displayMessage(message);
        });

        if (newMessages.length > 0) {
            scrollToBottom();
        }
    } catch (error) {
        console.error('Error syncing chat:', error);
    }
}

// Update conversation list to show new message indicators
async function updateConversationList() {
    if (!currentUser) return;

    try {
        await loadFriends(); // This will refresh the conversation list
    } catch (error) {
        console.error('Error updating conversation list:', error);
    }
}

// Check if message should be displayed in current chat
function shouldDisplayMessage(message) {
    if (!activeChat || activeChatType !== 'user') return false;

    // Message should be displayed if:
    // 1. Current user sent it to the active chat user, OR
    // 2. Active chat user sent it to the current user
    const isFromCurrentUserToActiveChat = (message.user_id === currentUser.id && message.recipient_id === activeChat.user_id);
    const isFromActiveChatToCurrentUser = (message.user_id === activeChat.user_id && message.recipient_id === currentUser.id);

    console.log('Checking message display:', {
        messageUserId: message.user_id,
        messageRecipientId: message.recipient_id,
        currentUserId: currentUser.id,
        activeChatUserId: activeChat.user_id,
        shouldDisplay: isFromCurrentUserToActiveChat || isFromActiveChatToCurrentUser
    });

    return isFromCurrentUserToActiveChat || isFromActiveChatToCurrentUser;
}

// Display a message with enhanced synchronization
function displayMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');

    // Check if message already exists to prevent duplicates
    const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
    if (existingMessage) {
        return; // Message already displayed
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.user_id === currentUser.id ? 'own' : 'other'}`;
    messageElement.setAttribute('data-message-id', message.id);

    const messageTime = new Date(message.created_at).toLocaleTimeString();

    let contentHtml = '';

    if (message.message_type === 'text') {
        contentHtml = `<div class="message-content">${message.content}</div>`;
    } else if (message.message_type === 'image') {
        contentHtml = `
            <div class="message-content">${message.content || ''}</div>
            <img src="${message.media_url}" class="message-media" alt="Image" onclick="openImageModal('${message.media_url}')">
        `;
    } else if (message.message_type === 'video') {
        contentHtml = `
            <div class="message-content">${message.content || ''}</div>
            <video src="${message.media_url}" class="message-media" controls></video>
        `;
    }

    messageElement.innerHTML = `
        ${contentHtml}
        <div class="message-time">${messageTime}</div>
    `;

    messagesContainer.appendChild(messageElement);
}

// Update online status indicators in real-time
function updateOnlineStatusInRealTime(userProfile) {
    console.log('Updating online status for user:', userProfile.user_id, 'Status:', userProfile.is_online);

    const userItems = document.querySelectorAll(`[data-user-id="${userProfile.user_id}"]`);

    userItems.forEach(item => {
        const avatar = item.querySelector('.user-avatar');
        if (avatar) {
            // Remove existing status indicators
            const existingIndicator = avatar.querySelector('.status-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }

            // Add new status indicator
            const statusIndicator = document.createElement('div');
            statusIndicator.className = `status-indicator ${userProfile.is_online ? 'online' : 'offline'}`;
            avatar.style.position = 'relative';
            avatar.appendChild(statusIndicator);
        }

        // Update online/offline text
        const onlineText = item.querySelector('.online-text');
        const offlineText = item.querySelector('.offline-text');

        if (onlineText) onlineText.remove();
        if (offlineText) offlineText.remove();

        const userDetails = item.querySelector('.user-details');
        if (userDetails) {
            const statusText = document.createElement('div');
            statusText.className = userProfile.is_online ? 'online-text' : 'offline-text';
            statusText.textContent = userProfile.is_online ? 'Online' : 'Offline';
            userDetails.appendChild(statusText);
        }
    });
}

// Refresh online status indicators for all visible users
async function refreshOnlineStatusIndicators() {
    if (!currentUser) return;

    try {
        // Get all visible user elements
        const userElements = document.querySelectorAll('[data-user-id]');
        const userIds = Array.from(userElements).map(el => el.dataset.userId);

        if (userIds.length === 0) return;

        // Fetch current online status for all visible users
        const { data: userProfiles, error } = await supabase
            .from('user_profiles')
            .select('user_id, is_online, last_seen')
            .in('user_id', userIds);

        if (error) {
            console.error('Error fetching user statuses:', error);
            return;
        }

        // Update each user's status indicator
        userProfiles.forEach(profile => {
            updateOnlineStatusInRealTime(profile);
        });

    } catch (error) {
        console.error('Error refreshing online status indicators:', error);
    }
}

// Enhanced load messages with better error handling
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

        // Mark messages as read
        await markMessagesAsRead();
    } catch (error) {
        console.error('Error loading messages:', error);
        showError('Error loading messages. Please refresh and try again.', 'error');
    }
}

// Mark messages as read (for future read status feature)
async function markMessagesAsRead() {
    if (!activeChat) return;

    try {
        // This would be implemented when adding read receipts
        console.log('Messages marked as read for chat:', activeChat.user_id);
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

// Send message with enhanced error handling and validation
async function sendMessage() {
    if (!activeChat || activeChatType !== 'user') {
        showError('Please select a conversation first', 'error');
        return;
    }

    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();

    if (!content) {
        showError('Please enter a message', 'error');
        return;
    }

    if (!currentUser || !currentUser.id) {
        showError('Please log in first', 'error');
        return;
    }

    try {
        const messageData = {
            content: content,
            user_id: currentUser.id,
            recipient_id: activeChat.user_id,
            message_type: 'text'
        };

        console.log('Sending message:', messageData);

        const { data, error } = await supabase
            .from('messages')
            .insert([messageData])
            .select('*');

        if (error) {
            console.error('Error sending message:', error);
            throw error;
        }

        console.log('Message sent successfully:', data);

        // Clear the input
        messageInput.value = '';

        // Display the message immediately for better UX
        if (data && data[0]) {
            const messageWithProfile = {
                ...data[0],
                user_profiles: {
                    full_name: currentUserProfile?.full_name || 'You',
                    username: currentUserProfile?.username || 'user'
                }
            };

            // Only display if it's not already shown
            const existingMessage = document.querySelector(`[data-message-id="${data[0].id}"]`);
            if (!existingMessage) {
                displayMessage(messageWithProfile);
                scrollToBottom();
            }
        }

        // Update conversation list to show new message
        setTimeout(() => {
            updateConversationList();
        }, 500);

    } catch (error) {
        console.error('Error sending message:', error);

        if (error.code === '42501' || error.message.includes('permission denied')) {
            showError('Permission error. Please try logging out and back in.', 'error');
        } else if (error.code === '23503' || error.message.includes('foreign key')) {
            showError('Invalid recipient. Please refresh and try again.', 'error');
        } else if (error.code === '42P01' || error.message.includes('does not exist')) {
            showError('Database not properly configured. Please contact support.', 'error');
        } else {
            showError('Error sending message: ' + error.message, 'error');
        }
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

        const { error: messageError } = await supabase
            .from('messages')
            .insert([messageData]);

        if (messageError) throw messageError;

        showError('Media sent successfully!', 'success');
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
        // Load user settings from user_settings table
        const { data: settings, error: settingsError } = await supabase
            .from('user_settings')
            .select('theme, notifications_enabled, sound_enabled')
            .eq('user_id', currentUser.id)
            .single();

        // Load profile visibility from user_profiles table
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('profile_visibility')
            .eq('user_id', currentUser.id)
            .single();

        if (settingsError) {
            console.error('Error loading settings:', settingsError);
            // Create default settings if none exist
            const { error: insertError } = await supabase
                .from('user_settings')
                .insert([{
                    user_id: currentUser.id,
                    theme: 'dark',
                    notifications_enabled: true,
                    sound_enabled: true
                }]);

            if (insertError) {
                console.error('Error creating default settings:', insertError);
                showError('Error loading settings');
                return;
            }

            // Set default values in UI
            document.getElementById('notifications-enabled').checked = true;
            document.getElementById('sound-enabled').checked = true;
        } else {
            // Load settings into UI
            document.getElementById('notifications-enabled').checked = settings.notifications_enabled;
            document.getElementById('sound-enabled').checked = settings.sound_enabled;
        }

        // Handle profile visibility separately
        if (profileError) {
            console.error('Error loading profile visibility:', profileError);
            document.getElementById('profile-visibility').value = 'public';
        } else {
            document.getElementById('profile-visibility').value = profile.profile_visibility || 'public';
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
    const notificationsEnabled = document.getElementById('notifications-enabled').checked;
    const soundEnabled = document.getElementById('sound-enabled').checked;
    const profileVisibility = document.getElementById('profile-visibility').value;
    const bio = document.getElementById('settings-bio').value;

    try {
        // Update user settings
        const { error: settingsError } = await supabase
            .from('user_settings')
            .upsert({
                user_id: currentUser.id,
                theme: 'dark',
                notifications_enabled: notificationsEnabled,
                sound_enabled: soundEnabled,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (settingsError) throw settingsError;

        // Update profile settings in user_profiles table
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({
                profile_visibility: profileVisibility,
                bio: bio,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id);

        if (profileError) throw profileError;

        // Update current profile data
        if (currentUserProfile) {
            currentUserProfile.profile_visibility = profileVisibility;
            currentUserProfile.bio = bio;
        }

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

    // Handle different message types
    let className = 'error-message';
    if (type === 'success') {
        className += ' success-message';
    } else if (type === 'info') {
        className += ' info-message';
    }

    errorElement.className = className;
    errorElement.classList.remove('hidden');

    // Auto-hide after 5 seconds for errors, 3 seconds for success/info
    const hideDelay = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
        errorElement.classList.add('hidden');
    }, hideDelay);
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

// New function to request verification
async function requestVerification() {
    try {
        if (!currentUser || !currentUser.id) {
            showError('Please log in to request verification.');
            return;
        }

        // Check if already requested or verified
        const { data: verificationData, error: verificationError } = await supabase
            .from('verification_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();

        if (verificationError && verificationError.code !== 'PGRST116') {
            console.error('Error checking verification status:', verificationError);
            showError('Could not check verification status. Please try again later.');
            return;
        }

        if (verificationData) {
            if (verificationData.status === 'pending') {
                showError('Your verification request is already pending approval.');
            } else if (verificationData.status === 'approved') {
                showError('Your account is already verified!');
            } else { // rejected
                showError('Your previous verification request was rejected. Please review the requirements or contact support.');
            }
            return;
        }

        // Insert new verification request
        const { error } = await supabase
            .from('verification_requests')
            .insert([
                {
                    user_id: currentUser.id,
                    status: 'pending',
                    requested_at: new Date().toISOString()
                }
            ]);

        if (error) {
            console.error('Error submitting verification request:', error);
            showError('Failed to submit verification request. Please try again.');
            return;
        }

        showError('Verification request submitted! We will review it shortly.', 'success');

    } catch (error) {
        console.error('Error requesting verification:', error);
        showError('An unexpected error occurred. Please try again.');
    }
}