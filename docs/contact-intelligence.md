# Contact Intelligence

Tags, groups, segments, CSV import, dedup merge, and activity timeline for contacts.

## Database Schema (Migration v24)

```sql
contact_tags (id, account_id, name, color, sort_order, created_at)
contact_tag_pivot (contact_id, tag_id)  -- PK(contact_id, tag_id)
contact_groups (id, account_id, name, description, created_at)
contact_group_pivot (contact_id, group_id)  -- PK(contact_id, group_id)
contact_segments (id, account_id, name, query, created_at)
```

## Tags

CRUD via `src/services/db/contactTags.ts`. Service layer in `src/services/contacts/tags.ts`.

```ts
upsertContactTag(id?, accountId, name, color?)
deleteContactTag(id, accountId)
tagContact(contactId, tagId)              // add tag to contact
untagContact(contactId, tagId)            // remove tag
updateContactTags(contactId, tagIds[])    // sync — adds new, removes old
getContactTags(contactId)                 // returns DbContactTag[]
```

UI: `TagPill` (colored badge), `TagCloud` (tag management panel).

## Groups

CRUD via `src/services/db/contactGroups.ts`. Service layer in `src/services/contacts/groups.ts`.

```ts
upsertContactGroup(id?, accountId, name, description?)
deleteContactGroup(id, accountId)
addContactToGroup(contactId, groupId)
removeContactFromGroup(contactId, groupId)
getContactGroups(contactId)
getContactGroupIds(groupId)  // returns member contact_ids
```

UI: `GroupManager` component — create/delete groups, view member count.

## Segments

Saved query strings evaluated against the contacts table. Service in `src/services/contacts/segments.ts`.

Supported query operators:
- `from:domain.ma` — search contacts by email domain
- `from:@example.com` — matches contacts with that domain
- `has:attachment` — contacts who sent attachments
- `last_contact:<30` — not contacted in N days
- Any other string falls back to `searchContacts(query)`

```ts
evaluateSegmentQuery(accountId, query): Promise<string[]>
```

UI: `SegmentList` component.

## CSV Import

Rust backend (`src-tauri/src/contacts/csv.rs`):
```rust
#[tauri::command]
pub fn parse_csv(csv_content: String) -> Result<Vec<CsvContact>, String>
```

Recognizes column headers: `email`, `name`, `display_name`, `first_name`, `last_name`, `notes`. Flexible matching (case-insensitive, multiple aliases per column).

UI: `CsvImportWizard` — four-step modal (select → preview → import → done).

## Merge Dedup

`findMergeCandidates()` groups contacts by normalized email, returns duplicates (score=100 for exact match). `mergeContacts(keepId, mergeId)` re-assigns tag/group pivots and deletes the duplicate.

```ts
interface MergeCandidate {
  contactId: string;
  email: string;
  displayName: string | null;
  matchScore: number;
}
```

UI: `ContactMergeDialog` — shows candidates, user picks which to keep.

## Activity Timeline

`getContactActivity(accountId, email, limit?)` returns unified events:

```ts
interface ActivityEvent {
  type: "email" | "task" | "calendar";
  date: number;
  summary: string;
  id: string;
}
```

Aggregated from `messages`, `tasks`, and `calendar_events` tables. UI: `ContactTimeline` — vertical event list in the contact sidebar.
