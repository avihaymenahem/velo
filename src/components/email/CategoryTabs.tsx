import { useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import { Inbox, Bell, Tag, Users, Newspaper, type LucideIcon } from "lucide-react";
import { ALL_CATEGORIES } from "@/services/db/threadCategories";

export interface CategoryTabsProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  unreadCounts?: Record<string, number>;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Primary: Inbox,
  Updates: Bell,
  Promotions: Tag,
  Social: Users,
  Newsletters: Newspaper,
};

export function CategoryTabs({ activeCategory, onCategoryChange, unreadCounts }: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    el.addEventListener("scroll", checkOverflow, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", checkOverflow);
    };
  }, [checkOverflow]);

  // Update sliding indicator position when active category changes — useLayoutEffect prevents flicker
  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeCategory);
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeCategory]);

  return (
    <div className="relative border-b border-border-secondary shrink-0">
      {/* Left fade */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-bg-secondary to-transparent z-10 pointer-events-none" />
      )}
      {/* Right fade */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-bg-secondary to-transparent z-10 pointer-events-none" />
      )}
      <div
        ref={scrollRef}
        className="flex px-2 overflow-x-auto hide-scrollbar relative"
      >
        {ALL_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const count = unreadCounts?.[cat] ?? 0;
          return (
            <button
              key={cat}
              ref={(el) => { if (el) tabRefs.current.set(cat, el); else tabRefs.current.delete(cat); }}
              onClick={(e) => {
                onCategoryChange(cat);
                e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
              }}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
                activeCategory === cat
                  ? "text-accent"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              {Icon && <Icon size={13} />}
              {cat}
              {count > 0 && (
                <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {/* Sliding indicator */}
        {indicatorStyle && (
          <span
            className="absolute bottom-0 h-0.5 bg-accent rounded-full transition-all duration-200 ease-out pointer-events-none"
            style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
          />
        )}
      </div>
    </div>
  );
}
