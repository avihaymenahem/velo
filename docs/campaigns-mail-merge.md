# Campaigns & Mail Merge

## Database Schema (Migration v25)

```sql
campaigns (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  template_id TEXT REFERENCES templates(id),
  segment_id TEXT REFERENCES contact_segments(id),
  status TEXT NOT NULL DEFAULT 'draft',   -- draft|scheduled|sending|sent|cancelled
  sent_count INTEGER DEFAULT 0,
  sent_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
)

campaign_recipients (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|opened|clicked|bounced
  opened_at INTEGER,
  clicked_at INTEGER,
  PRIMARY KEY (campaign_id, contact_id)
)
```

`pending_operations` gains a `campaign_id` column for tracking sends through the offline queue.

## Campaign Service

Located in `src/services/campaigns/`:

| File | Purpose |
|------|---------|
| `campaignService.ts` | `createCampaign()`, `sendCampaign()` |
| `templateVariables.ts` | `resolveCampaignVariables()` |
| `trackingService.ts` | `getCampaignStats()` |

```ts
createCampaign({ accountId, name, templateId?, segmentId?, recipientContactIds?, groupId? })
sendCampaign(campaignId)  // enqueues per-recipient operations via queue processor
```

## Template Variables

Supported in campaign templates via `{{variable}}` syntax:

| Variable | Source |
|----------|--------|
| `{{email}}` | Contact email |
| `{{first_name}}` | First word of display name |
| `{{company}}` | Email domain (before .tld) |
| `{{display_name}}` | Full display name |

```ts
resolveCampaignVariables(template, { contactId, accountId })
```

Values are HTML-escaped before substitution. If a template has no `{{` markers, the string is returned as-is for performance.

## Sending & Rate Limiting

`sendCampaign()` creates one `pending_operations` row per recipient with `operation_type = "send_campaign_email"` and `campaign_id` attached. The queue processor (`queue/queueProcessor.ts`, 30s interval) processes these with a default rate limit of 1000ms between sends (`DEFAULT_RATE_LIMIT_MS`).

## Campaign Statuses

```
draft → scheduled → sending → sent
                  ↘ cancelled
```

Defined in `src/constants/campaignDefaults.ts`.

## Campaign UI

| Component | Path |
|-----------|------|
| `CampaignPage` | `src/components/campaigns/CampaignPage.tsx` |
| `CampaignList` | `src/components/campaigns/CampaignList.tsx` |
| `CampaignComposer` | `src/components/campaigns/CampaignComposer.tsx` |
| `CampaignRecipientPicker` | `src/components/campaigns/CampaignRecipientPicker.tsx` |
| `CampaignAnalytics` | `src/components/campaigns/CampaignAnalytics.tsx` |
| `CampaignStatsCard` | `src/components/campaigns/CampaignStatsCard.tsx` |

Campaign composer uses a 4-step wizard (Name → Template → Recipients → Preview). Recipients can be selected individually, from a group, or from a segment. Analytics uses Recharts (BarChart + PieChart) for delivery stats.

## Store

`campaignStore` (`src/stores/campaignStore.ts`) manages campaign list and stats state. Methods: `loadCampaigns`, `loadStats`, `createCampaign`, `deleteCampaign`.
