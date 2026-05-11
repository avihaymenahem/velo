import {
  addTagToContact,
  removeTagFromContact,
  getTagIdsForContact,
  getContactTagById,
} from "@/services/db/contactTags";
import type { DbContactTag } from "@/services/db/contactTags";

export async function tagContact(contactId: string, tagId: string): Promise<void> {
  await addTagToContact(contactId, tagId);
}

export async function untagContact(contactId: string, tagId: string): Promise<void> {
  await removeTagFromContact(contactId, tagId);
}

export async function getContactTags(contactId: string): Promise<DbContactTag[]> {
  const tagIds = await getTagIdsForContact(contactId);
  const tags: DbContactTag[] = [];
  for (const id of tagIds) {
    const tag = await getContactTagById(id);
    if (tag) tags.push(tag);
  }
  return tags;
}

export async function updateContactTags(contactId: string, tagIds: string[]): Promise<void> {
  const existing = await getTagIdsForContact(contactId);
  const toAdd = tagIds.filter((id) => !existing.includes(id));
  const toRemove = existing.filter((id) => !tagIds.includes(id));
  for (const id of toRemove) {
    await removeTagFromContact(contactId, id);
  }
  for (const id of toAdd) {
    await addTagToContact(contactId, id);
  }
}
