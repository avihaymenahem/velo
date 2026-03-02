import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { searchContacts, type DbContact } from "@/services/db/contacts";

interface AddressInputProps {
  label: string;
  addresses: string[];
  onChange: (addresses: string[]) => void;
  placeholder?: string;
}

export function AddressInput({
  label,
  addresses,
  onChange,
  placeholder,
}: AddressInputProps) {
  const { t } = useTranslation("composer");
  const resolvedPlaceholder = placeholder ?? t("addRecipients");
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<DbContact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (value.length >= 2) {
        searchTimerRef.current = setTimeout(async () => {
          const results = await searchContacts(value, 5);
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
          setSelectedIdx(-1);
        }, 200);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    },
    [],
  );

  const addAddress = useCallback(
    (address: string) => {
      const trimmed = address.trim();
      if (trimmed && !addresses.includes(trimmed)) {
        onChange([...addresses, trimmed]);
      }
      setInputValue("");
      setSuggestions([]);
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [addresses, onChange],
  );

  const removeAddress = useCallback(
    (index: number) => {
      onChange(addresses.filter((_, i) => i !== index));
    },
    [addresses, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      if (showSuggestions && selectedIdx >= 0) {
        addAddress(suggestions[selectedIdx]!.email);
      } else if (inputValue.trim()) {
        addAddress(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && addresses.length > 0) {
      removeAddress(addresses.length - 1);
    } else if (e.key === "ArrowDown" && showSuggestions) {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && showSuggestions) {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-text-tertiary pt-1.5 w-8 shrink-0">
        {label}
      </span>
      <div className="flex-1 flex flex-wrap items-center gap-1 min-h-[32px] relative">
        {addresses.map((addr) => (
          <span
            key={addr}
            className="inline-flex items-center gap-1 bg-accent-light text-accent text-xs px-2 py-0.5 rounded-full"
          >
            {addr}
            <button
              onClick={() => onChange(addresses.filter((a) => a !== addr))}
              className="hover:text-danger text-[0.625rem] leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay to allow click on suggestion
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            blurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150);
            if (inputValue.trim()) addAddress(inputValue);
          }}
          placeholder={addresses.length === 0 ? resolvedPlaceholder : ""}
          aria-label={label}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        />

        {/* Autocomplete dropdown */}
        {showSuggestions && (
          <div className="absolute top-full left-0 mt-1 w-full bg-bg-primary border border-border-primary rounded-md shadow-lg z-50 py-1">
            {suggestions.map((contact, i) => (
              <button
                key={contact.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addAddress(contact.email)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-bg-hover ${
                  i === selectedIdx ? "bg-bg-hover" : ""
                }`}
              >
                <div className="text-text-primary">
                  {contact.display_name ?? contact.email}
                </div>
                {contact.display_name && (
                  <div className="text-xs text-text-tertiary">
                    {contact.email}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
