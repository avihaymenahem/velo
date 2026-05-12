# Velo Re-Plan: Stabilization & Feature Roadmap

> Goal: Build a **Google-quality email client** — organized, simple, rich in editing, template-driven, automated, analytics-powered, and warmed for deliverability. Every item below is grounded in the current codebase state, open upstream PRs/issues, and the fork's existing feature work.

---

## 0. Current State Summary

| Metric | Value |
|--------|-------|
| Fork version | `0.4.22` |
| DB migrations | v28–v36 (9 new) |
| Test files | 142+ TypeScript, 7 Rust |
| Upstream open PRs | ~30 (14 human-authored, ~16 dependabot) |
| Upstream open issues | 9 (bugs + enhancements) |
| Already merged upstream PRs | #206, #219, #230, #201, #203, #190 (critical tier), #245, #255, #252, #241, #240 (security tier), #262 (IMAP tier), #242, #261, #259 (AI tier), #249, #202 (i18n) |
| New features in fork | PGP, compliance, templates, vault, export, filters, quick replies, snooze presets |
| Architecture | Tauri v2 + React 19 + Rust + SQLite (offline-first) |

### What's already merged into `main`

All 30 commits from 2026-05-12 are on `main`. Key merged work:

- **Stabilization tier 1**: 6 critical upstream bug fixes (migration 14 repair, iCal UTC, iframe links, CSP images, keyboard shortcuts, snooze shortcut)
- **Stabilization tier 2**: Security hardening (HTTP capabilities, SSRF, crypto, SQL, unsubscribe), separate SMTP credentials, Ollama permissions, AI language setting
- **Stabilization tier 3**: Custom OpenAI-compatible provider, Japanese + Italian locales, dependency updates
- **Stabilization post**: Export scheduler wiring, dependency updates
- **Feature P1–P10**: PGP decryption, compliance engine, advanced templates, attachment vault, backup & export, vault integration, polish, advanced filter engine, filter UI, quick replies
- **S1 Stabilization Sprint**: Full upstream integration pass
- **Snooze presets**: Migration v36, DB service, UI, i18n

---

## 1. Remaining Upstream PRs to Merge

### 1.1 High Priority — Bug Fixes & Reliability (merge now)

| PR | Title | Why merge | Risk | Action |
|----|-------|-----------|------|--------|
| **#256** (issue) | Password with quote breaks sync | Critical bug — passwords containing `'` or `"` cause BAD data errors in IMAP. Any user with special chars in password is broken. | Low — isolated to IMAP auth string handling | Merge & add test for special-char passwords |
| **#240** (issue) | SQLite BUSY errors (code 5) during IMAP sync | App becomes unusable for IMAP accounts under concurrent write load. Root cause already analyzed by reporter. | Medium — touches DB concurrency model | Apply proposed fix: WAL mode + busy timeout + connection pooling |
| **#232** (issue) | Performance on Linux very slow | High CPU, 1s lag on Linux. Likely rendering or polling issue. | Medium — needs profiling | Profile Linux build; check re-render cycles, IPC polling |
| **#233** (issue) | Flatpak artifact malformed | 7.3MB Flatpak not recognized. Blocks Linux adoption. | Low — build config fix | Fix Flatpak build pipeline, verify artifact size |
| **#258** | bump dompurify 3.3.1 → 3.4.0 | Security sanitizer update — directly affects email HTML rendering safety. | Low — patch update | Merge via dependabot |
| **#263** | bump openssl 0.10.75 → 0.10.79 | Rust security patch — affects TLS connections for IMAP/SMTP. | Low — patch update | Merge via dependabot |
| **#260** | bump rustls-webpki 0.103.9 → 0.103.13 | Certificate validation security patch. | Low — patch update | Merge via dependabot |

### 1.2 Medium Priority — Feature Enhancements (evaluate per item)

| PR | Title | Why consider | Risk | Action |
|----|-------|-------------|------|--------|
| **#248** | Improve Gmail setup UX with easy/advanced options | Reduces onboarding friction — "Easy Setup" (IMAP) vs "Fast Sync" (Gmail API) is how Google guides users. | Low — additive UX change | Merge; align with existing Gmail account setup flow |
| **#231** | install.cat installer scripts | Faster install for new users. Not critical but reduces friction. | Low — script-only | Merge; validate scripts on all 3 platforms |
| **#185** | AI agent with Claude tool-use support | Autonomous agent panel. Powerful but complex — needs careful review for security (tool permissions, data access). | High — new attack surface, scope creep | **Defer** to Phase 4 (AI Automation). Review security model first. |
| **#184** | 7 AI feature toggles in Settings | Granular control over AI features. Good UX principle. | Low — UI-only | Merge as part of AI settings cleanup |

### 1.3 Low Priority — Dependency Bumps

| PR | Title | Action |
|----|-------|--------|
| #251/#250 | bump vite 7.3.1 → 7.3.2 | Merge landing PR; close duplicate |
| #238/#237 | bump picomatch 4.0.3 → 4.0.4 | Merge landing PR; close duplicate |
| #236 | bump flatted 3.3.3 → 3.4.2 | Merge |
| #234 | bump tar 0.4.44 → 0.4.45 | Merge |
| #228 | bump undici 7.21.0 → 7.24.1 | Merge |
| #212 | bump quinn-proto 0.11.13 → 0.11.14 | Merge |
| #227 | release velo 0.4.22 | Close — fork is already past this |

### 1.4 Deferred — Not for Stabilization

| PR/Issue | Title | Reason |
|----------|-------|--------|
| #257 | Outlook 365 & shared mailbox support | Requires Exchange/Graph API — major new provider. Plan for Phase 5. |
| #243 | Inbox count badges | Small enhancement but requires sidebar refactor. Bundle with Phase 2 UI polish. |
| #185 | AI agent panel | Complex, security-sensitive. Phase 4. |

---

## 2. Remaining Upstream Issues to Solve

| # | Issue | Severity | Fix Approach | Phase |
|---|-------|----------|-------------|-------|
| **#256** | Password with quote breaks sync | **Critical** | Escape/sanitize password string in IMAP AUTH; add regression test | Phase 1 |
| **#240** | SQLite BUSY errors | **Critical** | Enable WAL journal mode, set `busy_timeout`, add connection pool with retry logic in Rust layer | Phase 1 |
| **#241** | Shared folders sync failure | **High** | Skip `SELECT` on `\Noselect` folders; handle `UIDVALIDITY` changes gracefully (partially addressed by PR #262 merge, verify) | Phase 1 |
| **#252** | SMTP password silently discarded | **High** | Already addressed by PR #255 merge; verify fix works end-to-end | Phase 1 (verify) |
| **#232** | Linux performance slow | **High** | Profile: check React re-renders, Rust IPC overhead, polling intervals. Likely fix: memoize components, debounce sync, reduce IPC chattiness | Phase 1 |
| **#233** | Flatpak artifact broken | **Medium** | Fix CI pipeline: correct Flatpak build manifest, verify output >50MB | Phase 2 |
| **#253** | Separate SMTP credentials | **Medium** | Already addressed by PR #255 merge; close issue after verification | Phase 1 (verify) |
| **#243** | Unread count badges | **Low** | Add `unread_count` column to folder cache, update on sync, render badge in sidebar | Phase 2 |

---

## 3. Stabilization Phases

### Phase 1: Critical Fixes & Dependency Updates (Week 1)

**Goal**: Make the app reliable for daily use. No new features.

- [ ] **Fix password special-char bug** (#256) — sanitize IMAP AUTH strings, add test with `'`, `"`, `\`, `%` characters
- [ ] **Fix SQLite BUSY errors** (#240) — enable WAL mode in Rust, set `busy_timeout = 5000`, add retry wrapper for concurrent writes
- [ ] **Verify shared folder handling** (#241) — confirm PR #262 merge resolved Stalwart shared folder issues; add test with `\Noselect` folders
- [ ] **Verify SMTP credential fix** (#252/#253) — end-to-end test: set different SMTP creds, restart, verify persistence
- [ ] **Profile Linux performance** (#232) — React DevTools profiling, check `useEffect` polling, reduce IPC call frequency
- [ ] **Merge security dependency bumps** — dompurify 3.4.0, openssl 0.10.79, rustls-webpki 0.103.13
- [ ] **Merge all remaining dependabot bumps** — vite, picomatch, flatted, tar, undici, quinn-proto
- [ ] **Add integration test suite** — at least 10 tests covering: IMAP connect, SMTP send, sync with concurrent writes, password special chars, template rendering, filter execution, vault CRUD, export roundtrip, PGP decrypt, snooze roundtrip

### Phase 2: Polish & Google-Level UX (Week 2–3)

**Goal**: Make the app feel like Google — organized, clean, intuitive.

- [ ] **Sidebar unread badges** (#243) — add unread count per folder, animate on change
- [ ] **Gmail-style onboarding** (PR #248) — merge easy/advanced setup paths, add progress indicators
- [ ] **Keyboard-first navigation audit** — verify every action has a shortcut; add missing ones; show shortcut hints in tooltips
- [ ] **Composer polish** — rich toolbar with format preview, inline image paste, attachment drag zones with visual feedback
- [ ] **Template preview panel** — live preview as you type template variables; one-click apply
- [ ] **Split inbox refinement** — category tabs (Primary, Social, Promotions, Updates) like Gmail; make AI categorization results editable
- [ ] **Thread rendering optimization** — virtual scrolling for long threads; lazy-load attachments; collapse quoted text
- [ ] **Flatpak build fix** (#233) — correct CI manifest, test on Fedora/Ubuntu
- [ ] **AI feature toggles** (PR #184) — merge 7-toggle settings panel; make all AI features individually disableable
- [ ] **Settings reorganization** — group settings by workflow (Accounts, Compose, AI, Privacy, Appearance) instead of flat list

### Phase 3: Rich Editing, Templates & Previews (Week 3–4)

**Goal**: Best-in-class email composition experience.

- [ ] **TipTap v3 editor enhancements**:
  - [ ] Markdown shortcuts (type `#` → heading, `-` → bullet, etc.)
  - [ ] Table insertion and editing
  - [ ] Code block with syntax highlighting
  - [ ] Inline emoji picker
  - [ ] Mention autocomplete (`@` triggers contact search)
  - [ ] Link preview cards (paste URL → fetch title + favicon)
- [ ] **Template system v2**:
  - [ ] Live preview in template picker (render template with sample data)
  - [ ] Template categories with drag-and-drop reordering
  - [ ] Conditional blocks (`{{#if variable}}...{{/if}}`)
  - [ ] Shared templates (export/import JSON)
  - [ ] Template analytics (usage count, last used)
- [ ] **Send preview** — show exactly what the recipient will see: rendered HTML, attachment list, SMTP envelope (From, Reply-To)
- [ ] **Undo send buffer** — 5s/10s/30s configurable delay with cancel button (verify existing implementation works reliably)
- [ ] **Schedule send** — date/time picker with timezone awareness; queue in SQLite, Rust background worker sends at scheduled time

### Phase 4: Automation, Workflows & AI (Week 4–6)

**Goal**: Make email work for you, not the other way around.

- [ ] **Workflow engine** (build on existing `workflow-engine.md` spec):
  - [ ] Trigger types: email received, email sent, timer, manual
  - [ ] Action types: move, label, reply (template), forward, snooze, mark read/unread, call webhook
  - [ ] Condition builder: sender, subject regex, body regex, attachment present, time of day, day of week
  - [ ] Workflow editor UI: visual node-based builder or card-based rule builder
  - [ ] Workflow execution log: audit trail of all automated actions
- [ ] **AI automation**:
  - [ ] Smart categorization improvements — learn from user corrections
  - [ ] Auto-reply suggestions based on thread context
  - [ ] Follow-up reminder intelligence — detect if recipient hasn't replied in N days
  - [ ] AI agent panel (review PR #185 security model first) — sandboxed tool-use with user confirmation for destructive actions
- [ ] **Filter engine v2**:
  - [ ] Regex conditions on any header field
  - [ ] Score-based filters (spam score, priority score)
  - [ ] Filter chaining (output of one filter feeds into next)
  - [ ] Filter performance monitoring (execution time, match rate)
- [ ] **Quick reply evolution**:
  - [ ] Context-aware suggestions (different quick replies for internal vs external)
  - [ ] Quick reply with attachment (auto-attach relevant file)
  - [ ] Quick reply usage analytics

### Phase 5: Analytics, Email Marketing & Campaigns (Week 6–8)

**Goal**: Turn Velo into a professional email marketing tool, not just a client.

- [ ] **Campaign dashboard** (build on existing `campaigns-mail-merge.md` spec):
  - [ ] Campaign creation wizard: audience selection → template → send schedule → review
  - [ ] Mail merge with CSV import and per-recipient personalization
  - [ ] A/B testing: send 2 variants, auto-pick winner after sample size
  - [ ] Campaign calendar view
- [ ] **Analytics engine**:
  - [ ] Per-campaign metrics: sent, delivered, bounced, opened, clicked, replied, unsubscribed
  - [ ] Open tracking: 1px beacon + link wrapping (ethical: clearly disclosed, GDPR-compliant)
  - [ ] Click tracking: redirect URLs with campaign parameters
  - [ ] Bounce classification: hard vs soft, auto-suppress hard bounces
  - [ ] Analytics dashboard: time-series charts, top-performing templates, engagement heatmaps
  - [ ] Export analytics as CSV/PDF
- [ ] **Email queue management**:
  - [ ] Visual queue inspector: see pending, sending, sent, failed messages
  - [ ] Rate limiting: configure max sends per minute/hour (respect provider limits)
  - [ ] Retry logic: exponential backoff for transient failures
  - [ ] Pause/resume queue
  - [ ] Priority queue: mark campaigns as low priority, transactional as high
- [ ] **Contact intelligence v2** (build on existing `contact-intelligence.md` spec):
  - [ ] Engagement scoring: how often contact opens/replies
  - [ ] Segmentation: create dynamic segments based on engagement, tags, custom fields
  - [ ] Suppression list management: bounces, unsubscribes, complaints
  - [ ] Contact timeline: all interactions chronologically

### Phase 6: Email Warming & Best Practices (Week 8–10)

**Goal**: Maximize deliverability. Make Velo the tool that gets your emails into inboxes, not spam folders.

- [ ] **Email warming system**:
  - [ ] Warmup scheduler: gradually increase daily send volume over 2–4 weeks
  - [ ] Warmup templates: pre-written "warmup" emails that look natural
  - [ ] Auto-warmup mode: send warmup emails to a network of warmup partners (or self-controlled addresses)
  - [ ] Warmup progress dashboard: daily volume, reply rate, inbox placement rate
  - [ ] Warmup completion alert: notify when domain is "warm enough" for production volume
- [ ] **Deliverability monitoring**:
  - [ ] SPF/DKIM/DMARC checker: verify DNS records for each sending domain
  - [ ] Blacklist checker: query major DNSBLs (Spamhaus, Barracuda, etc.)
  - [ ] Inbox placement test: send test emails to seed addresses, check if they land in inbox vs spam
  - [ ] Authentication status in composer: warn if sending domain lacks proper DNS records
- [ ] **Best practice enforcement**:
  - [ ] Pre-send checklist: subject length, spam score, link count, image-to-text ratio, unsubscribe link present
  - [ ] Compliance guardrails: CAN-SPAM, GDPR, CASL requirements (build on existing compliance engine)
  - [ ] Content quality score: AI-powered analysis of email content for spam triggers
  - [ ] Sending pattern analysis: warn if volume spikes could trigger rate limiting
  - [ ] List hygiene: identify and suggest removal of inactive contacts (no open in 90+ days)
- [ ] **Technical best practices**:
  - [ ] SMTP connection pooling and reuse (avoid reconnecting per send)
  - [ ] Proper `Precedence: bulk` and `List-Unsubscribe` headers for campaigns
  - [ ] RFC 5322 compliance validation (message ID, date, MIME structure)
  - [ ] Feedback loop (FBL) processing: parse ARF reports from ISPs
  - [ ] Bounce rate alerting: auto-pause campaign if bounce rate exceeds threshold (5%)

---

## 4. OpenCode Agents Integration

The user mentions ongoing work with OpenCode agents. This section maps how agents should be used for each phase.

### Agent Task Allocation

| Phase | Agent Tasks | Parallelism |
|-------|------------|-------------|
| Phase 1 | Fix password bug; Fix SQLite BUSY; Profile Linux perf; Merge dependabot PRs; Write integration tests | 4–5 agents in parallel (each bug fix is independent) |
| Phase 2 | Sidebar badges; Gmail onboarding; Composer polish; Flatpak fix; Settings reorganization | 3–4 agents (UI tasks can conflict — coordinate via git branches) |
| Phase 3 | TipTap enhancements; Template v2; Send preview | 2–3 agents (editor work should be sequential to avoid merge conflicts) |
| Phase 4 | Workflow engine; AI automation; Filter v2; Quick reply evolution | 2 agents (workflow + AI can be parallel; filter + quick reply can be parallel) |
| Phase 5 | Campaign dashboard; Analytics engine; Queue management; Contact intelligence v2 | 3–4 agents (each subsystem is independent) |
| Phase 6 | Warming system; Deliverability monitoring; Best practice enforcement; Technical best practices | 3–4 agents (each subsystem is independent) |

### Agent Coordination Rules

1. **One feature = one branch** — agents create feature branches from `main`, never work on `main` directly
2. **Test before merge** — every agent must run `cargo test` + `vitest` before requesting merge
3. **No cross-agent dependencies in same phase** — if Agent A needs Agent B's output, they must be in different phases
4. **Worklog discipline** — every agent appends to `/home/z/my-project/worklog.md` before and after work
5. **Conflict resolution** — if two agents touch the same file, the second agent rebase-resolves before merging

---

## 5. Known Gaps & Risks

| Gap | Impact | Mitigation |
|-----|--------|------------|
| Git SSL push failure | Cannot push to remote; blocks CI/CD | Switch to SSH keys or fix `.gitconfig` SSL CA path |
| Windows MSVC toolchain | Production Windows builds fail | Set up GitHub Actions runner with MSVC; document MSVC setup in `development.md` |
| Gmail API sync is online-only | Breaks offline-first guarantee for Gmail users | Document clearly; add offline indicator; queue API writes for later sync |
| AI features without provider | Features silently degrade | Merge PR #184 toggles; show clear "AI unavailable" states; never block core email flow |
| Fork drift from upstream | Harder to merge future upstream fixes | Monthly upstream sync; track which PRs are merged vs skipped |
| SQLite at scale | BUSY errors may return under heavy load | WAL mode + busy_timeout should fix most cases; monitor in production |
| Campaign tracking privacy | Open/click tracking raises GDPR concerns | Make tracking opt-in; clearly disclose in UI; store minimal data; respect DNT header |
| Email warming ethics | Automated warmup could be considered abusive | Only warm user's own addresses; never warm third-party lists; document as "sender reputation building" |

---

## 6. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Zero critical bugs in IMAP/SMTP | 0 open critical issues | GitHub issues tracker |
| App launch time | < 2 seconds cold start | Tauri perf profiling |
| IMAP sync reliability | < 0.1% sync failures under normal load | Sync error logs |
| Test coverage | > 80% of service layer | `vitest --coverage` |
| Linux performance | < 200ms UI response time | React DevTools profiling |
| Template rendering | < 50ms for any template | Performance benchmark |
| Campaign send throughput | > 100 emails/minute (provider-limited) | Queue metrics |
| Warmup completion | Domain reputation "good" in 21 days | Inbox placement test results |
| Unread count accuracy | 100% sync with server | Cross-check with webmail |

---

## 7. Release Cadence

| Version | Phase | Timeline | Focus |
|---------|-------|----------|-------|
| `0.5.0` | Phase 1 | Week 1 | Critical bug fixes, dependency updates, integration tests |
| `0.5.1` | Phase 2 | Week 2–3 | UX polish, Google-level organization, sidebar badges |
| `0.6.0` | Phase 3 | Week 3–4 | Rich editing, templates v2, send preview |
| `0.7.0` | Phase 4 | Week 4–6 | Workflow engine, AI automation, filter v2 |
| `0.8.0` | Phase 5 | Week 6–8 | Campaigns, analytics, queue management |
| `0.9.0` | Phase 6 | Week 8–10 | Email warming, deliverability, best practices |
| `1.0.0` | Final | Week 10–11 | Stability pass, documentation, release |

---

## 8. What NOT To Do

This is as important as what to do. The following are explicitly **out of scope** for stabilization:

- ❌ **New email providers** (Exchange/Graph API, JMAP) — defer to post-1.0
- ❌ **Mobile companion app** — defer to post-1.0
- ❌ **WASM plugin architecture** — defer to post-1.0
- ❌ **End-to-end encrypted multi-device sync** — research project, not product work
- ❌ **CalDAV/CardDAV sync** — defer to post-1.0
- ❌ **Major UI framework migration** — stick with React 19 + TipTap v3
- ❌ **Rewrite of Rust backend** — incremental improvements only
- ❌ **Social/collaboration features** — not an email client concern

---

## 9. Dependency Graph

```
Phase 1 (Critical Fixes)
    │
    ├──→ Phase 2 (UX Polish) ──→ Phase 3 (Rich Editing)
    │                                    │
    │                                    ├──→ Phase 4 (Automation & AI)
    │                                    │
    │                                    └──→ Phase 5 (Campaigns & Analytics)
    │                                             │
    │                                             └──→ Phase 6 (Warming & Deliverability)
    │
    └──→ [Ongoing] Dependency updates, test coverage, documentation
```

Phases 2 and 3 can overlap partially. Phases 4 and 5 have a soft dependency (campaigns need templates, but workflow engine is independent). Phase 6 depends on Phase 5's queue infrastructure.

---

## 10. Immediate Next Steps (This Week)

1. **Fix password special-char bug** — highest impact, lowest risk, takes < 1 hour
2. **Fix SQLite BUSY errors** — enable WAL + busy_timeout in Rust, takes ~2 hours
3. **Merge all dependabot PRs** — batch merge, takes ~30 minutes
4. **Verify SMTP credential persistence** — manual test, takes ~15 minutes
5. **Start Linux performance profiling** — identify top 3 bottlenecks, takes ~3 hours
6. **Begin Phase 2 sidebar badge implementation** — parallel with profiling

These 6 tasks can be assigned to OpenCode agents immediately, with tasks 1–4 completing within a single session.
