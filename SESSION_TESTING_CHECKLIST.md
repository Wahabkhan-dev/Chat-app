# ✅ SESSION & SETTINGS VERIFICATION CHECKLIST

## Pre-Deployment Checks

### Step 1: Install Dependencies
```bash
cd Front-End
npm install
```
- ✅ jwt-decode installed from package.json

### Step 2: Verify Files Exist
```bash
# Check new files created
ls src/services/settings.ts        # ✅ Should exist
ls src/services/session.ts         # ✅ Should exist
ls src/components/SessionExpiryWarning.tsx  # ✅ Should exist
```

### Step 3: Run Development Server
```bash
npm run dev
# Should start without errors on http://localhost:9002
```

---

## Testing Scenarios

### Scenario 1: Basic Login/Logout
```
1. Start app
2. Login with: admin@mawbytec.com / admin123
   ✅ Should log in successfully
   ✅ Check localStorage:
      - 'teams_token' should have JWT
      - 'mawby_session_info' should have session data
      - 'mawby_user_settings' should have settings
3. Refresh page (F5)
   ✅ Should stay logged in (no login page)
4. Click logout
   ✅ Should redirect to login
   ✅ Check localStorage:
      - 'teams_token' should be CLEARED
      - 'mawby_session_info' should be CLEARED
      - 'mawby_user_settings' should still exist (preserved)
```

### Scenario 2: Settings Persistence
```
1. Login
2. Open browser console:
   localStorage.getItem('mawby_user_settings')
   ✅ Should show JSON with settings
3. Change a setting (if UI exists):
   - Change theme to 'dark'
   ✅ Should apply immediately
   ✅ Check localStorage again:
      localStorage.getItem('mawby_user_settings')
      ✅ theme should be 'dark'
4. Refresh page
   ✅ Theme should still be 'dark'
5. Logout
   ✅ Settings should NOT be cleared
6. Login again
   ✅ Theme should still be 'dark'
```

### Scenario 3: Cross-Tab Synchronization
```
1. Open app in Tab 1
2. Login with: admin@mawbytec.com / admin123
3. Open app in Tab 2 (same browser)
   ✅ Tab 2 should already be logged in (no login needed)
   ✅ Check Tab 2's user data matches Tab 1
4. Change theme in Tab 1 (if UI exists)
   ✅ Theme should change in Tab 2 automatically
5. Logout in Tab 1
   ✅ Tab 2 should be logged out too (redirects to login)
   ✅ Both tabs cleared of token/session
```

### Scenario 4: Session Warning (Optional - Advanced)
```
Note: Default timeout is 30 minutes inactivity
For testing, can temporarily reduce in services/session.ts

1. Login
2. Wait/Idle for 25 minutes (or reduced timeout for dev)
3. Session Warning Modal should appear showing:
   - "Session Expiring Soon"
   - Countdown timer
   - "Logout" button
   - "Extend Session" button
4. Click "Extend Session"
   ✅ Warning should disappear
   ✅ Timer should reset
   ✅ Session continues
5. Or click "Logout"
   ✅ Should logout immediately
```

### Scenario 5: DevTools Console Testing
```
// Open DevTools → Console tab

// Check session status
import { getSessionSummary } from '@/services/session'
getSessionSummary()
// Should show:
// {
//   isActive: true,
//   hasToken: true,
//   sessionInfo: {...}
// }

// Check settings
import { loadSettings } from '@/services/settings'
loadSettings()
// Should show all 20+ settings

// Check if session expired
import { isSessionExpired } from '@/services/session'
isSessionExpired() // Should return: false

// Get remaining time
import { getRemainingSessionTime } from '@/services/session'
getRemainingSessionTime() // Should return: milliseconds (positive number)
```

### Scenario 6: Manual localStorage Testing
```
// Open DevTools → Application → LocalStorage

After Login, should have:
✅ teams_token          (JWT token)
✅ mawby_session_info   (session data)
✅ mawby_user_settings  (user settings)
✅ mawby_settings_version (version number)
✅ cmeta_1              (conversation metadata - per user)

After Logout, should have:
✅ teams_token          ❌ CLEARED
✅ mawby_session_info   ❌ CLEARED
✅ mawby_user_settings  ✅ PRESERVED
✅ mawby_settings_version ✅ PRESERVED
✅ cmeta_1              ✅ PRESERVED
```

---

## Debugging Commands

### Check Session Status
```javascript
// In browser console:
import { getSessionSummary } from '@/services/session';
console.log(getSessionSummary());
```

### Check Settings
```javascript
// In browser console:
import { loadSettings } from '@/services/settings';
const settings = loadSettings();
console.log('Current theme:', settings.theme);
console.log('All settings:', settings);
```

### Check localStorage
```javascript
// In browser console:
console.log('Token:', localStorage.getItem('teams_token'));
console.log('Session:', localStorage.getItem('mawby_session_info'));
console.log('Settings:', localStorage.getItem('mawby_user_settings'));
```

### Enable Debug Mode
```javascript
// In browser console:
import { loadSettings, updateSettings } from '@/services/settings';
const settings = loadSettings();
updateSettings({ debugMode: true });
// Check: localStorage.getItem('mawby_user_settings')
```

### Test Settings Event Listener
```javascript
// In browser console:
import { onSettingsChanged } from '@/services/settings';
const unsubscribe = onSettingsChanged((newSettings) => {
  console.log('Settings changed!', newSettings);
});
// Now try to change a setting in UI
// Or: updateSettings({ theme: 'dark' })
// Should log: Settings changed!
```

---

## Expected Behavior

### ✅ What Should Work
- Login succeeds
- Session created automatically
- Token stored in localStorage
- Settings stored in localStorage
- Page refresh maintains login
- Logout clears token & session
- Settings persist after logout
- Multiple tabs stay in sync
- Theme applies correctly
- Session warning appears (before timeout)
- Extend session resets timeout

### ❌ What Should NOT Work (or fail gracefully)
- Logout button should logout (clear token)
- Expired token should trigger refresh
- Invalid token should redirect to login
- Inactivity should trigger warning
- No settings should use defaults

---

## Troubleshooting

### Issue: "jwt-decode not found"
**Solution:**
```bash
npm install jwt-decode
```

### Issue: Session not persisting after refresh
**Solution:**
Check console for errors:
```javascript
import { getSessionInfo } from '@/services/session';
console.log(getSessionInfo());
```
Should not be null. If null, login again.

### Issue: Settings not saving
**Solution:**
Check localStorage quota:
```javascript
// If this throws, localStorage is full
try {
  localStorage.setItem('test', 'data');
  localStorage.removeItem('test');
} catch(e) {
  console.error('localStorage full!');
}
```

### Issue: Cross-tab sync not working
**Solution:**
Check browser support for storage events (should work in all modern browsers).
Manual workaround: Use SharedWorker (advanced).

### Issue: SessionExpiryWarning not appearing
**Solution:**
1. Check SessionExpiryWarning added to layout.tsx
2. Wait 25+ minutes (or reduce timeout in session.ts for testing)
3. Check console: `state.sessionWarning` should show `{ show: true }`

### Issue: Theme not applying
**Solution:**
Check that theme class is added to <html>:
```javascript
// In DevTools Elements tab:
<html class="dark">
// or
<html class="light">
// or
<html class="system">
```

---

## Performance Expectations

| Operation | Expected Time |
|-----------|----------------|
| Login | < 1 second |
| Logout | < 500ms |
| Theme change | < 100ms |
| Settings save | < 100ms |
| Session check | < 50ms |
| Cross-tab sync | < 200ms |

---

## Browser Compatibility

### ✅ Supported
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+
- Most modern mobile browsers

### Features Used
- localStorage API ✅
- CustomEvent ✅
- JWT (jwt-decode) ✅
- localStorage events ✅
- setTimeout/setInterval ✅

---

## Security Verification

### ✅ What's Secure
- Token not in cookies (XSS safe)
- Settings non-sensitive (ok to expose)
- Session info minimal (no passwords)
- CORS configured (frontend only)
- Passwords hashed (server side)

### ⚠️ Production Considerations
- Consider HttpOnly cookies for tokens
- Add token blacklist for revocation
- Consider device fingerprinting
- Add audit logging for logouts
- Monitor session duration

---

## Final Checklist

Before considering complete:

- [ ] npm install runs without errors
- [ ] App starts: `npm run dev`
- [ ] Login works: admin@mawbytec.com / admin123
- [ ] Token in localStorage after login
- [ ] Settings in localStorage after login
- [ ] Page refresh stays logged in
- [ ] Logout clears token & session
- [ ] Settings persist after logout
- [ ] Two tabs logged in simultaneously
- [ ] Change in tab 1 syncs to tab 2
- [ ] Logout in tab 1 logs out tab 2
- [ ] No console errors
- [ ] SessionExpiryWarning component exists
- [ ] All new files created
- [ ] Auth service updated
- [ ] AppContext updated
- [ ] Layout includes SessionExpiryWarning

---

## Quick Test Command

```bash
# 1. Start backend
cd Back-End
node server.js

# 2. In another terminal, start frontend
cd Front-End
npm run dev

# 3. Visit http://localhost:9002
# 4. Login and test above scenarios
```

---

## Need Help?

1. Check console for errors: `F12` → Console tab
2. Check localStorage: `F12` → Application → LocalStorage
3. Check network: `F12` → Network tab
4. Read full guide: `SESSION_SETTINGS_GUIDE.md`

---

**Status: ✅ READY FOR TESTING**

All files created and configured. Ready to test!
