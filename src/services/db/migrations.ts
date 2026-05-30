import { getDb } from "./connection";

const MIGRATIONS = [
  {
    version: 1,
    description: "Initial schema",
    sql: `
      -- Accounts
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT,
        avatar_url TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at INTEGER,
        history_id TEXT,
        last_sync_at INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );

      -- Labels
      CREATE TABLE IF NOT EXISTS labels (
        id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        color_bg TEXT,
        color_fg TEXT,
        visible INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (account_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_labels_account ON labels(account_id);

      -- Threads
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        subject TEXT,
        snippet TEXT,
        last_message_at INTEGER,
        message_count INTEGER DEFAULT 0,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        is_important INTEGER DEFAULT 0,
        has_attachments INTEGER DEFAULT 0,
        is_snoozed INTEGER DEFAULT 0,
        snooze_until INTEGER,
        PRIMARY KEY (account_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_threads_date ON threads(account_id, last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_threads_snoozed ON threads(is_snoozed, snooze_until);

      -- Thread-Label junction
      CREATE TABLE IF NOT EXISTS thread_labels (
        thread_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        label_id TEXT NOT NULL,
        PRIMARY KEY (account_id, thread_id, label_id),
        FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_thread_labels_label ON thread_labels(account_id, label_id);

      -- Messages
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        from_address TEXT,
        from_name TEXT,
        to_addresses TEXT,
        cc_addresses TEXT,
        bcc_addresses TEXT,
        reply_to TEXT,
        subject TEXT,
        snippet TEXT,
        date INTEGER NOT NULL,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        body_html TEXT,
        body_text TEXT,
        body_cached INTEGER DEFAULT 0,
        raw_size INTEGER,
        internal_date INTEGER,
        PRIMARY KEY (account_id, id),
        FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(account_id, thread_id, date ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(account_id, date DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_address);

      -- Attachments
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        filename TEXT,
        mime_type TEXT,
        size INTEGER,
        gmail_attachment_id TEXT,
        content_id TEXT,
        is_inline INTEGER DEFAULT 0,
        local_path TEXT,
        FOREIGN KEY (account_id, message_id) REFERENCES messages(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(account_id, message_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_cid ON attachments(content_id);

      -- Contacts
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT,
        avatar_url TEXT,
        frequency INTEGER DEFAULT 1,
        last_contacted_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
      CREATE INDEX IF NOT EXISTS idx_contacts_frequency ON contacts(frequency DESC);

      -- Signatures
      CREATE TABLE IF NOT EXISTS signatures (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        body_html TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      );

      -- Scheduled emails
      CREATE TABLE IF NOT EXISTS scheduled_emails (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        to_addresses TEXT NOT NULL,
        cc_addresses TEXT,
        bcc_addresses TEXT,
        subject TEXT,
        body_html TEXT NOT NULL,
        reply_to_message_id TEXT,
        thread_id TEXT,
        scheduled_at INTEGER NOT NULL,
        signature_id TEXT,
        attachment_paths TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_emails(status, scheduled_at);

      -- App settings
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Default settings
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('theme', 'system'),
        ('sidebar_collapsed', 'false'),
        ('reading_pane_position', 'right'),
        ('sync_period_days', '365'),
        ('notifications_enabled', 'true'),
        ('undo_send_delay_seconds', '5'),
        ('default_font', 'system'),
        ('font_size', 'default');

      -- Migration tracking
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        description TEXT,
        applied_at INTEGER DEFAULT (unixepoch())
      );
    `,
  },
  {
    version: 2,
    description: "Full-text search",
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        subject,
        from_name,
        from_address,
        body_text,
        snippet,
        content='messages',
        content_rowid='rowid',
        tokenize='trigram'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, subject, from_name, from_address, body_text, snippet)
        VALUES (new.rowid, new.subject, new.from_name, new.from_address, new.body_text, new.snippet);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, subject, from_name, from_address, body_text, snippet)
        VALUES ('delete', old.rowid, old.subject, old.from_name, old.from_address, old.body_text, old.snippet);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, subject, from_name, from_address, body_text, snippet)
        VALUES ('delete', old.rowid, old.subject, old.from_name, old.from_address, old.body_text, old.snippet);
        INSERT INTO messages_fts(rowid, subject, from_name, from_address, body_text, snippet)
        VALUES (new.rowid, new.subject, new.from_name, new.from_address, new.body_text, new.snippet);
      END;
    `,
  },
  {
    version: 3,
    description: "Add List-Unsubscribe header storage",
    sql: `
      ALTER TABLE messages ADD COLUMN list_unsubscribe TEXT;
    `,
  },
  {
    version: 4,
    description: "Filter rules, templates, image allowlist",
    sql: `
      -- Filter rules
      CREATE TABLE IF NOT EXISTS filter_rules (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        criteria_json TEXT NOT NULL,
        actions_json TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_filter_rules_account ON filter_rules(account_id);

      -- Templates
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        name TEXT NOT NULL,
        subject TEXT,
        body_html TEXT NOT NULL,
        shortcut TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_templates_account ON templates(account_id);

      -- Image allowlist
      CREATE TABLE IF NOT EXISTS image_allowlist (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        sender_address TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, sender_address)
      );
      CREATE INDEX IF NOT EXISTS idx_image_allowlist_sender ON image_allowlist(account_id, sender_address);

      INSERT OR IGNORE INTO settings (key, value) VALUES ('block_remote_images', 'true');
    `,
  },
  {
    version: 5,
    description: "Pin support, AI cache, thread categories, calendar events, contact enrichment, attachment caching",
    sql: `
      -- Pin support
      ALTER TABLE threads ADD COLUMN is_pinned INTEGER DEFAULT 0;
      CREATE INDEX idx_threads_pinned ON threads(account_id, is_pinned DESC, last_message_at DESC);

      -- AI cache
      CREATE TABLE ai_cache (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, thread_id, type)
      );
      CREATE INDEX idx_ai_cache_lookup ON ai_cache(account_id, thread_id, type);

      -- Thread categories (split inbox)
      CREATE TABLE thread_categories (
        account_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        category TEXT NOT NULL,
        is_manual INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (account_id, thread_id),
        FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX idx_thread_categories_cat ON thread_categories(account_id, category);

      -- Calendar events
      CREATE TABLE calendar_events (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        google_event_id TEXT NOT NULL,
        summary TEXT,
        description TEXT,
        location TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        is_all_day INTEGER DEFAULT 0,
        status TEXT DEFAULT 'confirmed',
        organizer_email TEXT,
        attendees_json TEXT,
        html_link TEXT,
        updated_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, google_event_id)
      );
      CREATE INDEX idx_cal_events_time ON calendar_events(account_id, start_time, end_time);

      -- Contact enrichment
      ALTER TABLE contacts ADD COLUMN first_contacted_at INTEGER;

      -- Attachment cache tracking
      ALTER TABLE attachments ADD COLUMN cached_at INTEGER;
      ALTER TABLE attachments ADD COLUMN cache_size INTEGER;

      -- New settings
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('ai_enabled', 'true'),
        ('ai_auto_categorize', 'true'),
        ('ai_auto_summarize', 'true'),
        ('contact_sidebar_visible', 'true'),
        ('attachment_cache_max_mb', '500'),
        ('calendar_enabled', 'false');
    `,
  },
  {
    version: 6,
    description: "Follow-up reminders, smart notifications, unsubscribe manager, newsletter bundling",
    sql: `
      -- Follow-up reminders (Feature 1)
      CREATE TABLE IF NOT EXISTS follow_up_reminders (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        remind_at INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX idx_followup_status ON follow_up_reminders(status, remind_at);
      CREATE INDEX idx_followup_thread ON follow_up_reminders(account_id, thread_id);

      -- VIP notification senders (Feature 2)
      CREATE TABLE IF NOT EXISTS notification_vips (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        email_address TEXT NOT NULL,
        display_name TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, email_address)
      );
      CREATE INDEX idx_notification_vips ON notification_vips(account_id, email_address);

      -- Unsubscribe tracking (Feature 3)
      CREATE TABLE IF NOT EXISTS unsubscribe_actions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL,
        from_address TEXT NOT NULL,
        from_name TEXT,
        method TEXT NOT NULL,
        unsubscribe_url TEXT NOT NULL,
        status TEXT DEFAULT 'subscribed',
        unsubscribed_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, from_address)
      );
      CREATE INDEX idx_unsub_account ON unsubscribe_actions(account_id, status);

      -- Bundle rules (Feature 4)
      CREATE TABLE IF NOT EXISTS bundle_rules (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        is_bundled INTEGER DEFAULT 1,
        delivery_enabled INTEGER DEFAULT 0,
        delivery_schedule TEXT,
        last_delivered_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, category)
      );
      CREATE INDEX idx_bundle_rules_account ON bundle_rules(account_id);

      -- Held threads for delivery schedules (Feature 4)
      CREATE TABLE IF NOT EXISTS bundled_threads (
        account_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        category TEXT NOT NULL,
        held_until INTEGER,
        PRIMARY KEY (account_id, thread_id),
        FOREIGN KEY (account_id, thread_id) REFERENCES threads(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX idx_bundled_held ON bundled_threads(held_until);

      -- List-Unsubscribe-Post header (Feature 3)
      ALTER TABLE messages ADD COLUMN list_unsubscribe_post TEXT;

      -- New settings
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('smart_notifications', 'true'),
        ('notify_categories', 'Primary'),
        ('auto_archive_after_unsubscribe', 'true');
    `,
  },
  {
    version: 7,
    description: "Send-as aliases",
    sql: `
      CREATE TABLE IF NOT EXISTS send_as_aliases (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        display_name TEXT,
        reply_to_address TEXT,
        signature_id TEXT,
        is_primary INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        treat_as_alias INTEGER DEFAULT 1,
        verification_status TEXT DEFAULT 'accepted',
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, email)
      );
      CREATE INDEX idx_send_as_account ON send_as_aliases(account_id);
    `,
  },
  {
    version: 8,
    description: "Smart folders",
    sql: `
      CREATE TABLE IF NOT EXISTS smart_folders (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        icon TEXT DEFAULT 'Search',
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_smart_folders_account ON smart_folders(account_id);

      INSERT INTO smart_folders (id, account_id, name, query, icon, sort_order, is_default) VALUES
        ('sf-unread', NULL, 'Unread', 'is:unread', 'MailOpen', 0, 1),
        ('sf-attachments', NULL, 'Has Attachments', 'has:attachment', 'Paperclip', 1, 1),
        ('sf-starred-recent', NULL, 'Starred This Week', 'is:starred after:__LAST_7_DAYS__', 'Star', 2, 1);
    `,
  },
  {
    version: 9,
    description: "Email authentication results",
    sql: `ALTER TABLE messages ADD COLUMN auth_results TEXT;`,
  },
  {
    version: 10,
    description: "Mute thread support",
    sql: `
      ALTER TABLE threads ADD COLUMN is_muted INTEGER DEFAULT 0;
      CREATE INDEX idx_threads_muted ON threads(account_id, is_muted);
    `,
  },
  {
    version: 11,
    description: "Phishing detection cache and allowlist",
    sql: `
      CREATE TABLE IF NOT EXISTS link_scan_results (
        message_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        result_json TEXT NOT NULL,
        scanned_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (account_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS phishing_allowlist (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        sender_address TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, sender_address)
      );

      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('phishing_detection_enabled', 'true'),
        ('phishing_sensitivity', 'default');
    `,
  },
  {
    version: 12,
    description: "Quick steps",
    sql: `
      CREATE TABLE IF NOT EXISTS quick_steps (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        shortcut TEXT,
        actions_json TEXT NOT NULL,
        icon TEXT,
        is_enabled INTEGER DEFAULT 1,
        continue_on_error INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX idx_quick_steps_account ON quick_steps(account_id);
    `,
  },
  {
    version: 13,
    description: "Contact notes",
    sql: `ALTER TABLE contacts ADD COLUMN notes TEXT;`,
  },
  {
    version: 14,
    description: "IMAP/SMTP provider support",
    sql: `
      -- Accounts: provider and connection settings
      ALTER TABLE accounts ADD COLUMN provider TEXT DEFAULT 'gmail_api';
      ALTER TABLE accounts ADD COLUMN imap_host TEXT;
      ALTER TABLE accounts ADD COLUMN imap_port INTEGER;
      ALTER TABLE accounts ADD COLUMN imap_security TEXT;
      ALTER TABLE accounts ADD COLUMN smtp_host TEXT;
      ALTER TABLE accounts ADD COLUMN smtp_port INTEGER;
      ALTER TABLE accounts ADD COLUMN smtp_security TEXT;
      ALTER TABLE accounts ADD COLUMN auth_method TEXT DEFAULT 'oauth';
      ALTER TABLE accounts ADD COLUMN imap_password TEXT;

      -- Messages: RFC 2822 threading headers and IMAP identifiers
      ALTER TABLE messages ADD COLUMN message_id_header TEXT;
      ALTER TABLE messages ADD COLUMN references_header TEXT;
      ALTER TABLE messages ADD COLUMN in_reply_to_header TEXT;
      ALTER TABLE messages ADD COLUMN imap_uid INTEGER;
      ALTER TABLE messages ADD COLUMN imap_folder TEXT;

      -- Labels: IMAP folder mapping
      ALTER TABLE labels ADD COLUMN imap_folder_path TEXT;
      ALTER TABLE labels ADD COLUMN imap_special_use TEXT;

      -- Attachments: IMAP MIME part identifier
      ALTER TABLE attachments ADD COLUMN imap_part_id TEXT;

      -- Folder sync state for IMAP accounts
      CREATE TABLE IF NOT EXISTS folder_sync_state (
        account_id TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        uidvalidity INTEGER,
        last_uid INTEGER DEFAULT 0,
        modseq INTEGER,
        last_sync_at INTEGER,
        PRIMARY KEY (account_id, folder_path),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      -- Indexes for IMAP message lookups
      CREATE INDEX IF NOT EXISTS idx_messages_imap_uid ON messages(account_id, imap_folder, imap_uid);
      CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id_header);
    `,
  },
  {
    version: 15,
    description: "OAuth2 provider support for IMAP/SMTP",
    sql: `
      ALTER TABLE accounts ADD COLUMN oauth_provider TEXT;
      ALTER TABLE accounts ADD COLUMN oauth_client_id TEXT;
      ALTER TABLE accounts ADD COLUMN oauth_client_secret TEXT;
    `,
  },
  {
    version: 16,
    description: "Optional IMAP/SMTP username override",
    sql: `ALTER TABLE accounts ADD COLUMN imap_username TEXT;`,
  },
  {
    version: 17,
    description: "Offline mode: pending operations queue and local drafts",
    sql: `
      CREATE TABLE IF NOT EXISTS pending_operations (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        operation_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        params TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 10,
        next_retry_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pending_ops_status ON pending_operations(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_pending_ops_resource ON pending_operations(account_id, resource_id);

      CREATE TABLE IF NOT EXISTS local_drafts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        to_addresses TEXT,
        cc_addresses TEXT,
        bcc_addresses TEXT,
        subject TEXT,
        body_html TEXT,
        reply_to_message_id TEXT,
        thread_id TEXT,
        from_email TEXT,
        signature_id TEXT,
        remote_draft_id TEXT,
        attachments TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        sync_status TEXT DEFAULT 'pending'
      );
    `,
  },
  {
    version: 18,
    description: "AI auto-drafts writing style profiles and task manager",
    sql: `
      -- Writing style profiles for AI auto-drafts
      CREATE TABLE IF NOT EXISTS writing_style_profiles (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        profile_text TEXT NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id)
      );

      -- Tasks
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'none',
        is_completed INTEGER DEFAULT 0,
        completed_at INTEGER,
        due_date INTEGER,
        parent_id TEXT,
        thread_id TEXT,
        thread_account_id TEXT,
        sort_order INTEGER DEFAULT 0,
        recurrence_rule TEXT,
        next_recurrence_at INTEGER,
        tags_json TEXT DEFAULT '[]',
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_account ON tasks(account_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_completed_due ON tasks(is_completed, due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_thread ON tasks(thread_account_id, thread_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order);

      -- Task tags
      CREATE TABLE IF NOT EXISTS task_tags (
        tag TEXT NOT NULL,
        account_id TEXT,
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (tag, account_id)
      );

      -- Default settings for auto-drafts
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('ai_auto_draft_enabled', 'true'),
        ('ai_writing_style_enabled', 'true');
    `,
  },
  {
    version: 19,
    description: "CalDAV calendar integration",
    sql: `
      -- Multi-calendar support
      CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'google',
        remote_id TEXT NOT NULL,
        display_name TEXT,
        color TEXT,
        is_primary INTEGER DEFAULT 0,
        is_visible INTEGER DEFAULT 1,
        sync_token TEXT,
        ctag TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(account_id, remote_id)
      );
      CREATE INDEX IF NOT EXISTS idx_calendars_account ON calendars(account_id);

      -- Extend calendar_events with multi-calendar and CalDAV fields
      ALTER TABLE calendar_events ADD COLUMN calendar_id TEXT REFERENCES calendars(id) ON DELETE CASCADE;
      ALTER TABLE calendar_events ADD COLUMN remote_event_id TEXT;
      ALTER TABLE calendar_events ADD COLUMN etag TEXT;
      ALTER TABLE calendar_events ADD COLUMN ical_data TEXT;
      ALTER TABLE calendar_events ADD COLUMN uid TEXT;

      CREATE INDEX IF NOT EXISTS idx_cal_events_calendar ON calendar_events(calendar_id);

      -- CalDAV fields on accounts
      ALTER TABLE accounts ADD COLUMN caldav_url TEXT;
      ALTER TABLE accounts ADD COLUMN caldav_username TEXT;
      ALTER TABLE accounts ADD COLUMN caldav_password TEXT;
      ALTER TABLE accounts ADD COLUMN caldav_principal_url TEXT;
      ALTER TABLE accounts ADD COLUMN caldav_home_url TEXT;
      ALTER TABLE accounts ADD COLUMN calendar_provider TEXT;
    `,
  },
  {
    version: 20,
    description: "Fix IMAP attachment part IDs and trigger resync",
    sql: `
      -- Delete IMAP attachment records that have wrong sequential part IDs.
      -- They will be re-created with correct MIME section paths on next sync.
      DELETE FROM attachments
        WHERE account_id IN (SELECT id FROM accounts WHERE provider = 'imap');

      -- Reset IMAP folder sync state so delta sync re-fetches all messages,
      -- which will re-store attachments with correct part IDs.
      DELETE FROM folder_sync_state
        WHERE account_id IN (SELECT id FROM accounts WHERE provider = 'imap');
    `,
  },
  {
    version: 21,
    description: "Force IMAP full resync for corrected attachment part IDs",
    sql: `
      -- Clear history_id so syncManager routes IMAP accounts through
      -- imapInitialSync (which stores attachments per-message) instead of
      -- the delta path that may skip already-known UIDs.
      UPDATE accounts SET history_id = NULL
        WHERE provider = 'imap';

      -- Ensure folder sync state is clear (may have been partially
      -- repopulated if v20 migration's sync failed due to DB lock).
      DELETE FROM folder_sync_state
        WHERE account_id IN (SELECT id FROM accounts WHERE provider = 'imap');

      -- Ensure stale attachment records are gone.
      DELETE FROM attachments
        WHERE account_id IN (SELECT id FROM accounts WHERE provider = 'imap');
    `,
  },
  {
    version: 22,
    description: "Add smart label rules table for AI-powered auto-labeling",
    sql: `
      CREATE TABLE smart_label_rules (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        label_id TEXT NOT NULL,
        ai_description TEXT NOT NULL,
        criteria_json TEXT,
        is_enabled INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX idx_smart_label_rules_account ON smart_label_rules(account_id);
    `,
  },
  {
    version: 23,
    description: "Accept self-signed certificates for IMAP/SMTP",
    sql: `ALTER TABLE accounts ADD COLUMN accept_invalid_certs INTEGER DEFAULT 0;`,
  },
   {
     version: 24,
     description: "Reset contact frequency inflated by Google Contacts sync bug",
     sql: `UPDATE contacts SET frequency = 0;`,
   },
   {
     version: 25,
     description: "Add group_id to signatures for cross-account signature sharing",
     sql: `
       -- Add group_id column.
       -- SQLite does not support "IF NOT EXISTS" for ADD COLUMN,
       -- but this migration runs only once (version check in runner).
       ALTER TABLE signatures ADD COLUMN group_id TEXT;

       -- For existing signatures, set group_id = id (each is its own group/master)
       UPDATE signatures SET group_id = id WHERE group_id IS NULL;

       -- Add index for group lookups
       CREATE INDEX IF NOT EXISTS idx_signatures_group ON signatures(group_id);
     `,
   },
   {
     version: 26,
     description: "Add tombstone table for deleted IMAP UIDs to prevent zombie re-import",
     sql: `
       CREATE TABLE IF NOT EXISTS deleted_imap_uids (
         account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
         folder_path TEXT NOT NULL,
         uid INTEGER NOT NULL,
         deleted_at INTEGER NOT NULL DEFAULT (unixepoch()),
         PRIMARY KEY (account_id, folder_path, uid)
       );
       CREATE INDEX IF NOT EXISTS idx_deleted_imap_uids_account ON deleted_imap_uids(account_id, folder_path);
     `,
   },
   {
     version: 27,
     description: "Remove spurious DRAFT labels from IMAP INBOX threads caused by incorrect \\Draft flag handling",
     sql: `
       DELETE FROM thread_labels
       WHERE label_id = 'DRAFT'
         AND EXISTS (
           SELECT 1 FROM thread_labels tl2
           WHERE tl2.account_id = thread_labels.account_id
             AND tl2.thread_id = thread_labels.thread_id
             AND tl2.label_id = 'INBOX'
         );
     `,
   },
   {
     version: 28,
     description: "Separate SMTP credentials (smtp_username, smtp_password) for accounts that require different outgoing auth",
     sql: `
       ALTER TABLE accounts ADD COLUMN smtp_username TEXT;
       ALTER TABLE accounts ADD COLUMN smtp_password TEXT;
     `,
   },
   {
     version: 29,
     description: "Add direction (incoming/outgoing) and soft-delete (deleted_at) to tasks",
     sql: `
       ALTER TABLE tasks ADD COLUMN direction TEXT NOT NULL DEFAULT 'outgoing';
       ALTER TABLE tasks ADD COLUMN deleted_at INTEGER;
       CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);
       CREATE INDEX IF NOT EXISTS idx_tasks_direction ON tasks(direction);
     `,
   },
   {
     version: 30,
     description: "Add standalone index on tasks(thread_id) for efficient thread-based grouping queries",
     sql: `
       CREATE INDEX IF NOT EXISTS idx_tasks_thread_id ON tasks(thread_id);
     `,
   },
  {
    version: 31,
    description: "Add message_embeddings table for local semantic search (RAG) and initialize embedding settings",
    sql: `
      CREATE TABLE IF NOT EXISTS message_embeddings (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        embedding TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_account ON message_embeddings(account_id);
      CREATE INDEX IF NOT EXISTS idx_embeddings_account_created ON message_embeddings(account_id, created_at);

      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('rag_enabled', 'false'),
        ('embedding_model', 'nomic-embed-text'),
        ('rag_chunk_size', '512'),
        ('rag_batch_size', '10');
    `,
  },
  {
    version: 32,
    description: "Migrate message_embeddings to Base64-encoded binary (3x smaller than JSON), triggering clean re-indexing",
    sql: `
      DROP TABLE IF EXISTS message_embeddings;
      CREATE TABLE IF NOT EXISTS message_embeddings (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        embedding TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_account ON message_embeddings(account_id);
      CREATE INDEX IF NOT EXISTS idx_embeddings_account_created ON message_embeddings(account_id, created_at);
    `,
  },
  {
    version: 33,
    description: "Add urgency/sentiment/heat scores to threads and interaction_history table for sender reputation engine",
    sql: `
      ALTER TABLE threads ADD COLUMN urgency_score REAL DEFAULT 0;
      ALTER TABLE threads ADD COLUMN sentiment_score REAL DEFAULT 0;
      ALTER TABLE threads ADD COLUMN manual_urgency_override INTEGER DEFAULT 0;
      ALTER TABLE threads ADD COLUMN is_heat_extinguished INTEGER DEFAULT 0;

      CREATE TABLE IF NOT EXISTS interaction_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        from_address TEXT NOT NULL,
        action TEXT NOT NULL,
        thread_id TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_interaction_account_from ON interaction_history(account_id, from_address, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_interaction_created ON interaction_history(created_at);

      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('ai_urgency_mute_window_days', '30'),
        ('ai_urgency_mute_threshold', '3'),
        ('ai_urgency_auto_extinguish', 'true');
    `,
  },
  {
    version: 34,
    description: "Add temporal urgency decay settings and RAG priority domains for contextual boosting",
    sql: `
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('ai_urgency_decay_start_days', '20'),
        ('ai_urgency_decay_floor_days', '30'),
        ('rag_priority_domains', '');
    `,
  },
  {
    version: 35,
    description: "Add per-account rag_enabled flag and global behavioral intelligence settings",
    sql: `
      ALTER TABLE accounts ADD COLUMN rag_enabled INTEGER DEFAULT 0;

      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('ai_behavior_enabled', 'true'),
        ('ai_urgency_enabled', 'true');
    `,
  },
  {
    version: 36,
    description: "Fix message_embeddings FK mismatch: reference composite PK (account_id, id) instead of standalone id",
    sql: `
      DROP TABLE IF EXISTS message_embeddings;
      CREATE TABLE IF NOT EXISTS message_embeddings (
        message_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        embedding TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (account_id, message_id),
        FOREIGN KEY (account_id, message_id) REFERENCES messages(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_account ON message_embeddings(account_id);
      CREATE INDEX IF NOT EXISTS idx_embeddings_account_created ON message_embeddings(account_id, created_at);
    `,
  },
  {
    version: 37,
    description: "Add app_icon_style setting for dock/tray icon appearance preference",
    sql: `
      INSERT OR IGNORE INTO settings (key, value) VALUES ('app_icon_style', 'auto');
    `,
  },
  {
    version: 38,
    description: "Migrate message_embeddings from Base64 TEXT to binary BLOB for native Rust vector search; clears existing data to force re-indexing",
    sql: `
      DROP TABLE IF EXISTS message_embeddings;
      CREATE TABLE IF NOT EXISTS message_embeddings (
        message_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        embedding BLOB,
        model TEXT NOT NULL DEFAULT 'nomic-embed-text',
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (account_id, message_id),
        FOREIGN KEY (account_id, message_id) REFERENCES messages(account_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_account ON message_embeddings(account_id);
      CREATE INDEX IF NOT EXISTS idx_embeddings_account_created ON message_embeddings(account_id, created_at);
    `,
  },
  {
    version: 39,
    description: "Fix IMAP attachment part IDs: move from gmail_attachment_id to imap_part_id for rows populated before the column separation was in place",
    sql: `
      UPDATE attachments
      SET imap_part_id = gmail_attachment_id, gmail_attachment_id = NULL
      WHERE imap_part_id IS NULL
        AND gmail_attachment_id IS NOT NULL
        AND message_id LIKE 'imap-%';
    `,
  },
  {
    version: 40,
    description: "Add composite indexes to eliminate full-table-scans in unread-count and label-filter queries",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_threads_account_unread
        ON threads(account_id, is_read);

      CREATE INDEX IF NOT EXISTS idx_thread_labels_thread
        ON thread_labels(account_id, thread_id);

      CREATE INDEX IF NOT EXISTS idx_thread_categories_thread
        ON thread_categories(account_id, thread_id);
    `,
  },
  {
    version: 41,
    description: "Add per-account color, include_in_global flag, sort_order for Spark-style multi-account sidebar; index messages for unified inbox subquery",
    sql: `
      ALTER TABLE accounts ADD COLUMN color TEXT DEFAULT NULL;
      ALTER TABLE accounts ADD COLUMN include_in_global INTEGER DEFAULT 1;
      ALTER TABLE accounts ADD COLUMN sort_order INTEGER DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_messages_thread_account_date
        ON messages (thread_id, account_id, date DESC);
    `,
  },
  {
    version: 42,
    description: "Ensure accounts.color/include_in_global/sort_order columns exist (repair for v41 partial failures)",
    sql: `
      ALTER TABLE accounts ADD COLUMN color TEXT DEFAULT NULL;
      ALTER TABLE accounts ADD COLUMN include_in_global INTEGER DEFAULT 1;
      ALTER TABLE accounts ADD COLUMN sort_order INTEGER DEFAULT 0;
    `,
  },
  {
    version: 43,
    description: "Add display label column to accounts for custom in-app identification (e.g. Work, Personal)",
    sql: `
      ALTER TABLE accounts ADD COLUMN label TEXT DEFAULT NULL;
    `,
  },
  {
    version: 44,
    description: "Add user_label and user_color columns to calendars for per-calendar customization (CalDAV)",
    sql: `
      ALTER TABLE calendars ADD COLUMN user_label TEXT DEFAULT NULL;
      ALTER TABLE calendars ADD COLUMN user_color TEXT DEFAULT NULL;
    `,
  },
  {
    version: 45,
    description: "Add source_message_id, rsvp_status and last_notified_at to calendar_events for email invite tracking",
    sql: `
      ALTER TABLE calendar_events ADD COLUMN source_message_id TEXT DEFAULT NULL;
      ALTER TABLE calendar_events ADD COLUMN rsvp_status TEXT DEFAULT NULL;
      ALTER TABLE calendar_events ADD COLUMN last_notified_at INTEGER DEFAULT NULL;
      CREATE INDEX IF NOT EXISTS idx_calendar_events_message ON calendar_events(source_message_id);
    `,
  },
  {
    version: 46,
    description: "Add is_draft flag to messages table for stable local draft tracking",
    sql: `ALTER TABLE messages ADD COLUMN is_draft INTEGER DEFAULT 0;`,
  },
  {
    version: 47,
    description: "Normalize messages.date to milliseconds (IMAP stored seconds, Gmail stored ms)",
    sql: `UPDATE messages SET date = date * 1000 WHERE date > 0 AND date < 10000000000;`,
  },
  {
    version: 48,
    description: "Add covering index for IMAP duplicate detection query (message_id_header + imap_folder + imap_uid)",
    sql: `CREATE INDEX IF NOT EXISTS idx_messages_dedup
          ON messages(account_id, message_id_header, imap_folder, imap_uid)
          WHERE message_id_header IS NOT NULL AND imap_folder IS NOT NULL AND imap_uid IS NOT NULL;`,
  },
  {
    version: 49,
    description: "Add Calendar Invites default smart folder and pruning setting",
    sql: `INSERT OR IGNORE INTO smart_folders (id, account_id, name, query, icon, sort_order, is_default)
          VALUES ('sf-calendar', NULL, 'Calendar Invites', 'has:calendar after:__LAST_6_MONTHS__', 'CalendarDays', 3, 1);
          INSERT OR IGNORE INTO settings (key, value) VALUES ('calendar_invite_pruning_months', '6');`,
  },
  {
    version: 50,
    description: "Reset keyword-based urgency scores so AI backfill can re-score all threads",
    sql: `UPDATE threads SET urgency_score = 0
          WHERE (manual_urgency_override IS NULL OR manual_urgency_override = 0)
            AND is_muted = 0;
          DELETE FROM ai_cache WHERE type = 'urgency';`,
  },
  {
    version: 51,
    description: "Remove orphaned local draft messages (is_draft=1, imap_uid IS NULL) that were never sent or appended to server",
    sql: `DELETE FROM messages WHERE is_draft = 1 AND imap_uid IS NULL;`,
  },
  {
    version: 52,
    description: "Remove all orphaned local draft messages (is_draft=1) regardless of imap_uid — drafts with a server UID but empty server Drafts folder are also stale",
    sql: `DELETE FROM messages WHERE is_draft = 1;`,
  },
  {
    version: 53,
    description: "Recalculate message_count for all threads excluding drafts to fix stale counts",
    sql: `UPDATE threads
          SET message_count = (
            SELECT COUNT(*) FROM messages
            WHERE account_id = threads.account_id
              AND thread_id = threads.id
              AND is_draft = 0
          );`,
  },
  {
    version: 54,
    description: "Add per-message Gmail label storage (gmail_label_ids) and fast trash flag (is_trashed)",
    sql: `ALTER TABLE messages ADD COLUMN gmail_label_ids TEXT;
          ALTER TABLE messages ADD COLUMN is_trashed INTEGER DEFAULT 0;
          CREATE INDEX IF NOT EXISTS idx_messages_trashed ON messages(account_id, thread_id, is_trashed);
          UPDATE messages SET is_trashed = 1
          WHERE imap_folder IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM labels l
              WHERE l.account_id = messages.account_id
                AND l.imap_folder_path = messages.imap_folder
                AND l.id = 'TRASH'
            );`,
  },
  {
    version: 55,
    description: "Add index to speed up attachment inline/CID filtering",
    sql: `CREATE INDEX IF NOT EXISTS idx_attachments_inline_cid ON attachments(message_id, is_inline, content_id);`,
  },
];

// ---------------------------------------------------------------------------
// Post-migration data repair
// ---------------------------------------------------------------------------

/**
 * Windows-1252 code points that don't exist in Latin-1 (the 0x80–0x9F block).
 * Maps Unicode code point → Windows-1252 byte value.
 */
const WIN1252_EXTRA: Record<number, number> = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
  0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
  0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

function fixMojibake(s: string): string {
  let current = s;
  for (let iter = 0; iter < 3; iter++) {
    const bytes: number[] = [];
    let canMap = true;
    for (const ch of current) {
      const cp = ch.codePointAt(0)!;
      if (cp <= 0xFF) {
        bytes.push(cp);
      } else if (WIN1252_EXTRA[cp] !== undefined) {
        bytes.push(WIN1252_EXTRA[cp]!);
      } else {
        canMap = false;
        break;
      }
    }
    if (!canMap || !bytes.some((b) => b > 0x7F)) break;
    try {
      const fixed = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
      if (fixed !== current) { current = fixed; continue; }
    } catch { /* invalid UTF-8 — stop */ }
    break;
  }
  return current;
}

/**
 * One-shot repair of Windows-1252 mojibake in existing subject/from_name fields.
 * Stored in settings so it only runs once per installation.
 */
export async function repairMojibakeData(): Promise<void> {
  const { getSetting, setSetting } = await import('./settings');
  const already = await getSetting('mojibake_repair_v1');
  if (already === '1') return;

  const db = await getDb();

  // Threads
  const threadRows = await db.select<{ id: string; account_id: string; subject: string }[]>(
    `SELECT id, account_id, subject FROM threads WHERE subject IS NOT NULL AND subject != ''`,
  );
  for (const row of threadRows) {
    const fixed = fixMojibake(row.subject);
    if (fixed !== row.subject) {
      await db.execute(
        `UPDATE threads SET subject = $1 WHERE account_id = $2 AND id = $3`,
        [fixed, row.account_id, row.id],
      );
    }
  }

  // Messages — subject and from_name
  const msgRows = await db.select<{ id: string; account_id: string; subject: string | null; from_name: string | null }[]>(
    `SELECT id, account_id, subject, from_name FROM messages WHERE subject IS NOT NULL OR from_name IS NOT NULL`,
  );
  for (const row of msgRows) {
    const fixedSubject = row.subject ? fixMojibake(row.subject) : null;
    const fixedName = row.from_name ? fixMojibake(row.from_name) : null;
    if (fixedSubject !== row.subject || fixedName !== row.from_name) {
      await db.execute(
        `UPDATE messages SET subject = $1, from_name = $2 WHERE account_id = $3 AND id = $4`,
        [fixedSubject, fixedName, row.account_id, row.id],
      );
    }
  }

  await setSetting('mojibake_repair_v1', '1');
  console.log(`[migrations] mojibake repair done: ${threadRows.length} threads, ${msgRows.length} messages checked`);
}

/**
 * One-shot repair: recalculate has_attachments on all threads excluding inline
 * and CID embedded images. Tracked in settings so it runs only once.
 * Call this fire-and-forget after startup — it must NOT block the splash screen.
 */
export async function repairHasAttachmentsFlags(): Promise<void> {
  const { getSetting, setSetting } = await import('./settings');
  const already = await getSetting('has_attachments_repair_v1');
  if (already === '1') return;

  const db = await getDb();
  await db.execute(
    `UPDATE threads
     SET has_attachments = CASE
       WHEN EXISTS (
         SELECT 1 FROM attachments a
         JOIN messages m ON a.message_id = m.id
         WHERE m.account_id = threads.account_id
           AND m.thread_id = threads.id
           AND m.is_trashed = 0
           AND a.is_inline = 0
           AND a.content_id IS NULL
       ) THEN 1 ELSE 0 END`,
  );
  await setSetting('has_attachments_repair_v1', '1');
  console.log('[migrations] has_attachments repair done');
}

/**
 * Split a SQL string into individual statements, correctly handling
 * BEGIN...END blocks (e.g. inside CREATE TRIGGER) that contain semicolons.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  const upper = sql.toUpperCase();

  for (let i = 0; i < sql.length; i++) {
    // Check for BEGIN keyword at word boundary
    if (
      upper.startsWith("BEGIN", i) &&
      (i === 0 || /\W/.test(sql[i - 1]!)) &&
      (i + 5 >= sql.length || /\W/.test(sql[i + 5]!))
    ) {
      depth++;
    }

    // Check for END keyword at word boundary
    if (
      upper.startsWith("END", i) &&
      (i === 0 || /\W/.test(sql[i - 1]!)) &&
      (i + 3 >= sql.length || /\W/.test(sql[i + 3]!)) &&
      depth > 0
    ) {
      depth--;
    }

    if (sql[i] === ";" && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
    } else {
      current += sql[i];
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);

  return statements;
}

let _migrationPromise: Promise<void> | null = null;

export function runMigrations(): Promise<void> {
  if (!_migrationPromise) {
    _migrationPromise = _runMigrations();
  }
  return _migrationPromise;
}

async function _runMigrations(): Promise<void> {
  const db = await getDb();

  // Ensure migrations table exists
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Get already-applied versions
  const applied = await db.select<{ version: number }[]>(
    "SELECT version FROM _migrations ORDER BY version",
  );
  const appliedVersions = new Set(applied.map((r) => r.version));

  // Repair: if migration 14 is marked applied but imap_folder_path column is missing
  // from labels (schema change failed to persist), force re-run from v14.
  if (appliedVersions.has(14)) {
    const cols = await db.select<{ name: string }[]>(
      "SELECT name FROM pragma_table_info('labels') WHERE name = 'imap_folder_path'",
    );
    if (cols.length === 0) {
      console.warn("Migration v14 marked applied but imap_folder_path column missing — re-running from v14");
      await db.execute("DELETE FROM _migrations WHERE version >= 14");
      for (const v of [...appliedVersions].filter((v) => v >= 14)) appliedVersions.delete(v);
    }
  }

  // Repair: if migration 18 is marked applied but tasks table is missing,
  // remove the stale record so it re-runs
  if (appliedVersions.has(18)) {
    const tables = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'",
    );
    if (tables.length === 0) {
      console.warn("Migration v18 marked applied but tasks table missing — re-running");
      await db.execute("DELETE FROM _migrations WHERE version = 18");
      appliedVersions.delete(18);
    }
  }

  // Repair: if migration 25 is marked applied but group_id column is missing
  // from signatures, force re-run v25.
  if (appliedVersions.has(25)) {
    const cols = await db.select<{ name: string }[]>(
      "SELECT name FROM pragma_table_info('signatures') WHERE name = 'group_id'",
    );
    if (cols.length === 0) {
      console.warn("Migration v25 marked applied but group_id column missing — re-running v25");
      await db.execute("DELETE FROM _migrations WHERE version = 25");
      appliedVersions.delete(25);
    }
  }

  // Repair: if migration 26 is marked applied but deleted_imap_uids table is missing,
  // force re-run v26 (can happen when HMR deploys code before app restart runs migrations).
  if (appliedVersions.has(26)) {
    const tables = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='deleted_imap_uids'",
    );
    if (tables.length === 0) {
      console.warn("Migration v26 marked applied but deleted_imap_uids table missing — re-running v26");
      await db.execute("DELETE FROM _migrations WHERE version = 26");
      appliedVersions.delete(26);
    }
  }

  // Repair: if migration 38 is marked applied but message_embeddings.embedding still has
  // NOT NULL (meaning the DROP+CREATE in v38 did not fully persist), force re-run v38.
  if (appliedVersions.has(38)) {
    const cols = await db.select<{ notnull: number }[]>(
      `SELECT "notnull" FROM pragma_table_info('message_embeddings') WHERE name = 'embedding'`,
    );
    if (cols.length === 0 || cols[0]?.notnull === 1) {
      console.warn("Migration v38 marked applied but message_embeddings.embedding is NOT NULL — re-running v38");
      await db.execute("DELETE FROM _migrations WHERE version = 38");
      appliedVersions.delete(38);
    }
  }

  // Repair: if migration 41 is marked applied but color column is missing from accounts
  // (can happen when the multi-statement ALTER TABLE block only partially persisted)
  if (appliedVersions.has(41)) {
    const cols = await db.select<{ name: string }[]>(
      "SELECT name FROM pragma_table_info('accounts') WHERE name = 'color'",
    );
    if (cols.length === 0) {
      console.warn("Migration v41 marked applied but accounts.color column missing — re-running v41");
      await db.execute("DELETE FROM _migrations WHERE version = 41");
      appliedVersions.delete(41);
    }
  }

  // Pre-apply v42 without DDL if the color column already exists.
  // v42 re-runs the same ALTER TABLE ADD COLUMN statements as v41. Running them
  // inside BEGIN acquires a write lock even when they fail with "duplicate column",
  // blocking other connections for the full busy-timeout. Detecting up-front avoids
  // the lock entirely for users who already have the columns.
  if (!appliedVersions.has(42)) {
    const colorCols = await db.select<{ name: string }[]>(
      "SELECT name FROM pragma_table_info('accounts') WHERE name = 'color'",
    );
    if (colorCols.length > 0) {
      await db.execute(
        "INSERT OR IGNORE INTO _migrations (version, description) VALUES ($1, $2)",
        [42, "Ensure accounts.color/include_in_global/sort_order columns exist (repair for v41 partial failures)"],
      );
      appliedVersions.add(42);
    }
  }

  // Run pending migrations
  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    console.log(
      `Running migration v${migration.version}: ${migration.description}`,
    );

    // Split SQL into individual statements, respecting BEGIN...END blocks
    const statements = splitStatements(migration.sql);

    // Use a transaction so migrations are all-or-nothing
    await db.execute("BEGIN");
    try {
      for (const statement of statements) {
        try {
          await db.execute(statement);
        } catch (err) {
          // Tolerate "duplicate column" errors from ALTER TABLE ADD COLUMN
          // in case a migration was partially applied previously
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("duplicate column")) {
            console.warn(`Skipping duplicate column in v${migration.version}: ${msg}`);
          } else {
            throw err;
          }
        }
      }

      await db.execute(
        "INSERT OR IGNORE INTO _migrations (version, description) VALUES ($1, $2)",
        [migration.version, migration.description],
      );
      await db.execute("COMMIT");
    } catch (err) {
      await db.execute("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  console.log("All migrations applied.");

  // One-time repair: fix IMAP messages stored with date=0 (Unix epoch / January 1970).
  // Root cause: mail-parser's to_timestamp() returned 0 for malformed Date headers and
  // the internal_date fallback was not applied because Some(0) is not None.
  // Fix: delete affected messages, roll back last_uid in folder_sync_state so the next
  // delta sync re-fetches only the broken UIDs with the corrected parsing logic.
  const dateRepairFlag = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'imap_date_repair_v1'",
  );
  if (dateRepairFlag.length === 0) {
    const broken = await db.select<{ id: string; account_id: string }[]>(
      "SELECT id, account_id FROM messages WHERE date = 0 AND id LIKE 'imap-%'",
    );
    if (broken.length > 0) {
      console.log(`[repair] Found ${broken.length} IMAP messages with date=0 — fixing...`);

      // Group by (account_id, folder), track minimum UID per folder so we can
      // roll back last_uid just enough to re-fetch only the affected messages.
      const folderMinUid = new Map<string, { accountId: string; folder: string; minUid: number }>();
      for (const msg of broken) {
        // id format: "imap-{account_id}-{folder}-{uid}"
        // account_id is known from the row — strip prefix + account_id to isolate "{folder}-{uid}"
        const prefix = `imap-${msg.account_id}-`;
        const rest = msg.id.slice(prefix.length);
        const lastDash = rest.lastIndexOf("-");
        if (lastDash < 0) continue;
        const folder = rest.slice(0, lastDash);
        const uid = parseInt(rest.slice(lastDash + 1), 10);
        if (isNaN(uid)) continue;

        const key = `${msg.account_id}::${folder}`;
        const existing = folderMinUid.get(key);
        if (!existing || uid < existing.minUid) {
          folderMinUid.set(key, { accountId: msg.account_id, folder, minUid: uid });
        }
      }

      // Roll back last_uid so delta sync re-fetches from just before the first broken UID.
      for (const { accountId, folder, minUid } of folderMinUid.values()) {
        await db.execute(
          "UPDATE folder_sync_state SET last_uid = $1 WHERE account_id = $2 AND folder_path = $3",
          [Math.max(0, minUid - 1), accountId, folder],
        );
      }

      // Delete broken messages and orphaned threads.
      await db.execute("DELETE FROM messages WHERE date = 0 AND id LIKE 'imap-%'");
      await db.execute(`
        DELETE FROM threads
        WHERE (account_id, id) NOT IN (SELECT account_id, thread_id FROM messages)
        AND account_id IN (SELECT id FROM accounts WHERE provider = 'imap')
      `);

      // Record the affected account IDs so App.tsx can trigger an explicit sync
      // immediately after startup (before the 60s background timer fires).
      const affectedAccountIds = [...new Set(broken.map((m) => m.account_id))];
      await db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('imap_date_repair_v1_pending_sync', $1)",
        [JSON.stringify(affectedAccountIds)],
      );

      console.log("[repair] IMAP date repair complete — affected folders will be re-synced.");
    }
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('imap_date_repair_v1', '1')",
    );
  }

  // One-time repair: force IMAP attachment resync with corrected Rust binary.
  // Migrations 20/21 may have run before the Rust fix was compiled in.
  // This uses a settings flag so it only runs once.
  const repairFlag = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'imap_attachment_repair_v1'",
  );
  if (repairFlag.length === 0) {
    const imapAccounts = await db.select<{ id: string }[]>(
      "SELECT id FROM accounts WHERE provider = 'imap'",
    );
    if (imapAccounts.length > 0) {
      console.log("[repair] Forcing IMAP attachment resync with corrected part IDs...");
      await db.execute(
        "DELETE FROM attachments WHERE account_id IN (SELECT id FROM accounts WHERE provider = 'imap')",
      );
      await db.execute(
        "DELETE FROM folder_sync_state WHERE account_id IN (SELECT id FROM accounts WHERE provider = 'imap')",
      );
      await db.execute(
        "UPDATE accounts SET history_id = NULL WHERE provider = 'imap'",
      );
    }
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('imap_attachment_repair_v1', '1')",
    );
  }
}
