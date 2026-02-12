# Implementation Plan: 4 New Features

## Feature 1: Follow-Up Reminders

**What:** When sending an email, users can set "remind me in N days if no reply." A background checker resurfaces the thread to the inbox when the reminder fires and no reply has been received.

### 1.1 Database Migration (v6)

Add to `src/services/db/migrations.ts` as migration v6:

```sql
CREATE TABLE IF NOT EXISTS follow_up_reminders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,        -- the sent message we're tracking
  remind_at INTEGER NOT NULL,      -- unix timestamp
  status TEXT DEFAULT 'pending',   -- pending | triggered | cancelled
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_followup_status ON follow_up_reminders(status, remind_at);
CREATE INDEX idx_followup_thread ON follow_up_reminders(account_id, thread_id);
```

### 1.2 Service Layer

New file: `src/services/followup/followupManager.ts`

Follow the exact same pattern as `snoozeManager.ts`:

- `startFollowUpChecker()` — 60s interval, called from `App.tsx` init
- `stopFollowUpChecker()` — cleanup, called from `App.tsx` cleanup
- `checkFollowUpReminders()` — internal, runs every 60s:
  1. Query: `SELECT * FROM follow_up_reminders WHERE status = 'pending' AND remind_at <= ?`
  2. For each reminder, check if a reply exists:
     - Query `messages` table: `SELECT COUNT(*) FROM messages WHERE account_id = ? AND thread_id = ? AND date > (SELECT date FROM messages WHERE id = ?) AND from_address != (SELECT email FROM accounts WHERE id = ?)`
     - If reply exists → set `status = 'cancelled'` (auto-dismiss)
     - If no reply → set `status = 'triggered'`, fire notification via `notifyFollowUpDue(subject, threadId, accountId)`
  3. Dispatch `velo-sync-done` to refresh UI
- `createFollowUpReminder(accountId, threadId, messageId, remindAt)` — insert into DB
- `cancelFollowUpReminder(accountId, threadId)` — set status to cancelled
- `getFollowUpReminder(accountId, threadId)` — get active reminder for a thread

### 1.3 DB Service Layer

New file: `src/services/db/followUpReminders.ts`

- `insertFollowUpReminder(...)` — INSERT into follow_up_reminders
- `getPendingFollowUpReminders()` — SELECT where status = 'pending' AND remind_at <= now
- `getFollowUpForThread(accountId, threadId)` — get active reminder
- `updateFollowUpStatus(id, status)` — UPDATE status
- `deleteFollowUpReminder(id)` — DELETE

### 1.4 Notification Integration

Add to `src/services/notifications/notificationManager.ts`:

- New function `notifyFollowUpDue(subject, threadId, accountId)`:
  - Title: "Follow up needed"
  - Body: subject or "(No subject)"
  - Same action type as email notifications (reply/archive)

### 1.5 UI: Follow-Up Dialog

New file: `src/components/email/FollowUpDialog.tsx`

Similar to `SnoozeDialog.tsx` — a popover with time options:
- "In 1 day", "In 2 days", "In 3 days", "In 1 week", "Custom..."
- Custom date/time picker
- Triggered from ActionBar button (clock + arrow icon)

### 1.6 UI: ActionBar Integration

Modify `src/components/email/ActionBar.tsx`:

- Add a "Follow Up" button (using `BellRing` or `ClockAlert` icon from lucide)
- Shows only when viewing a thread where the user sent the last message
- Opens `FollowUpDialog`
- Shows indicator if an active follow-up exists on this thread
- Option to cancel existing follow-up

### 1.7 UI: Follow-Up Indicator on ThreadCard

Modify `src/components/email/ThreadCard.tsx`:

- Small bell icon on threads that have an active follow-up reminder
- Query reminder status when loading thread list (batch query for efficiency)

### 1.8 Composer Integration

Modify `src/components/composer/Composer.tsx`:

- After successful send, show a small prompt: "Remind me if no reply?"
- Quick options: "In 2 days" / "In 1 week" / "No thanks"
- This creates the follow_up_reminder automatically

### 1.9 App.tsx Startup

- Import and call `startFollowUpChecker()` in init, after `startScheduledSendChecker()`
- Import and call `stopFollowUpChecker()` in cleanup

---

## Feature 2: Smart Notifications (Priority Only)

**What:** Only fire OS notifications for emails categorized as "Primary" (real humans). Suppress notifications for Updates, Promotions, Social, Newsletters. Optional VIP list for always-notify senders.

### 2.1 Database Changes

Add to migration v6:

```sql
-- VIP senders who always trigger notifications
CREATE TABLE IF NOT EXISTS notification_vips (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(account_id, email_address)
);
CREATE INDEX idx_notification_vips ON notification_vips(account_id, email_address);

-- Settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('smart_notifications', 'true'),
  ('notify_categories', 'Primary');
```

### 2.2 Service Layer

New file: `src/services/db/notificationVips.ts`

- `getVipSenders(accountId)` — returns Set<string> of VIP email addresses
- `addVipSender(accountId, email, displayName)` — INSERT
- `removeVipSender(accountId, email)` — DELETE
- `isVipSender(accountId, email)` — boolean check

### 2.3 Modify Notification Flow in sync.ts

Modify `src/services/gmail/sync.ts` — in the deltaSync notification section (around line 337):

Before calling `queueNewEmailNotification()`, add filtering:

1. Load `smart_notifications` setting (cache for the sync cycle)
2. If enabled:
   a. Get the thread's category from `thread_categories`
   b. Load allowed categories from `notify_categories` setting
   c. Check if sender is in VIP list
   d. Only call `queueNewEmailNotification()` if category is in allowed list OR sender is VIP
3. If disabled: notify for everything (current behavior)

### 2.4 Settings UI

Modify `src/components/settings/SettingsPage.tsx`:

Add a "Notifications" section:
- Toggle: "Smart notifications" (on/off)
- When on: checkboxes for which categories to notify (Primary checked by default)
- VIP list management: add/remove email addresses
- "Add VIP from contacts" with autocomplete from contacts table

### 2.5 Quick VIP from Thread View

Modify `src/components/email/ActionBar.tsx` or context menu:

- Right-click on sender → "Always notify for this sender" (adds to VIP)
- Bell icon indicator for VIP senders

---

## Feature 3: One-Click Unsubscribe Manager

**What:** Surface unsubscribe prominently on newsletter/promo emails. Support RFC 8058 one-click POST and mailto: unsubscribe without opening a browser. Add a manager view to see all subscriptions.

### 3.1 Database Changes

Add to migration v6:

```sql
CREATE TABLE IF NOT EXISTS unsubscribe_actions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT,
  method TEXT NOT NULL,             -- 'http_post' | 'mailto' | 'browser'
  unsubscribe_url TEXT NOT NULL,
  status TEXT DEFAULT 'subscribed', -- subscribed | unsubscribed | failed
  unsubscribed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(account_id, from_address)
);
CREATE INDEX idx_unsub_account ON unsubscribe_actions(account_id, status);
```

### 3.2 Service Layer

New file: `src/services/unsubscribe/unsubscribeManager.ts`

- `parseUnsubscribeHeader(header: string)`:
  - Returns `{ httpUrl?: string, mailtoAddress?: string, hasOneClick: boolean }`
  - Parse `List-Unsubscribe` for `<https://...>` and `<mailto:...>`
  - Check for `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header
- `executeUnsubscribe(accountId, threadId, header, listUnsubscribePost)`:
  - If HTTP + one-click POST header → use Tauri HTTP client to POST `List-Unsubscribe=One-Click` to the URL (RFC 8058) — no browser needed
  - If mailto → use Gmail API to send an email to the unsubscribe address with subject "unsubscribe"
  - Fallback: open URL in browser via `openUrl()`
  - Store result in `unsubscribe_actions` table
- `getSubscriptions(accountId)` — list all detected newsletters/senders with unsubscribe headers
  - Query: join `messages` with `unsubscribe_actions` to show status
  - Group by `from_address`, get latest `list_unsubscribe` header
- `getUnsubscribeStatus(accountId, fromAddress)` — check if already unsubscribed

### 3.3 Message Parser Enhancement

Modify `src/services/gmail/messageParser.ts`:

- Already parses `List-Unsubscribe` header
- **Add**: also parse `List-Unsubscribe-Post` header (needed for RFC 8058 one-click)
- Add `listUnsubscribePost: string | null` to `ParsedMessage`

### 3.4 Database Message Storage

Modify `src/services/db/messages.ts`:

- Add migration: `ALTER TABLE messages ADD COLUMN list_unsubscribe_post TEXT`
- Update `upsertMessage()` to include `listUnsubscribePost`

### 3.5 UI: Enhanced Unsubscribe Button

Modify `src/components/email/MessageItem.tsx`:

- Replace current `openUrl()` behavior with smart unsubscribe:
  - If one-click POST available → unsubscribe inline (no browser), show success toast
  - If mailto → send unsubscribe email via Gmail API, show success toast
  - Fallback → open in browser (current behavior)
- Show unsubscribe status: "Unsubscribed" badge if already unsubscribed

Modify `src/components/email/ActionBar.tsx`:

- Same enhancement to the existing unsubscribe button
- After unsubscribe, auto-archive thread

### 3.6 UI: Subscription Manager Page

New file: `src/components/settings/SubscriptionManager.tsx`

Accessed from Settings page as a new tab/section:

- List all detected newsletter senders (from messages with `list_unsubscribe` headers)
- Group by sender, show: sender name, email, frequency (emails/month), last received
- Status: "Subscribed" / "Unsubscribed"
- Bulk actions: select multiple → "Unsubscribe All"
- Search/filter within the list

### 3.7 Settings Integration

Add "Subscriptions" tab to `src/components/settings/SettingsPage.tsx`:

- Links to the SubscriptionManager
- Option: "Auto-archive after unsubscribe" (on/off setting)

---

## Feature 4: Newsletter Bundling + Delivery Schedules

**What:** Collapse all newsletters (and optionally other categories) into a single expandable row in the email list. Allow setting delivery schedules ("show newsletters only on Saturday 9am").

### 4.1 Database Changes

Add to migration v6:

```sql
CREATE TABLE IF NOT EXISTS bundle_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL,           -- 'Newsletters' | 'Promotions' | 'Social' | 'Updates'
  is_bundled INTEGER DEFAULT 1,     -- whether to collapse into single row
  delivery_enabled INTEGER DEFAULT 0,
  delivery_schedule TEXT,           -- JSON: { "days": [0,6], "hour": 9, "minute": 0 }
  last_delivered_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(account_id, category)
);
CREATE INDEX idx_bundle_rules_account ON bundle_rules(account_id);

-- Tracks which threads are being held back by delivery schedule
CREATE TABLE IF NOT EXISTS bundled_threads (
  account_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  category TEXT NOT NULL,
  held_until INTEGER,               -- NULL = not held (just bundled), timestamp = delivery schedule
  PRIMARY KEY (account_id, thread_id),
  FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_bundled_held ON bundled_threads(held_until);
```

### 4.2 Service Layer: Bundle Manager

New file: `src/services/bundles/bundleManager.ts`

- `startBundleChecker()` / `stopBundleChecker()` — 60s interval (like snooze)
- `checkBundleDelivery()` — runs every 60s:
  1. Load all bundle_rules with `delivery_enabled = 1`
  2. For each rule, check if current time matches the delivery schedule
  3. If delivery time has arrived:
     - Clear `held_until` for all bundled_threads in this category
     - Update `last_delivered_at`
     - Fire notification: "Your newsletters are ready" (or category-specific)
     - Dispatch `velo-sync-done` to refresh UI
- `getBundleRules(accountId)` — returns all bundle configurations
- `setBundleRule(accountId, category, isBundled, deliveryEnabled, schedule)` — upsert
- `holdThread(accountId, threadId, category, heldUntil)` — insert into bundled_threads
- `isThreadHeld(accountId, threadId)` — check if thread is held by schedule
- `getBundleSummary(accountId, category)` — returns { count, latestSubject, latestSender }

### 4.3 Integration with Sync

Modify `src/services/gmail/sync.ts`:

In `processAndStoreThread()` after categorization (around line 79):

- After `setThreadCategory()`, check if this category has a bundle rule with delivery schedule
- If yes and delivery time hasn't arrived: insert into `bundled_threads` with `held_until`
- The thread still gets stored normally but is flagged as "held"

### 4.4 UI: Bundle Row in EmailList

Modify `src/components/layout/EmailList.tsx`:

When rendering threads for a category view or "All" view:

- If a category has `is_bundled = 1`:
  - Instead of showing individual threads, show a single collapsible "bundle row"
  - Bundle row shows: category icon, "5 Newsletters", latest sender, latest subject snippet
  - Click to expand → shows all threads in that bundle inline
  - "Archive All" button on the bundle row to dismiss entire bundle
  - If threads are held by delivery schedule, show: "Newsletters — scheduled for Saturday 9am"

### 4.5 UI: Bundle Configuration

Modify `src/components/settings/SettingsPage.tsx`:

New "Bundles" section:

- For each category (Newsletters, Promotions, Social, Updates):
  - Toggle: "Bundle into single row" (on/off)
  - Toggle: "Delivery schedule" (on/off)
  - When delivery on: day picker (checkboxes for Mon-Sun) + time picker
  - Preview: "Newsletters will appear every Saturday at 9:00 AM"

### 4.6 UI: Category Header Actions

Modify `src/components/layout/EmailList.tsx` — CategoryTabs:

- Add a small settings gear icon next to each category tab
- Click → quick configure: "Bundle this category" / "Set delivery schedule"
- Or link to full settings

### 4.7 App.tsx Startup

- Import and call `startBundleChecker()` in init
- Import and call `stopBundleChecker()` in cleanup

---

## Migration v6 Summary

All four features share a single migration (v6) with these tables:

1. `follow_up_reminders` — Feature 1
2. `notification_vips` — Feature 2
3. `unsubscribe_actions` — Feature 3
4. `bundle_rules` — Feature 4
5. `bundled_threads` — Feature 4
6. `ALTER TABLE messages ADD COLUMN list_unsubscribe_post TEXT` — Feature 3
7. New settings: `smart_notifications`, `notify_categories`, `auto_archive_after_unsubscribe`

## New Files Summary

| File | Feature |
|------|---------|
| `src/services/followup/followupManager.ts` | 1 |
| `src/services/db/followUpReminders.ts` | 1 |
| `src/components/email/FollowUpDialog.tsx` | 1 |
| `src/services/db/notificationVips.ts` | 2 |
| `src/services/unsubscribe/unsubscribeManager.ts` | 3 |
| `src/components/settings/SubscriptionManager.tsx` | 3 |
| `src/services/bundles/bundleManager.ts` | 4 |

## Modified Files Summary

| File | Features |
|------|----------|
| `src/services/db/migrations.ts` | 1, 2, 3, 4 |
| `src/services/notifications/notificationManager.ts` | 1, 2 |
| `src/services/gmail/sync.ts` | 2, 3, 4 |
| `src/services/gmail/messageParser.ts` | 3 |
| `src/services/db/messages.ts` | 3 |
| `src/components/email/ActionBar.tsx` | 1, 3 |
| `src/components/email/MessageItem.tsx` | 3 |
| `src/components/email/ThreadCard.tsx` | 1 |
| `src/components/layout/EmailList.tsx` | 4 |
| `src/components/settings/SettingsPage.tsx` | 2, 3, 4 |
| `src/components/composer/Composer.tsx` | 1 |
| `src/App.tsx` | 1, 4 |

## Implementation Order

1. **Migration v6** — all tables at once (single migration)
2. **Feature 2: Smart Notifications** — smallest surface area, modifies existing code only
3. **Feature 1: Follow-Up Reminders** — new service + UI, follows snooze pattern exactly
4. **Feature 3: One-Click Unsubscribe** — enhances existing unsubscribe, adds manager view
5. **Feature 4: Newsletter Bundling** — most complex UI changes (EmailList bundle rows)
