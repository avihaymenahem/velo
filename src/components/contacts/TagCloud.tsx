import { Plus } from "lucide-react";
import { TagPill } from "./TagPill";
import type { ContactTag } from "@/stores/contactStore";

interface TagCloudProps {
  tagIds: string[];
  allTags: ContactTag[];
  onAddTag: () => void;
  onRemoveTag: (tagId: string) => void;
  editable?: boolean;
}

export function TagCloud({ tagIds, allTags, onAddTag, onRemoveTag, editable = false }: TagCloudProps) {
  const tagMap = new Map(allTags.map((t) => [t.id, t]));
  const contactTags = tagIds.map((id) => tagMap.get(id)).filter(Boolean) as ContactTag[];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {contactTags.map((tag) => (
        <TagPill
          key={tag.id}
          name={tag.name}
          color={tag.color}
          onRemove={editable ? () => onRemoveTag(tag.id) : undefined}
        />
      ))}
      {editable && (
        <button
          onClick={onAddTag}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Add tag"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}
