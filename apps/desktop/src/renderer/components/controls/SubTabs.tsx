import { onTabKeyDown } from './tabKeys';

export interface SubTabsProps<T extends string> {
  tabs: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
  pills?: [string, string];
}

/**
 * Text tabs inside a settings panel, flanked by shoulder-button pills; active tab gets a 2px accent underline.
 * `data-subtabs` lets gamepad navigation step them (L2/R2 on a page, L1/R1 inside a dialog).
 */
export function SubTabs<T extends string>({ tabs, value, onChange, pills }: SubTabsProps<T>) {
  return (
    <div className="subtabs">
      {pills && (
        <span className="pill" aria-hidden="true">
          {pills[0]}
        </span>
      )}
      <div
        className="subtabs-list"
        role="tablist"
        data-subtabs
        onKeyDown={(e) =>
          onTabKeyDown(
            e,
            tabs.length,
            tabs.findIndex((t) => t.value === value),
            (i) => onChange(tabs[i]!.value),
          )
        }
      >
        {tabs.map((t) => (
          <button
            data-nav
            key={t.value}
            type="button"
            role="tab"
            aria-selected={t.value === value}
            tabIndex={t.value === value ? 0 : -1}
            className={`subtab${t.value === value ? ' active' : ''}`}
            onClick={() => onChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {pills && (
        <span className="pill" aria-hidden="true">
          {pills[1]}
        </span>
      )}
    </div>
  );
}
