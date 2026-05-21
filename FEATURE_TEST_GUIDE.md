# ✅ 15 FEATURES - COMPLETE TESTING & VERIFICATION GUIDE

## 📝 HOW TO VERIFY EACH FEATURE IS WORKING

This document provides step-by-step verification tests for all 15 implemented features. Each test takes 2-5 minutes.

---

## **FEATURE 1: SESSION PERSISTENCE & TOKEN MANAGEMENT** ✅

### What It Does:
Users stay logged in after closing the browser. Tokens automatically refresh when expired.

### Database Role:
- Stores user credentials and status in `users` table
- Tracks login activity via timestamps

### Verification Test:
```bash
STEP 1: Login
  • Open http://localhost:9002
  • Enter: admin@mawbytec.com / admin123
  • Click Login → Redirects to dashboard
  
STEP 2: Verify Token in Storage
  • Open DevTools → Application tab
  • Click Storage → Cookies or LocalStorage
  • Find: "teams_token" key
  • Should see: jwt-like string (header.payload.signature)
  
STEP 3: Reload Browser (F5)
  • Browser should NOT ask to login again
  • You should see dashboard immediately
  • User profile should load instantly
  
STEP 4: Test Token Refresh
  • Open DevTools → Network tab
  • Make any API request
  • Look for: GET /api/auth/me or similar
  • Token is automatically refreshed in background
  
STEP 5: Logout
  • Click Profile → Logout
  • Token is deleted from storage
  • Trying to access dashboard → redirects to login
  
✅ PASS CRITERIA:
  - Token persists in localStorage
  - No login required after refresh
  - Can logout and lose access
  - Token automatically refreshes on 403
```

---

## **FEATURE 2: REAL-TIME NOTIFICATIONS SYSTEM** ✅

### What It Does:
Admins send notifications. Users receive them in real-time with unread count. Mark as read functionality.

### Database Tables:
- `notifications` - Stores notification content
- `notification_reads` - Tracks who read what

### Verification Test:
```bash
STEP 1: Setup Two Users
  • User A (Admin): admin@mawbytec.com / admin123
  • Create User B in the app or use another admin account
  
STEP 2: Open Two Browser Windows
  • Window 1: Login as User A (admin)
  • Window 2: Login as User B (regular user)
  • Arrange windows side-by-side
  
STEP 3: Send Notification from Admin
  • In Window 1 (Admin):
  • Go to Settings/Admin Panel
  • Create New Notification
  • Title: "Welcome to Teams!"
  • Body: "This is a test notification"
  • Recipient: User B
  • Click Send
  
STEP 4: Verify Real-Time Delivery
  • Look at Window 2 immediately
  • Notification badge appears (no refresh)
  • Bell icon shows red dot with number
  • Unread count shows "1"
  
STEP 5: Open Notification
  • Click Notification icon
  • Modal opens showing message
  • Notification is highlighted
  
STEP 6: Mark as Read
  • Click on notification
  • Message: "This is a test notification"
  • Click "Mark as Read"
  • Unread count drops to "0"
  • In Window 1: Should also show read (if viewing same panel)
  
✅ PASS CRITERIA:
  - Notification appears within 1 second
  - No page reload needed
  - Unread count updates instantly
  - Read status syncs across sessions
```

### Database Verification:
```sql
-- Check notification created
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 1;

-- Check read status
SELECT * FROM notification_reads WHERE user_id = 2;
```

---

## **FEATURE 3: READ RECEIPTS & MESSAGE STATUS** ✅

### What It Does:
When users read messages, sender sees "✓✓" indicating message was read by recipients. Tracks who read what.

### Database Tables:
- `message_reads` - Tracks each user's read status per message
- `conversation_last_seen` - Last position user viewed

### Verification Test:
```bash
STEP 1: Setup Group Chat
  • Create a group with 3+ members (or use existing)
  • All users should be active/online
  
STEP 2: User A Sends Messages
  • Login as User A
  • Go to group chat
  • Send 3 messages (one at a time, wait 1 sec between)
  • Message 1: "Can you see this?"
  • Message 2: "How about this?"
  • Message 3: "And this one?"
  
STEP 3: User B Views Messages
  • Login as User B (new window or tab)
  • Go to same group chat
  • View all 3 messages
  • Don't send any response
  
STEP 4: Check Read Receipts in User A View
  • Switch back to User A window
  • Look at the 3 messages
  • Should see "✓" (single check) when sent
  • Should see "✓✓" (double check) after User B reads
  • Timing: Should update within 2-3 seconds
  
STEP 5: User C Views
  • Login as User C (third window)
  • Go to same group chat
  • View the messages
  • In User A view: Double checks should show more users
  
STEP 6: Mark Conversation as Read
  • User A can mark entire conversation as read
  • All unread messages marked as read
  • Last position saved in DB
  
✅ PASS CRITERIA:
  - Single ✓ appears when message sent
  - Double ✓✓ appears within 2 sec of being read
  - Multiple readers tracked correctly
  - Read status persists after refresh
  - Last seen position saved per user
```

### Database Verification:
```sql
-- Check read receipts
SELECT mr.message_id, u.name, mr.read_at 
FROM message_reads mr
JOIN users u ON mr.user_id = u.id
ORDER BY mr.read_at DESC LIMIT 10;

-- Check last seen per conversation
SELECT u.name, cls.conversation_id, cls.last_seen_at
FROM conversation_last_seen cls
JOIN users u ON cls.user_id = u.id;
```

---

## **FEATURE 4: MESSAGE REACTIONS (COMPLETE)** ✅

### What It Does:
Users add emoji reactions to messages (👍 ❤️ 😂 etc.). Multiple users can react. Reactions broadcast in real-time.

### Database Table:
- `message_reactions` - Stores reaction emoji + user + message

### Supported Emojis:
👍 ❤️ 😂 😮 😢 😡 🎉 🚀 ✨ 👏 🔥 💯 🙏 😍 🤔 💪 👌 😎

### Verification Test:
```bash
STEP 1: Setup Chat Scene
  • Open group chat with 2+ members
  • Have one user (User A) send a message: "React to this!"
  
STEP 2: User B Adds Reaction
  • Login as User B
  • Hover over the message from User A
  • Emoji picker icon appears (😊 icon)
  • Click emoji picker
  • Grid of 18 emojis appears
  • Click 👍 (thumbs up)
  
STEP 3: Verify Reaction Shows
  • In User B view: 👍 appears below message with count "1"
  • Immediately (no refresh): In User A view: 👍 appears with "1"
  
STEP 4: User C Adds Same Reaction
  • Login as User C
  • Hover over same message
  • Click emoji picker
  • Click 👍
  • In all views: Count changes from "1" to "2"
  • Shows: 👍 with count "2"
  
STEP 5: User C Adds Different Reaction
  • User C: Emoji picker again
  • Click ❤️ (heart)
  • Now shows both: 👍 (2) ❤️ (1)
  • All three users see same state instantly
  
STEP 6: User B Removes Reaction
  • User B: Hover over message
  • Click 👍 emoji (that they added)
  • Reaction removed
  • Count: 👍 changes from "2" to "1"
  
STEP 7: View All Reactions
  • Click on emoji group (e.g., "👍 1")
  • Dialog shows: "User B reacted with 👍"
  • Shows who added each reaction
  
✅ PASS CRITERIA:
  - Emoji picker appears on hover
  - Reaction adds in < 500ms
  - Count updates in real-time for all users
  - Removing reaction works (click same emoji twice)
  - Multiple reactions per message work
  - Reactions persist after refresh (stored in DB)
  - Notification sent to message author (optional)
```

### Database Verification:
```sql
-- See all reactions on a message
SELECT emoji, COUNT(*) as count
FROM message_reactions
WHERE message_id = 123
GROUP BY emoji;

-- See who reacted what
SELECT u.name, emoji FROM message_reactions mr
JOIN users u ON mr.user_id = u.id
WHERE mr.message_id = 123;
```

---

## **FEATURE 5: LAST SEEN TRACKING & UNREAD COUNTS** ✅

### What It Does:
Shows how many unread messages in each conversation. Updates automatically when you view chat.

### Database Table:
- `conversation_last_seen` - Tracks each user's last position in each conversation

### Verification Test:
```bash
STEP 1: Setup Test
  • User A (Admin) online
  • User B offline or in different app
  • Group chat: "General"
  
STEP 2: User A Sends Messages While B is Away
  • User A: Go to chat
  • Send 5 messages to General:
    1. "Message 1"
    2. "Message 2"
    3. "Message 3"
    4. "Message 4"
    5. "Message 5"
  • User B still offline/away
  
STEP 3: User B Comes Online
  • User B: Login
  • Look at conversation list
  • "General" group shows badge: "5"
  • Indicates 5 unread messages
  • Current test message: Unread count should be accurate
  
STEP 4: User B Opens Chat
  • Click "General"
  • All 5 messages visible
  • Badge automatically updates to "0"
  • Check conversation list: No "5" badge anymore
  
STEP 5: User A Sends More While B is Viewing
  • User B: Keep chat open, watching
  • User A: Send 2 more messages
  • User B view: New messages appear instantly
  • Badge never shows (because B is viewing)
  
STEP 6: Check Last Seen Tracking
  • User B: Scroll to top of chat
  • Close chat
  • Return to conversation list
  • Go back to General
  • Should scroll to last position viewed (or show new messages)
  
STEP 7: API Test - Get Unread Counts
  • Open DevTools Console
  • Execute: fetch('/api/messages/unread/counts')
  • Response shows:
    ```json
    {
      "1": { "unreadCount": 5, "lastMessageId": 123 },
      "dm_1_2": { "unreadCount": 0, "lastMessageId": 456 }
    }
    ```
  
✅ PASS CRITERIA:
  - Unread badge appears immediately
  - Count is accurate per conversation
  - Badge disappears when conversation opened
  - Last position saved per user
  - Survives page refresh
  - API returns correct counts
```

### Database Verification:
```sql
-- Check last seen per user and conversation
SELECT u.name, cls.conversation_id, cls.last_message_id, cls.last_seen_at
FROM conversation_last_seen cls
JOIN users u ON cls.user_id = u.id;

-- Count unread for a specific user
SELECT conversation_id, COUNT(*) as unread_count
FROM messages m
LEFT JOIN conversation_last_seen cls ON m.conversation_id = cls.conversation_id 
  AND cls.user_id = 2
WHERE m.created_at > COALESCE(cls.last_seen_at, NOW() - INTERVAL 30 DAY)
GROUP BY conversation_id;
```

---

## **FEATURE 6: PRESENCE INDICATORS & TYPING** ✅

### What It Does:
Shows who's online, away, or offline. Real-time typing indicators. Auto-away after 5 minutes of inactivity.

### Database Column:
- `users.status` - online | away | offline | dnd

### Verification Test:
```bash
STEP 1: Check User List
  • Open Users/Directory view
  • See list of all users
  • Next to each: Status indicator
    🟢 Online (green)
    🟡 Away (yellow)
    ⚫ Offline (gray)
    🔴 Do Not Disturb (red)
  
STEP 2: Set Status Manually
  • Click on your avatar/profile
  • Status dropdown
  • Select: Online → Away → DND → Online
  • Status should change in all tabs/windows immediately
  • Other users see your new status
  
STEP 3: Test Auto-Away Timer
  • Set status to Online
  • Don't touch mouse/keyboard for 5 minutes
  • After 5 min: Your status auto-changes to Away
  • Move mouse: Status back to Online immediately
  • Other users see this instantly
  
STEP 4: Typing Indicators
  • Have User A in chat
  • User B starts typing a message but doesn't send
  • In User A view: "User B is typing..." appears below chat
  • Typing indicator shows for ~3 seconds while typing
  • When User B finishes typing/stops: Indicator disappears
  • If User B sends: Indicator gone, message appears
  
STEP 5: Multiple Typing Indicators
  • User B typing: "User B is typing..."
  • User C typing: "User B is typing... User C is typing..."
  • Shows "X" as comma-separated list
  
STEP 6: Get Online Users API
  • Execute in console:
    ```
    socket.emit('get_online_users', (response) => {
      console.log(response.users)
    })
    ```
  • Returns: List of online users with status
  • Updates every 10-15 seconds
  
STEP 7: Status in Profile
  • Click another user's profile
  • Their status shown with indicator
  • If away: "Last seen: 5 minutes ago"
  • If offline: "Last seen: 2 hours ago"
  
✅ PASS CRITERIA:
  - Status changes reflected instantly
  - Auto-away triggers after 5 minutes idle
  - Movement/typing resets auto-away timer
  - Typing indicators appear/disappear correctly
  - Multiple typers shown together
  - Status indicator accurate across all views
  - Works across browser tabs
```

### Socket Verification:
```javascript
// In browser console
socket.on('user_status_change', (data) => {
  console.log('Status changed:', data);
  // Should see: { userId: "5", status: "away" }
});
```

---

## **FEATURE 7: USER SEARCH FUNCTIONALITY** ✅

### What It Does:
Search for users by name, email, or department. Results ranked by relevance.

### Database Table:
- `users` - Indexed on email and name

### Verification Test:
```bash
STEP 1: Open Search
  • Click search icon (magnifying glass)
  • Search field appears at top
  
STEP 2: Search by Name
  • Type: "john"
  • Results appear instantly (no submit button)
  • Should show users with "John" in name
  • "John Smith" (exact match) ranks first
  • "Johnny Davis" (partial match) ranks second
  
STEP 3: Search by Email
  • Type: "john@"
  • Results show users with john in email
  • Shows: john@example.com, johnathan@...
  
STEP 4: Search by Department
  • Type: "sales"
  • Results show users in Sales department
  
STEP 5: View User Results
  • Each result shows:
    ✓ Avatar (profile picture)
    ✓ Name
    ✓ Email
    ✓ Status (online/away/offline)
    ✓ Department
  
STEP 6: Click Result
  • Click on user → Opens profile/DM chat
  • Can message them directly
  
STEP 7: Debouncing Test
  • Type quickly: "jjjjoooohhhnnn"
  • API called only once (not on each keystroke)
  • Debounce delay: 300ms
  
STEP 8: Exact Match Ranking
  • Have users: "John", "Johnson", "Jonathan"
  • Search: "john"
  • Order of results:
    1. "John" (exact match)
    2. "Johnson" (prefix match)
    3. "Jonathan" (contains match)
  
✅ PASS CRITERIA:
  - Results appear < 500ms
  - Ranked by relevance correctly
  - Debounced (not on every keystroke)
  - Shows user avatar, name, email, status
  - Can click to open conversation
  - Limit: 50 results max
```

### API Test:
```bash
curl "http://localhost:3001/api/users/search/john" \
  -H "Authorization: Bearer TOKEN"

# Response:
{
  "results": [
    {
      "id": "5",
      "name": "John Smith",
      "email": "john@company.com",
      "avatar": "...",
      "status": "online",
      "department": "Sales"
    }
  ]
}
```

---

## **FEATURE 8: CONVERSATION SEARCH** ✅

### What It Does:
Search message content across all conversations. Find past messages quickly.

### Database Table:
- `messages` - Full-text searchable content

### Verification Test:
```bash
STEP 1: Open Message Search
  • Click search icon
  • Select "Search Messages" tab (if separate)
  
STEP 2: Search by Keyword
  • Type: "deadline"
  • Results show all messages containing "deadline"
  • Shows:
    ✓ Message content (with keyword highlighted)
    ✓ Sender name
    ✓ Timestamp
    ✓ Which group/conversation
  
STEP 3: Search in Specific Conversation
  • Inside a chat group
  • Search for: "project"
  • Results limited to this conversation only
  • Show relevant messages
  
STEP 4: Click Result
  • Click search result
  • Scrolls to that message in chat
  • Message highlighted briefly
  • Full context visible
  
STEP 5: Pagination
  • Search: "the" (very common word)
  • Results: 20 on first page
  • "Load more" button at bottom
  • Next page: Shows 20-40, etc.
  
STEP 6: Timestamp Search
  • Each result shows:
    - Date: "May 14, 2026"
    - Time: "3:45 PM"
    - Sender: "John Smith"
    - Group: "General"
  
STEP 7: Performance Test
  • Search for common term
  • Results appear < 1 second (even with many messages)
  • Uses database indexes
  
✅ PASS CRITERIA:
  - Results appear < 1 second
  - Keyword highlighted in results
  - Shows sender and timestamp
  - Can click to navigate to message
  - Pagination works for large results
  - Scoped to conversation if needed
  - Limit: 100 results per search
```

### API Test:
```bash
curl "http://localhost:3001/api/messages/search/deadline" \
  -H "Authorization: Bearer TOKEN"

# Response:
{
  "results": [
    {
      "id": "123",
      "content": "The deadline is tomorrow!",
      "sender": { "id": "5", "name": "John" },
      "conversationId": "1",
      "timestamp": "2026-05-14T15:45:00Z"
    }
  ]
}
```

---

## **FEATURE 9: MESSAGE PINNING SYSTEM** ✅

### What It Does:
Pin one important message per conversation. Appears in header. Easy to reference.

### Database Column:
- `messages.is_pinned` - TINYINT(1)

### Verification Test:
```bash
STEP 1: Find Important Message
  • Open group chat
  • Find message worth pinning (e.g., announcement)
  • Right-click on message
  
STEP 2: Pin Message
  • Context menu appears
  • Click "Pin to chat"
  • Message is pinned
  • Pin icon appears on message (📌)
  
STEP 3: Verify Pinned Message
  • Look at chat header/top area
  • "Pinned message" section appears
  • Shows: Sender + Message preview + "View" button
  • Example: "John: The deadline is Friday at 5 PM"
  
STEP 4: Other Users See Pinned
  • In another user's view of same chat
  • Pinned message section visible
  • Same message shown
  • Updated in real-time (no refresh)
  
STEP 5: Only One Pin Per Chat
  • Another important message appears
  • Try to pin it
  • System: "Only 1 message can be pinned"
  • Or: Previous pin is replaced (check design)
  
STEP 6: Click on Pinned Message
  • Click message in pinned section
  • Scrolls to that message in chat
  • Highlights it briefly (yellow background)
  • Full context visible
  
STEP 7: Unpin Message
  • Go back to original message
  • Right-click
  • Click "Unpin from chat"
  • Pinned section disappears
  • Pin icon removed from message
  
STEP 8: View Pinned Message History
  • Header shows: "1 Pinned"
  • Click to show: History of pinned messages
  • Shows: Previous messages that were pinned
  • Timestamps of when pinned/unpinned
  
STEP 9: API Test
  • GET /api/messages/group_1/pinned
  • Returns: Current pinned message or empty
  
✅ PASS CRITERIA:
  - Pin/unpin works instantly
  - Visible in header/fixed area
  - Updated in real-time for all users
  - Only 1 per conversation
  - Can click to navigate to message
  - Persists after refresh
  - Survives if message edited
  - Can unpin to clear
```

### API Test:
```bash
# Get pinned message
curl "http://localhost:3001/api/messages/group_1/pinned" \
  -H "Authorization: Bearer TOKEN"

# Response:
{
  "id": "123",
  "content": "This is the pinned message",
  "sender": { "id": "5", "name": "John" },
  "timestamp": "2026-05-14T10:30:00Z"
}
```

---

## **FEATURE 10: INPUT VALIDATION & SANITIZATION** ✅

### What It Does:
Removes harmful HTML/scripts. Enforces length limits. Validates all inputs.

### Verification Test:
```bash
STEP 1: XSS Prevention - HTML Tags
  • Try sending message: "<script>alert('xss')</script>Hello"
  • DevTools → Network → Check request payload
  • Message sent with <script> tags intact
  • But in database: Should be stored as: "alert('xss')</script>Hello"
  • In chat view: Shows plain text, no alert
  
STEP 2: XSS Prevention - Event Handlers
  • Try: "<img src=x onerror='alert(\"xss\")'>"
  • HTML tags stripped
  • Rendered as: Plain text
  • No alert popup
  
STEP 3: Message Length Limit
  • Try message with 10,000 characters
  • Error message: "Message too long (max 5000 chars)"
  • Message rejected
  • Try with exactly 5000: Should succeed
  • Try with 4999: Should succeed
  
STEP 4: Empty Message Validation
  • Click send without typing
  • Error: "Message cannot be empty"
  • Empty message not sent
  
STEP 5: Email Validation on Signup
  • Try creating user: "not-an-email"
  • Error: "Invalid email format"
  • Try: "test@test" (missing TLD)
  • Error: "Invalid email format"
  • Try: "test@test.com"
  • Should work
  
STEP 6: Numeric ID Validation
  • Try URL: /api/messages/abc/pinned
  • Error: 400 Bad Request
  • Try: /api/messages/-5/pinned
  • Error: 400 Bad Request
  • Try: /api/messages/123/pinned
  • Works (valid positive integer)
  
STEP 7: Group Name Validation
  • Try creating group with empty name
  • Error: "Group name required"
  • Try 300 character name
  • Error: "Group name too long (max 255 chars)"
  • Try: "My Awesome Group" (normal)
  • Works
  
STEP 8: Special Characters
  • Message: "This is fine: @mention #hashtag $100 [link]"
  • Sent successfully
  • Rendered as: Plain text with characters preserved
  
✅ PASS CRITERIA:
  - HTML tags removed from messages
  - Scripts cannot execute
  - Length limits enforced
  - Invalid data rejected with clear error
  - Valid special characters allowed
  - Database shows sanitized data
  - No injections possible
  - Error messages helpful to user
```

### Backend Verification:
```javascript
// Test validation middleware
const { sanitizeText } = require('./middleware/validation');

const result = sanitizeText("<script>alert('xss')</script>Hello");
console.log(result); // Should be: "alert('xss')</script>Hello" or similar (tags removed)
```

---

## **FEATURE 11: RATE LIMITING ENFORCEMENT** ✅

### What It Does:
Prevents spam by limiting messages/requests. Slow mode throttles per-user messages.

### Verification Test:
```bash
STEP 1: Enable Slow Mode
  • Admin: Go to group settings
  • Enable "Slow Mode"
  • Set to: "10 seconds"
  • Save settings
  
STEP 2: Test Slow Mode - Single User
  • User: Try sending 2 messages rapidly
  • Message 1: Sent ✓
  • Message 2 (within 10 sec): 
    Error: "Slow mode active. Please wait 8 seconds"
    Status: 429 Too Many Requests
  • After 10 seconds: Can send again
  
STEP 3: Test Slow Mode - Multiple Users
  • User A: Send message (works)
  • User B: Send message (works, different user)
  • User A: Wait 5 seconds
  • User A: Try again
    Error: "Please wait 5 seconds"
  • User B: Can send immediately (not affected)
  • Each user has separate timer
  
STEP 4: General Rate Limit
  • All API endpoints: 100 requests/minute limit
  • Send 101 requests rapidly
  • 101st request: 429 Too Many Requests
  • Retry-After header: Shows wait time
  
STEP 5: Message Rate Limit
  • Specific limit: 30 messages/minute
  • Send 31 messages in 60 seconds
  • 31st message: 429 Too Many Requests
  
STEP 6: Auth Rate Limit
  • Specific limit: 5 login attempts/15 minutes
  • Try login with wrong password 5 times
  • 6th attempt: 429 Too Many Requests
  • Error: "Too many login attempts. Wait 15 minutes"
  • After 15 min: Can try again
  
STEP 7: Check Response Headers
  • When rate limited:
    HTTP Status: 429
    Retry-After: 8 (seconds to wait)
    Body: { "message": "Too many requests..." }
  
STEP 8: Performance Impact
  • Normal operations: No delay
  • Within limits: Instant response
  • Rate limiting: Only applies to violators
  • Other users unaffected
  
✅ PASS CRITERIA:
  - Slow mode enforces per-group time
  - General API limited to 100/min
  - Messages limited to 30/min
  - Auth limited to 5/15min
  - 429 status code returned
  - Retry-After header included
  - Each user has separate counters
  - Server doesn't crash under load
```

### Database Check:
```sql
-- If slow mode is stored per group:
SELECT id, name, slow_mode, slow_mode_seconds FROM groups;
```

---

## **FEATURE 12: ERROR HANDLING & RECOVERY** ✅

### What It Does:
Gracefully handles errors. No crashes. Clear error messages. Auto-reconnect.

### Verification Test:
```bash
STEP 1: Database Connection Error
  • Stop MySQL server
  • Try to send message
  • Expected: Clear error message
    "Server error: Connection failed"
  • NOT: Page crash or blank screen
  • Try again after restarting MySQL
  • Should work again
  
STEP 2: Invalid Token Error
  • Modify localStorage token
  • localStorage.setItem('teams_token', 'invalid.token.here')
  • Try API call
  • Expected: 401 Unauthorized
  • App redirects to login
  • NOT: Page broken
  
STEP 3: Malformed JSON Response
  • DevTools → Network → Response tab
  • If any API returns bad JSON
  • App should show: "Failed to parse response"
  • Try action again
  
STEP 4: Socket Disconnect
  • DevTools → Network tab
  • Right-click on WebSocket
  • Select "Disconnect" (or kill connection)
  • App should show: "Trying to reconnect..."
  • After 5 sec: "Reconnected"
  • Messages continue working
  
STEP 5: Timeout Error
  • DevTools → Throttle network to "Offline"
  • Try to load messages
  • After 30 sec: "Request timeout"
  • Show "Retry" button
  • Switch back to online
  • Click retry: Works
  
STEP 6: Duplicate Entry Error
  • Try creating user with existing email
  • API returns: 409 Conflict
  • App shows: "User already exists"
  • Form allows retry with different email
  
STEP 7: Foreign Key Error
  • Try action referencing deleted user
  • API returns: 400 Bad Request
  • Message: "Invalid user reference"
  • Clear what went wrong
  
STEP 8: Permission Error
  • Non-admin tries admin action
  • API returns: 403 Forbidden
  • App shows: "You don't have permission"
  • Doesn't show full error details
  
STEP 9: Graceful Shutdown
  • Terminal: Kill backend server (Ctrl+C)
  • App: Shows notification
    "Connection lost. Trying to reconnect..."
  • After server restarts:
    "Reconnected!"
  • All pending operations resume
  
STEP 10: Error Logging
  • DevTools → Console
  • Errors logged with context
  • Include: Timestamp, endpoint, error code
  • Server logs show requests
  • Server logs show connection issues
  
✅ PASS CRITERIA:
  - No unhandled exceptions visible
  - All errors show message to user
  - Database errors handled gracefully
  - Auto-reconnect on disconnect
  - Clear error messages (non-technical)
  - Recovery possible without reload
  - Server logs useful for debugging
  - Error responses include Retry-After
```

---

## **FEATURE 13: DATABASE INDEXING OPTIMIZATION** ✅

### What It Does:
Indexes speed up queries by 100-1000x. Prevents full table scans.

### Verification Test:
```bash
STEP 1: Check Indexes Exist
  • MySQL: SHOW INDEXES FROM messages;
  • Output should show:
    - idx_conversation
    - idx_sender_conversation
    - idx_conversation_created
    - idx_is_deleted
  
  • MySQL: SHOW INDEXES FROM users;
  • Output should show:
    - idx_email
    - idx_status
  
  • MySQL: SHOW INDEXES FROM message_reads;
  • Output should show:
    - idx_user_id
    - idx_read_at

STEP 2: Query Performance - Message Load
  • Send 1000 messages to a group
  • Load chat: Measure time
  • Expected: < 200ms
  • Check DevTools → Network → see response time
  
STEP 3: Query Performance - User Search
  • Have 5000 users in system
  • Search: "john"
  • Expected: < 300ms
  • Queries use idx_email and name indexes
  
STEP 4: Query Performance - Unread Count
  • Call: GET /api/messages/unread/counts
  • Expected: < 50ms (even with 50+ conversations)
  • Uses indexes on conversation_last_seen
  
STEP 5: Verify No Full Table Scans
  • Terminal: EXPLAIN SELECT * FROM messages 
    WHERE conversation_id = 'group_1' 
    ORDER BY created_at DESC LIMIT 20;
  • Output: "key: idx_conversation_created"
  • Should use index, NOT "type: ALL" (full scan)
  
STEP 6: Index on Deleted Messages
  • Get active messages: EXPLAIN SELECT * FROM messages 
    WHERE is_deleted = 0 
    ORDER BY created_at DESC;
  • Should use: idx_is_deleted
  • NOT full table scan
  
STEP 7: Load Test - 100 Concurrent Users
  • Have all users loading same chat
  • Server stays responsive
  • No query timeouts
  • Indexes prevent slowdown
  
STEP 8: Before/After Index Check
  • Disable an index temporarily (or simulate)
  • Query becomes slow (> 1 second)
  • Re-enable index
  • Query fast again (< 50ms)
  
✅ PASS CRITERIA:
  - All expected indexes exist
  - Queries use indexes (EXPLAIN shows key)
  - No full table scans on main queries
  - Message load < 200ms
  - User search < 300ms
  - Unread count < 50ms
  - Under load: stays responsive
  - Scales to 10k+ messages per conversation
```

### Detailed Index Analysis:
```sql
-- Check which indexes are used
EXPLAIN SELECT * FROM messages 
WHERE conversation_id = 'group_1' 
ORDER BY created_at DESC LIMIT 20;
-- Should show: "key": "idx_conversation_created"

-- Check for missing indexes
EXPLAIN SELECT * FROM messages
WHERE sender_id = 5 AND conversation_id = 'group_1';
-- Should show: "key": "idx_sender_conversation"

-- Check delete query optimization
EXPLAIN SELECT * FROM messages
WHERE is_deleted = 0 AND conversation_id = 'group_1';
-- Should show: "key": "idx_conversation_created"
```

---

## **FEATURE 14: FRONTEND STATE SYNC & CACHING** ✅

### What It Does:
Cache recent data locally. Messages load instantly. Works offline. Auto-sync on reconnect.

### Storage Used:
- localStorage - TTL-based cache (JSON)
- IndexedDB - Large message storage (offline)

### Verification Test:
```bash
STEP 1: Verify Cache Storage
  • Open DevTools → Storage → Local Storage
  • Find keys like: "teams_cache_messages_group_1"
  • Value contains: JSON of cached messages
  • TTL: Messages cached for 1 hour
  
STEP 2: Instant Message Load
  • Open group chat
  • Close browser
  • Reopen browser
  • Open same group
  • Messages appear instantly (no loading spinner)
  • Then refresh from server (silent background)
  
STEP 3: Offline Message Send
  • Go offline (DevTools → Offline)
  • Type message: "Testing offline"
  • Click Send
  • Message appears in chat immediately (optimistic)
  • Behind scenes: Queued in IndexedDB
  • Check DevTools → IndexedDB → TeamsApp → syncQueue
  • Should see: Entry for pending message
  
STEP 4: Offline Navigation
  • Still offline
  • Navigate to different group
  • Messages from cache load instantly
  • Can view all cached conversations
  
STEP 5: Auto-Sync on Reconnect
  • Go online (DevTools → Back online)
  • Pending message sends automatically
  • Status changes: "Sending..." → "Sent"
  • Server returns ID and timestamp
  • Message updates with real data
  
STEP 6: Conflict Resolution
  • Edit cached message while offline
  • Go online
  • Server has different version
  • App syncs: Keeps local version (last write wins)
  • OR prompts user to choose
  
STEP 7: Cache Expiry
  • Check message cache: "teams_cache_messages_group_1"
  • Wait for cache to expire (1 hour)
  • OR manually clear: localStorage.clear()
  • Next load: Fresh from server
  
STEP 8: State Sync Batching
  • Send rapid updates: 3 messages in 1 second
  • Batch processed: NOT 3 separate DB updates
  • Single batch state update
  • Reduces DB load
  
STEP 9: IndexedDB Storage
  • Have 50+ messages in conversation
  • All stored in IndexedDB (browser storage)
  • Persists across sessions
  • Survives app crash
  
✅ PASS CRITERIA:
  - Cache appears in localStorage
  - Messages load instantly from cache
  - TTL expires after 1 hour
  - Offline sends queue in IndexedDB
  - Auto-sync on reconnect
  - Pending operations resume
  - No data loss
  - Cache survives browser restart
  - Scales to 1000+ messages
```

### Storage Verification:
```javascript
// Check cache manager
localStorage.getItem('teams_cache_messages_group_1')
// Should return: JSON string with messages + TTL

// Check IndexedDB
indexedDB.databases().forEach(db => {
  console.log(db.name); // Should include "TeamsApp"
});

// Check pending sync queue
// Should be empty when online
// Should have entries when offline
```

---

## **FEATURE 15: COMPREHENSIVE SECURITY & ARCHITECTURE** ✅

### What It Does:
Complete security stack. JWT tokens. Input sanitization. Rate limits. Integrity constraints.

### Verification Test:
```bash
STEP 1: Password Hashing
  • Check database:
    SELECT email, password FROM users LIMIT 1;
  • Password should show: $2a$10$... (bcrypt hash)
  • NOT plain text
  • If plaintext: SECURITY FAILURE
  
STEP 2: JWT Token Format
  • Login
  • Check localStorage token
  • Should be: xxxx.xxxx.xxxx (3 parts separated by dots)
  • Decode middle part: Payload with user info
  • NOT human-readable (base64 encoded)
  
STEP 3: Token Tampering
  • localStorage.setItem('teams_token', 'fake.token.123')
  • Try any API call
  • Expected: 401 Unauthorized
  • NOT accepted
  
STEP 4: Token Expiration
  • Note token at 1:00 PM
  • Wait for expiration (7 days by default, or set to 1 hour for testing)
  • Try API call after expiry
  • Expected: 401 Unauthorized or auto-refresh
  • App should request refresh
  
STEP 5: Auto-Refresh Mechanism
  • API call returns 403
  • Behind scenes: Refresh token endpoint called
  • New token obtained
  • Original request retried
  • User sees seamless operation
  
STEP 6: SQL Injection Prevention
  • Search: "' OR '1'='1"
  • Expected: No SQL error
  • Results: Treated as literal search string
  • Database queries parameterized
  
STEP 7: CORS Protection
  • Try request from: http://evil.com
  • Browser blocks with CORS error
  • Only: localhost:9002 allowed
  • Check server.js: ALLOWED_ORIGINS
  
STEP 8: Foreign Key Constraints
  • Try delete user who has messages
  • Expected: Database error or cascade delete
  • Consistency maintained
  • NOT orphaned messages
  
STEP 9: Rate Limiting Security
  • Brute force login: 10 attempts rapidly
  • After 5 attempts: Blocked for 15 minutes
  • Prevents: Account takeover attempts
  
STEP 10: Error Message Sanitization
  • API errors should NOT leak:
    - Database structure
    - Internal paths
    - System details
  • Generic message: "Server error"
  • Detailed error: In logs only, not to user
  
STEP 11: HTTPS Ready
  • Backend doesn't enforce HTTPS in dev
  • But: Session cookies can be HttpOnly (in production)
  • Token stored in localStorage (not cookies) for SPA
  • Production: Force HTTPS, set Secure flag
  
STEP 12: Input Sanitization Everywhere
  • Try any injection: <>script, <img onerror>, etc.
  • All: Sanitized before storage
  • Render: HTML entities escaped
  • NO XSS vulnerability
  
STEP 13: Database Encryption
  • Sensitive data: Password hashed
  • Tokens: Not stored long-term
  • In production: Enable MySQL SSL
  • Connections: Encrypted in transit
  
STEP 14: Audit Logging
  • Important actions logged:
    - Login/logout
    - Permission changes
    - Data modifications
  • Logs: Include timestamp, user, action
  • Not exposed: To regular users
  
✅ PASS CRITERIA:
  - Passwords hashed (never plaintext)
  - Tokens: JWT format, expires
  - Auto-refresh: Transparent
  - SQL injection: Prevented
  - XSS: Prevented
  - CORS: Configured correctly
  - Rate limiting: Enforced
  - Foreign keys: Maintained
  - Errors: Safe messages
  - In production: HTTPS enforced
```

### Security Checklist:
```sql
-- Verify password hashing
SELECT email, LEFT(password, 20) as pwd_hash FROM users;
-- Should show: $2a$10$...

-- Verify constraints
SHOW CREATE TABLE messages;
-- Should show: FOREIGN KEY constraints

-- Check for plaintext passwords (should be empty)
SELECT COUNT(*) FROM users WHERE password NOT LIKE '$2a$%';
-- Should return: 0
```

---

## 🎯 QUICK TEST CHECKLIST (20 minutes)

Run these rapid tests to verify everything works:

```
[ ] 1. Login → Check token in storage → Refresh page → Still logged in
[ ] 2. Send message → Message appears instantly → Check DB has it
[ ] 3. Open two windows → Send message in window 1 → Appears in window 2 (no refresh)
[ ] 4. Hover message → Add 👍 emoji → See count "1" instantly in both windows
[ ] 5. Mark message as read → Other user sees ✓✓ → Both windows update
[ ] 6. Type message (don't send) → Other window shows "typing..."
[ ] 7. Close browser → Reopen → Notifications still there (persistent)
[ ] 8. Search "hello" → Results appear < 500ms
[ ] 9. Search users "john" → Ranked results
[ ] 10. Pin message → Shows in header → Other user sees it
[ ] 11. Enable slow mode (10s) → Send message → Try again < 10s → Error 429
[ ] 12. Try HTML message <script> → Renders as plain text
[ ] 13. Go offline → Send message → Shows pending → Go online → Sends
[ ] 14. Enable slow mode → Send 31 messages in 1 min → 31st rejected
[ ] 15. Stop DB → Try API → Error message (not crash)
```

All tests should pass! ✅

