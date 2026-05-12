
**Table of Contents**  

Executive Summary	

Current State Analysis	2
2.1 Fork Divergence	2
2.2 Open Pull Requests Summary	2
2.3 Open Issues Summary	2
Tier 1: Immediate Bug Fixes (Merge First)	3
3.1 PR #206: Repair Migration 14	3
3.2 PR #219: UTC Fix for iCal All-Day Events	4
3.3 PR #230: Enable Link Clicks in Email Iframe (macOS)	5
3.4 PR #201: Allow Remote Images When Block Setting Is Disabled	6
3.5 PR #259: Allow Non-Default Ports in Tauri HTTP Scope	7
3.6 PR #203: Allow Native Text-Editing Shortcuts	8
Tier 2: Security and Reliability (Merge After Tier 1)	9
4.1 PR #245: Security Hardening	9
4.2 PR #261: Ollama Connection Permissions and AI Language Setting	10
4.3 PR #255: Separate SMTP Credentials	11
4.4 PR #262: IMAP Reliability and Database Performance	12
Tier 3: Quality of Life Improvements	14
5.1 PR #242: Custom OpenAI-Compatible AI Provider	14
5.2 PR #248: Gmail Setup UX Improvement	15
Tier 4: Deferred Items and Items Needing Review	16
6.1 PR #249 and #202: i18n Implementations (CONFLICT)	17
6.2 Issue #257: Outlook 365 and Exchange Support	17
6.3 Issue #232: Linux Performance Problems	17
6.4 Issue #233: Flatpak Release Malformed	17
6.5 Issue #243: Inbox Count and Unread Badges	18
Dependency Updates	18
Execution Timeline	18
8.1 Phase 1: Critical Bug Fixes (Week 1)	19
8.2 Phase 2: Security and SMTP Fix (Week 2)	19
8.3 Phase 3: IMAP Reliability (Week 3)	19
8.4 Phase 4: Quality of Life and Cleanup (Week 4)	20
Risk Mitigation	20
9.1 Merge Conflict Resolution Strategy	20
9.2 Regression Prevention	20
9.3 Branch Strategy	21
Known Gaps and Post-Stabilization Priorities	21
10.1 SSL Certificate Configuration	21
10.2 Rust Build Toolchain	21
10.3 Export Scheduler Wiring	22
10.4 CI/CD Pipeline	22

# **1. Executive Summary**

This document presents a comprehensive stabilization plan for the Velo email client project (Zakarialabib/velo), a Tauri v2 desktop application built with Rust, React 19, and SQLite. The plan focuses exclusively on merging community pull requests and resolving open issues from the upstream repository (avihaymenahem/velo) to stabilize the application rather than introducing new features. The Velo fork is currently 35 commits ahead of upstream, containing significant feature work including i18n, contact intelligence, campaigns, workflow engine, PGP, attachment vault, advanced filters, and quick replies. However, the upstream repository has accumulated 26 open pull requests and 9 open issues containing critical bug fixes, security hardening, and reliability improvements that must be integrated before the app can be considered production-stable.

The plan is organized into four merge tiers based on risk, impact, and dependency analysis. Tier 1 contains low-risk, high-impact bug fixes that should be merged immediately with minimal conflict. Tier 2 addresses security and reliability concerns that are essential for any production deployment. Tier 3 covers quality-of-life improvements that enhance usability without introducing architectural changes. Tier 4 identifies complex PRs that require careful review or architectural decisions before merging. Each PR is analyzed for mergeability, conflict potential with the fork's feature work, and specific integration steps.

Additionally, the plan catalogs all open issues, identifies which ones are already addressed by existing PRs, and proposes solutions for issues that lack community contributions. A detailed execution timeline with dependency ordering ensures that merges happen in the correct sequence, minimizing integration conflicts and regression risk.

# **2. Current State Analysis**

## **2.1 Fork Divergence**

The Zakarialabib/velo fork is 35 commits ahead of the upstream avihaymenahem/velo repository. All upstream PRs have zero merged PRs, meaning the community contributions remain entirely unmerged. The fork's additional commits include ten major feature phases (P1 through P10) covering PGP decryption, compliance engine, advanced templates, attachment vault, backup/export, vault integration, polish fixes, advanced filter engine, filter engine UI, and quick reply templates. These features are structurally complete with 142 test files (84 TypeScript + 7 Rust) passing, though some known gaps remain in the Rust build toolchain and SSL configuration.

The divergence creates a significant challenge: community PRs were authored against the upstream main branch, which lacks the fork's 34+ database migrations, new service layers, and extended UI components. This means many PRs will encounter merge conflicts in shared files such as AddImapAccount.tsx, the Tauri capabilities configuration, the database migrations file, and the keyboard shortcuts handler. Careful conflict resolution is required to preserve both the community fixes and the fork's feature additions.

## **2.2 Open Pull Requests Summary**

There are currently 26 open pull requests in the upstream repository. After filtering out dependabot dependency bumps (11 PRs) and release automation PRs (2 PRs), 13 substantive PRs remain that address bugs, security, or feature improvements relevant to stabilization. The following table summarizes the key PRs, excluding dependency updates which should be handled separately through a dedicated dependency upgrade pass.

     
|**PR #**|**Title**|**Author**|**Files**|**Mergeable**|**Risk**|
|---|---|---|---|---|---|
|#262|IMAP reliability and DB perf|M4lmostoso|172|Clean|HIGH (size)|
|#261|Ollama connection + AI language|M4lmostoso|5|Clean|LOW|
|#259|Non-default ports in HTTP scope|DirkScharff|1|Clean|LOW|
|#255|Separate SMTP credentials|SaschaOnTour|8|Clean|MEDIUM|
|#249|Japanese localization|atani|101|Clean|HIGH (conflict)|
|#248|Gmail setup UX improvement|atani|99|Clean|HIGH (conflict)|
|#245|Security hardening|atani|10|Clean|MEDIUM|
|#242|Custom OpenAI-compatible provider|wynn5a|16|Clean|MEDIUM|
|#230|Enable iframe link clicks (macOS)|edvintb|2|Clean|LOW|
|#219|UTC fix for iCal all-day events|edvintb|1|Clean|LOW|
|#206|Repair migration 14|guysoft|2|Clean|LOW|
|#203|Native text-editing shortcuts|knabe|1|Clean|LOW|
|#202|i18n support (EN/IT)|f-liva|108|Clean|HIGH (conflict)|
|#201|Remote images CSP fix|f-liva|1|Clean|LOW|

## **2.3 Open Issues Summary**

There are 9 open issues in the upstream repository, covering critical bugs, performance problems, and feature requests. Several of these issues already have corresponding PRs that address them, while others require new work. The issues range from data-loss-level bugs (passwords with quotes breaking sync) to platform-specific performance problems (Linux CPU usage) to enterprise feature requests (Outlook 365/Exchange support).

    
|**Issue #**|**Title**|**Type**|**Has PR?**|**Severity**|
|---|---|---|---|---|
|#257|Outlook 365 & shared mailbox support|Enhancement|No|Low (future)|
|#256|Password with quote breaks sync|Bug|No (partial #262)|Critical|
|#253|Separate SMTP credentials|Enhancement|Yes (#255)|Medium|
|#252|SMTP password silently discarded|Bug|Yes (#255)|Critical|
|#243|Inbox count / unread badges|Enhancement|No|Medium|
|#241|Sync fails with IMAP Shared Folders|Bug|Partial (#262)|High|
|#240|SQLite BUSY errors during sync|Bug|Yes (#262)|Critical|
|#233|Flatpak release malformed|Bug|No|Medium|
|#232|Linux performance very slow|Bug|Partial (#246 closed)|High|

# **3. Tier 1: Immediate Bug Fixes (Merge First)**

These PRs address user-facing bugs with minimal code changes, no architectural impact, and low conflict risk with the fork's feature work. They should be merged in the order listed, with each merge followed by a test run to verify no regressions.

## **3.1 PR #206: Repair Migration 14**

**Issue:** #205 | Files: 2 | Additions: 147 | Risk: LOW

When migration 14 (IMAP/SMTP provider support) is recorded in the _migrations table but its schema changes did not actually persist (a known edge case during crashes or interrupted startups), the app fails with the error 'table labels has no column named imap_folder_path'. This makes the app completely unusable for all account types, including Gmail API accounts. The PR adds a repair check following the existing pattern used for migration 18 that detects the inconsistency and re-runs migrations 14 and all subsequent migrations on the next startup. This is a critical fix because it prevents a total app-breakage scenario for users who experience interrupted migrations.

**Integration Steps:**

- Cherry-pick the commit onto the fork's main branch
    
- The fork has additional migrations up to v34; verify the repair logic covers v14 through v34
    
- Add a test case for the repair path in migrations.test.ts
    
- Run full test suite to verify migration ordering is preserved
    

## **3.2 PR #219: UTC Fix for iCal All-Day Events**

Files: 1 | Additions: 3 | Deletions: 3 | Risk: LOW

The formatDateOnly() function in icalHelper.ts used local time methods (getDate, getMonth, getFullYear) instead of UTC methods, causing all-day CalDAV events to appear off by one day in negative UTC offset timezones (e.g., EST/PST users would see events on the wrong date). This is a straightforward fix that simply switches to getUTCFullYear(), getUTCMonth(), and getUTCDate(). The existing test suite already validates this fix (30/30 tests pass). The change touches exactly one file with three method calls swapped, making it one of the safest merges in this plan.

**Integration Steps:**

- Cherry-pick the single commit
    
- Verify icalHelper.test.ts passes (30 tests)
    
- No conflict expected with fork's feature work
    

## **3.3 PR #230: Enable Link Clicks in Email Iframe (macOS)**

Files: 2 | Additions: 4 | Deletions: 4 | Risk: LOW

On macOS, the email content iframe uses a sandbox attribute that omits 'allow-scripts', which prevents link click handlers from working in WebKit. Users on macOS cannot click any links in email bodies. The fix adds 'allow-scripts' to the sandbox attribute, which is safe because DOMPurify already strips all script tags and event handler attributes from email HTML before rendering, so no email JavaScript can execute. This is a two-file change with minimal surface area and no security regression, as the DOMPurify sanitization layer remains the primary defense.

**Integration Steps:**

- Cherry-pick the commit
    
- Verify the sandbox attribute in EmailRenderer.tsx or equivalent component
    
- Test on macOS or WebKit-based browser to confirm link clicks work
    
- Verify DOMPurify still strips script tags (existing tests cover this)
    

## **3.4 PR #201: Allow Remote Images When Block Setting Is Disabled**

Files: 1 | Additions: 1 | Deletions: 1 | Risk: LOW

The Content Security Policy img-src directive only whitelisted 'self', data:, Gravatar, and Google domains. Since email HTML is rendered in an iframe that inherits the parent's CSP, all other remote image requests were blocked at the browser level, regardless of the application's 'Block Remote Images' setting. When a user disabled image blocking, images still would not load because the CSP prevented the fetch entirely. The fix adds 'https:' and 'http:' to the img-src CSP policy so the browser can actually fetch remote images when the application-level setting permits it. This is a single-line change in the CSP configuration.

**Integration Steps:**

- Cherry-pick the single commit
    
- Locate the CSP configuration in the fork (may be in index.html or tauri.conf.json)
    
- Verify the img-src directive includes https: and http: alongside existing entries
    
- Test with an email containing remote images; toggle the block setting to confirm both behaviors
    

## **3.5 PR #259: Allow Non-Default Ports in Tauri HTTP Scope**

Files: 1 | Additions: 2 | Deletions: 2 | Risk: LOW

The Tauri HTTP plugin capability scope used URL patterns like 'http://*/*' and 'https://*/*', which according to the URL Pattern spec only match the default ports (80 for HTTP, 443 for HTTPS). This prevented connections to local AI servers running on non-default ports such as LM Studio on port 1234 or Ollama on port 11434. The fix replaces the patterns with 'http://*:*' and 'https://*:*' which correctly match any port. This is a two-line change in the Tauri capabilities file that enables the local AI feature to work with standard self-hosted model servers.

**Integration Steps:**

- Cherry-pick the commit
    
- Locate the fork's capabilities/default.json and apply the same pattern change
    
- Test by configuring Ollama on port 11434 and verifying the AI connection succeeds
    

## **3.6 PR #203: Allow Native Text-Editing Shortcuts**

Files: 1 | Additions: 4 | Deletions: 1 | Risk: LOW

Ctrl/Cmd+A (select all) was intercepted by the app's keyboard shortcut handler even when an input or textarea was focused, preventing native text selection in the search box, address fields, and other text inputs. The fix adds an input focus check before processing Ctrl/Cmd shortcuts for A, C, X, V, and Z, letting the browser handle them natively when a text input is active. This is a small, targeted fix in useKeyboardShortcuts.ts that improves the text editing experience across the entire application.

**Integration Steps:**

- Cherry-pick the commit
    
- The fork's useKeyboardShortcuts.ts may have additional shortcuts; verify the focus check is placed before all Ctrl/Cmd single-key shortcuts
    
- Test: click in search box, press Ctrl+A, verify text selection works
    
- Test: press 'j' key outside input, verify thread navigation still works
    

# **4. Tier 2: Security and Reliability (Merge After Tier 1)**

These PRs address security vulnerabilities and reliability issues that are essential for production deployment. They carry slightly more risk due to larger change sets or deeper architectural involvement, but all have clean merge status and are well-tested by their authors.

## **4.1 PR #245: Security Hardening**

Files: 10 | Additions: 340 | Deletions: 60 | Risk: MEDIUM

This PR from a security audit addresses seven targeted vulnerabilities across the application. The fixes are minimal and focused, preserving existing functionality while closing attack surfaces. The seven areas addressed are: SSRF prevention via isSafeUrl() guard on List-Unsubscribe URLs (blocking loopback, private networks, and link-local addresses), SQL injection prevention through parameterized queries in previously vulnerable dynamic query builders, crypto hardening by replacing weak random number generation with crypto.randomUUID() or crypto.getRandomValues(), HTTP capability scope tightening to prevent unauthorized network access, input validation improvements on user-supplied configuration fields, CSP improvements to reduce XSS surface area, and error message sanitization to prevent information leakage in production.

**Integration Steps:**

- Cherry-pick the commit onto the fork
    
- Review each of the 7 changes independently; the fork may already address some (e.g., the fork uses crypto.randomUUID() for primary keys)
    
- Run the full test suite (142 files) to verify no regressions
    
- Pay special attention to the SQL parameterization changes, as the fork has additional DB service files
    
- The isSafeUrl() guard should be applied to the fork's unsubscribeManager.ts
    

## **4.2 PR #261: Ollama Connection Permissions and AI Language Setting**

Files: 5 | Additions: 69 | Deletions: 10 | Risk: LOW

This PR fixes two issues with the local AI (Ollama/LM Studio) integration. First, it corrects the Tauri HTTP plugin permissions to allow connections to Ollama running on localhost with non-standard ports. Second, it adds an AI language setting so users can configure the language in which AI features generate responses, which is particularly important for non-English users who want AI-composed emails and summaries in their native language. The fork already has an Ollama provider (src/services/ai/providers/ollamaProvider.ts), so this fix directly benefits the fork's existing AI infrastructure.

**Integration Steps:**

- Cherry-pick the commit
    
- Verify the Ollama provider in the fork benefits from the permission fix
    
- The AI language setting needs to be wired into the fork's i18n system (uiStore.locale)
    
- Add the language field to the AI provider settings UI in SettingsPage.tsx
    

## **4.3 PR #255: Separate SMTP Credentials**

Issues: #252, #253 | Files: 8 | Additions: 1503 | Deletions: 63 | Risk: MEDIUM

This PR addresses two critical issues. Issue #252 reports that when adding an IMAP/SMTP account with a separate SMTP password, the password is correctly used for the connection test during setup but never saved to the database, so all subsequent SMTP operations silently use the IMAP password instead. The root cause is in AddImapAccount.tsx line 387 where 'password: form.samePassword ? form.password : form.password' returns the IMAP password in both branches of the ternary. Issue #253 requests the ability to configure completely separate credentials for SMTP, which is essential for relay services (Mailgun, SendGrid), corporate setups with different IMAP/SMTP authentication servers, and separate app passwords per protocol.

The PR adds smtp_username and smtp_password columns to the accounts table (new migration), fixes the SMTP password persistence bug, adds separate credential fields in the account setup UI, and updates the IMAP config builder to use the separate credentials when configured. With 1503 additions across 8 files, this is a substantial change that requires careful integration with the fork's extended account management code.

**Integration Steps:**

- Cherry-pick the commits onto the fork
    
- The fork has additional migrations (up to v34); add the SMTP credentials migration as v35
    
- Resolve conflicts in AddImapAccount.tsx (the fork may have extended this component)
    
- Update imapConfigBuilder.ts to use smtp_username and smtp_password
    
- Update the Rust SMTP client to accept separate credentials
    
- Test: create account with separate SMTP credentials, verify both test connection and actual send work
    
- Test: verify existing accounts with shared credentials still work
    

## **4.4 PR #262: IMAP Reliability and Database Performance**

Issues: #240, #241, #256, #192, #186 | Files: 172 | Additions: 13123 | Deletions: 3225 | Risk: HIGH

This is the largest and most impactful PR in the backlog, addressing multiple critical issues that make the app unusable for IMAP users. It is also the riskiest to merge due to its size (172 files, 13,123 additions). The PR addresses four major problem areas. First, IMAP reliability for DavMail and Exchange servers, introducing a robust fallback mechanism for cases where IMAP servers return successful fetch responses with unparseable or empty bodies, which commonly occurs with DavMail and certain Microsoft Exchange configurations. Second, SQLite BUSY error resolution (Issue #240), which is the root cause of the database is locked errors that make IMAP sync unusable. The fix addresses concurrent database access patterns outside the withTransaction mutex. Third, shared folder handling (Issue #241), fixing sync failures with IMAP servers that expose shared or non-selectable folders like Stalwart mail server's Groups feature. Fourth, password quoting (Issue #256), fixing sync breakage when passwords contain special characters like quotes.

Due to the PR's size and the fork's divergence, a direct merge is not recommended. Instead, the PR should be deconstructed into logical commits and each applied individually with conflict resolution.

**Integration Strategy:**

- Step 1: Clone the PR branch and identify logical commit groups (IMAP fallback, DB locking, shared folders, password quoting)
    
- Step 2: Apply the SQLite BUSY fix first (highest impact, likely in connection.ts and imapSync.ts)
    
- Step 3: Apply the shared folder handling fix (likely in folderMapper.ts and imapSync.ts)
    
- Step 4: Apply the DavMail/Exchange fallback fix (likely in the Rust IMAP client)
    
- Step 5: Apply the password quoting fix (likely in imapConfigBuilder.ts and the Rust SMTP client)
    
- Step 6: After each group, run the full test suite and manually test IMAP sync
    
- Step 7: Review the remaining 99 commits for additional improvements relevant to the fork
    

# **5. Tier 3: Quality of Life Improvements**

These PRs improve usability and add useful features but are not strictly necessary for stability. They should be merged after the critical fixes are in place and tested.

## **5.1 PR #242: Custom OpenAI-Compatible AI Provider**

Files: 16 | Additions: 266 | Deletions: 65 | Risk: MEDIUM

This PR adds a 'Custom (OpenAI Compatible)' provider option that allows connecting to any OpenAI-compatible API endpoint such as Azure OpenAI, Groq, Together AI, and others. It also improves error reporting for AI connection tests across all providers, surfacing actual error messages instead of a generic 'Connection failed' message. The fork already has five AI providers (Claude, OpenAI, Gemini, Ollama, Copilot), so this addition fits naturally into the existing provider architecture. The new customProvider.ts follows the same interface pattern as the existing providers.

**Integration Steps:**

- Cherry-pick the commits
    
- Add customProvider.ts to the fork's src/services/ai/providers/ directory
    
- Extend the AiProvider union type and providerFactory.ts
    
- Add the custom provider configuration UI to the AI settings section
    
- Verify error reporting improvements work across all existing providers
    

## **5.2 PR #248: Gmail Setup UX Improvement**

Files: 99 | Additions: 7001 | Deletions: 2397 | Risk: HIGH (conflict potential)

This PR redesigns the Gmail account setup flow with two paths: an 'Easy Setup' option using IMAP with App Password (no developer setup required) and a 'Fast Sync' option using the Gmail API via Google Cloud Console. This makes Gmail accessible to non-technical users while keeping the advanced option for power users. The SetupClientId wizard is also redesigned as a 3-step guided wizard with direct buttons to open Google Cloud Console pages and a one-click copy for redirect URIs. While the UX improvement is valuable, this PR has high conflict potential because it heavily modifies AddAccount.tsx and SetupClientId.tsx, which may have been extended in the fork.

**Integration Strategy:**

- Evaluate the conflict surface by comparing the PR's base files with the fork's versions
    
- If conflicts are manageable, cherry-pick and resolve manually
    
- If conflicts are too extensive, consider implementing the two-path UX from scratch in the fork, taking inspiration from the PR's approach
    
- The Easy Setup path (IMAP + App Password) is particularly valuable for reducing the onboarding friction
    

# **6. Tier 4: Deferred Items and Items Needing Review**

These PRs and issues are deferred either because they conflict with the fork's existing implementations or because they require architectural decisions that go beyond stabilization.

## **6.1 PR #249 and #202: i18n Implementations (CONFLICT)**

PR #249 (Japanese localization, 6908 additions, 101 files) and PR #202 (EN/IT i18n, 5925 additions, 108 files) both introduce internationalization infrastructure using react-i18next, but with different architectural approaches. PR #202 uses 9 namespaces and OS language detection via Tauri plugin-os, while PR #249 uses a flat key structure with 1619 translation keys. Critically, the fork already has its own i18n implementation with 3 locales (en, fr, ar) and RTL support, integrated into the uiStore with textDirection and locale fields.

Merging either PR would create significant conflicts with the fork's existing i18n system. The recommended approach is to extract specific translations (Japanese from #249, Italian from #202) as new locale files conforming to the fork's existing i18n architecture, rather than replacing the fork's i18n infrastructure. The fork's translation.json format should be the canonical structure, and new locales should be added as additional JSON files in src/locales/{ja,it}/translation.json.

## **6.2 Issue #257: Outlook 365 and Exchange Support**

This is a legitimate feature request for Microsoft Graph API integration to support Outlook 365/Exchange accounts that require modern authentication (OAuth2 with device flow) rather than basic IMAP credentials. However, this is a major architectural addition that goes well beyond stabilization. It would require a new EmailProvider implementation, OAuth flow for Microsoft identity platform, and potentially a CalDAV/CardDAV integration for calendar and contacts. This should be planned as a separate feature phase after the app is stabilized, potentially as part of the 'One-Click Sync' architecture described in the fork's future.md document.

## **6.3 Issue #232: Linux Performance Problems**

Users report high CPU usage and UI lag on Linux, particularly with the AppImage and .deb packages. PR #246 (now closed) attempted to address this by disabling the dmabuf renderer when running on Linux with NVIDIA or Nouveau drivers, which is a known WebKit/Tauri issue on Linux. This workaround should be re-evaluated and potentially re-implemented as part of the fork's Tauri configuration. The fix involves detecting the GPU driver in the Rust setup code and setting the WEBKIT_DISABLE_DMABUF_RENDERER=1 environment variable when an affected driver is detected. This is a single-line environment variable set that can dramatically improve Linux performance.

## **6.4 Issue #233: Flatpak Release Malformed**

The Flatpak release artifact does not work and appears malformed. Users report a 7.3MB file that is not recognized as a valid Flatpak, and attempting to install it fails with a missing runtime error (org.gnome.Platform/x86_64/46). This is a build/packaging issue rather than a code issue. The fix requires updating the com.velomail.app.yml Flatpak manifest to correctly reference the GNOME runtime, ensure the build process generates a proper .flatpak file, and potentially publish to Flathub for easier installation. This should be addressed as part of the CI/CD pipeline setup mentioned in the fork's known gaps.

## **6.5 Issue #243: Inbox Count and Unread Badges**

Users request unread counters on the left sidebar to track unread emails. This is a UI enhancement that requires adding an unread count query per label/folder and displaying it as a badge in the Sidebar component. While not a bug fix, it is a commonly expected feature in email clients and would significantly improve usability. The implementation would involve adding a getUnreadCountByLabel() function in the threads DB service, modifying the Sidebar component to display counts, and updating the badge count logic to aggregate across folders. This should be considered as a post-stabilization improvement.

# **7. Dependency Updates**

The upstream repository has 11 open dependabot PRs for dependency updates. Rather than merging these individually, the recommended approach is to perform a single batch dependency update after all code-level PRs are merged. This avoids potential conflicts between dependency updates and code changes, and allows for a single round of integration testing.

   
|**PR #**|**Dependency**|**Update Type**|**Priority**|
|---|---|---|---|
|#263|openssl (Rust)|0.10.75 to 0.10.79|HIGH (security)|
|#260|rustls-webpki (Rust)|0.103.9 to 0.103.13|HIGH (security)|
|#258|dompurify (JS)|3.3.1 to 3.4.0|HIGH (security)|
|#234|tar (Rust)|0.4.44 to 0.4.45|MEDIUM|
|#238|picomatch (JS)|4.0.3 to 4.0.4|LOW|
|#228|undici (JS)|7.21.0 to 7.24.1|MEDIUM|
|#212|quinn-proto (Rust)|0.11.13 to 0.11.14|LOW|
|#251|vite (landing)|7.3.1 to 7.3.2|LOW|
|#250|vite (main)|7.3.1 to 7.3.2|LOW|
|#237|picomatch (landing)|4.0.3 to 4.0.4|LOW|
|#236|flatted (landing)|3.3.3 to 3.4.2|LOW|

The security-critical updates (openssl, rustls-webpki, dompurify) should be applied first, followed by the medium-priority updates. The landing page dependencies can be updated last as they do not affect the core application. After each batch, run cargo build and npm run test to verify compatibility.

# **8. Execution Timeline**

The following timeline organizes the stabilization work into four phases with explicit dependencies between them. Each phase should be completed and verified before starting the next. The timeline assumes a single developer working on the merges, with each item including time for conflict resolution, testing, and verification.

## **8.1 Phase 1: Critical Bug Fixes (Week 1)**

Focus on the lowest-risk, highest-impact fixes that require minimal conflict resolution. These are all small, targeted changes that address user-facing bugs.

    
|**Order**|**PR/Issue**|**Description**|**Est. Effort**|**Depends On**|
|---|---|---|---|---|
|1|PR #206|Repair migration 14|2 hours|None|
|2|PR #219|UTC fix for iCal all-day|1 hour|None|
|3|PR #230|iframe link clicks (macOS)|1 hour|None|
|4|PR #201|Remote images CSP fix|1 hour|None|
|5|PR #259|Non-default HTTP ports|1 hour|None|
|6|PR #203|Native text-editing shortcuts|2 hours|None|

**Verification Gate: Run full test suite (142 files). All tests must pass. Manually test each fix.**

## **8.2 Phase 2: Security and SMTP Fix (Week 2)**

Address security vulnerabilities and the critical SMTP password bug. These have more code changes but are still well-scoped.

    
|**Order**|**PR/Issue**|**Description**|**Est. Effort**|**Depends On**|
|---|---|---|---|---|
|7|PR #245|Security hardening (7 fixes)|4 hours|Phase 1|
|8|PR #261|Ollama permissions + AI language|2 hours|Phase 1|
|9|PR #255|Separate SMTP credentials|6 hours|Phase 1|

**Verification Gate: Run full test suite. Security audit checklist. Manual test: create IMAP account with separate SMTP credentials, send email, verify Ollama connection.**

## **8.3 Phase 3: IMAP Reliability (Week 3)**

The most complex phase. Deconstruct PR #262 into logical groups and apply incrementally. This phase has the highest risk and requires the most testing.

    
|**Order**|**PR/Issue**|**Description**|**Est. Effort**|**Depends On**|
|---|---|---|---|---|
|10|PR #262 (partial)|SQLite BUSY error fix|4 hours|Phase 2|
|11|PR #262 (partial)|Shared folder handling|3 hours|Step 10|
|12|PR #262 (partial)|DavMail/Exchange fallback|3 hours|Step 10|
|13|PR #262 (partial)|Password quoting fix|2 hours|Step 10|
|14|Issue #256|Password with quote (if not fully fixed by #262)|2 hours|Step 13|

**Verification Gate: Run full test suite. Manual test: sync IMAP account with DavMail, Stalwart shared folders, and passwords containing special characters. Monitor for SQLite BUSY errors during extended sync.**

## **8.4 Phase 4: Quality of Life and Cleanup (Week 4)**

Add quality-of-life improvements and perform dependency updates. This phase can run in parallel with Phase 3 if different developers are available.

    
|**Order**|**PR/Issue**|**Description**|**Est. Effort**|**Depends On**|
|---|---|---|---|---|
|15|PR #242|Custom OpenAI-compatible provider|4 hours|Phase 2|
|16|PR #248|Gmail setup UX (evaluate conflicts first)|8 hours|Phase 2|
|17|Issue #232|Linux NVIDIA workaround|2 hours|Phase 1|
|18|Issue #243|Unread badge counts|4 hours|Phase 1|
|19|Dependency batch|Security: openssl, webpki, dompurify|2 hours|Phase 3|
|20|Dependency batch|Remaining: tar, picomatch, undici, etc.|2 hours|Step 19|

**Verification Gate: Run full test suite. Build production binary (npm run tauri build). Smoke test on all platforms.**

# **9. Risk Mitigation**

## **9.1 Merge Conflict Resolution Strategy**

The fork's 35 additional commits create potential conflicts in several high-traffic files. The primary conflict areas and mitigation strategies are as follows. For AddImapAccount.tsx, the SMTP credentials PR (#255) will conflict with the fork's extended account setup flow. The resolution should preserve both the fork's UI additions and the PR's separate credential fields, merging the form state and validation logic. For migrations.ts, the fork has migrations up to v34 while PRs may add their own. New migrations from community PRs should be appended with the next available version number, and the migration order must be preserved. For the Tauri capabilities file, multiple PRs touch this file (HTTP scope, Ollama permissions). All capability changes should be combined into a single update. For i18n files, PRs #249 and #202 conflict with the fork's existing i18n implementation. Rather than merging these PRs directly, extract only the locale data as new JSON files.

## **9.2 Regression Prevention**

Each merge must be followed by a complete test run. The fork currently has 142 test files, and this number should only increase as new tests are added for integrated PRs. Before starting the merge process, establish a baseline by running the full test suite and recording the results. After each PR integration, re-run the suite and compare results. Any test failures must be resolved before proceeding to the next PR. Additionally, for each PR, add at least one test case that validates the specific fix or feature introduced by that PR. This creates a regression safety net that catches unintended side effects of future merges.

## **9.3 Branch Strategy**

All stabilization work should be done on a dedicated branch (e.g., stabilize/merge-community-prs) off the fork's main branch. Each PR should be integrated as a separate commit with a clear message referencing the upstream PR number. This makes it easy to bisect issues and revert specific merges if problems are discovered. Once all merges are complete and verified, the stabilization branch can be merged into main. The branch should be pushed to the fork's remote after each phase so that work is backed up and progress is visible.

# **10. Known Gaps and Post-Stabilization Priorities**

Even after completing all four merge tiers, several known gaps remain that are outside the scope of this stabilization plan but should be addressed as immediate follow-up work.

### **10.1 SSL Certificate Configuration**

The fork's future.md documents a known issue with SSL certificate errors when pushing to remote repositories (ca-bundle.crt). This blocks CI/CD pipeline setup, which is essential for automated testing, builds, and releases. The fix requires either configuring Git to use the system's CA bundle correctly or switching to SSH for remote operations. This should be the first post-stabilization task because it enables all subsequent infrastructure work.

### **10.2 Rust Build Toolchain**

The Rust backend does not compile on the developer's current machine due to MinGW/dlltool issues. The code is structurally correct (passes tsc and vitest), but the Rust components cannot be built into a production binary. The fix requires installing the proper MSVC toolchain on Windows or using a Linux/macOS build environment. This is a prerequisite for producing distributable builds.

### **10.3 Export Scheduler Wiring**

The tokio::spawn scheduler in the Rust export module is not started from the Tauri setup() function. The scheduler code exists in src-tauri/src/export/scheduler.rs but is never initialized. This needs to be wired into the Builder::default().setup() callback in lib.rs, following the same pattern as other background services. Without this, the backup scheduler feature (P5) is non-functional at the Rust level.

### **10.4 CI/CD Pipeline**

There is no continuous integration or deployment pipeline. Setting up GitHub Actions for automated testing on PRs, building release artifacts for all platforms (Windows .msi, macOS .dmg, Linux .deb/.AppImage/Flatpak), and publishing releases would significantly improve the project's reliability and contributor experience. This depends on resolving the SSL certificate and Rust build toolchain issues first.

### **10.5 Flatpak Build Fix**

As noted in Issue #233, the Flatpak release artifact is malformed. The com.velomail.app.yml manifest needs to be updated to correctly reference the GNOME runtime and generate a valid .flatpak file. This should be addressed as part of the CI/CD pipeline setup once the build environment is working correctly.Not a feature roadmap — a stabilization sprint