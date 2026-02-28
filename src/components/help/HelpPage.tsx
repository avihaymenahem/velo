import { useState, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { navigateToLabel } from "@/router/navigate";
import { HELP_CATEGORIES, getAllCards, getCategoryById } from "@/constants/helpContent";
import { HelpSidebar } from "./HelpSidebar";
import { HelpSearchBar } from "./HelpSearchBar";
import { HelpCardGrid } from "./HelpCardGrid";

export function HelpPage() {
  const { t } = useTranslation("help");
  const { topic } = useParams({ strict: false }) as { topic?: string };
  const activeTopic =
    topic && HELP_CATEGORIES.some((c) => c.id === topic) ? topic : "getting-started";

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const handleToggleCard = (cardId: string) => {
    setExpandedCardId((prev) => (prev === cardId ? null : cardId));
  };

  // Search filtering — resolve i18n keys before comparing
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    const allCards = getAllCards();
    return allCards.filter((card) => {
      if (t(card.title).toLowerCase().includes(q)) return true;
      if (t(card.summary).toLowerCase().includes(q)) return true;
      if (t(card.description).toLowerCase().includes(q)) return true;
      if (card.tips?.some((tip) => t(tip.text).toLowerCase().includes(q))) return true;
      return false;
    });
  }, [searchQuery, t]);

  // Group search results by category
  const groupedResults = useMemo(() => {
    if (!searchResults) return null;
    const groups: Record<string, typeof searchResults> = {};
    for (const card of searchResults) {
      if (!groups[card.categoryId]) {
        groups[card.categoryId] = [];
      }
      groups[card.categoryId]!.push(card);
    }
    return groups;
  }, [searchResults]);

  const activeCategory = getCategoryById(activeTopic);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <button
          onClick={() => navigateToLabel("inbox")}
          className="p-1.5 -ml-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title={t("backToInbox")}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold text-text-primary">{t("help")}</h1>
      </div>

      {/* Body: sidebar nav + content */}
      <div className="flex flex-1 min-h-0">
        <HelpSidebar activeTopic={activeTopic} />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl px-8 py-6">
            <HelpSearchBar query={searchQuery} onChange={setSearchQuery} />

            {groupedResults ? (
              // Search results mode
              Object.keys(groupedResults).length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(groupedResults).map(([categoryId, cards]) => {
                    const cat = getCategoryById(categoryId);
                    return (
                      <div key={categoryId}>
                        <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">
                          {cat ? t(cat.label) : categoryId}
                        </h2>
                        <HelpCardGrid
                          cards={cards}
                          expandedCardId={expandedCardId}
                          onToggleCard={handleToggleCard}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Empty search state
                <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
                  <Search size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">{t("noResults", { query: searchQuery })}</p>
                </div>
              )
            ) : (
              // Active topic mode
              activeCategory && (
                <div>
                  <h2 className="text-lg font-semibold text-text-primary mb-4">
                    {t(activeCategory.label)}
                  </h2>
                  <HelpCardGrid
                    cards={activeCategory.cards}
                    expandedCardId={expandedCardId}
                    onToggleCard={handleToggleCard}
                  />
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
