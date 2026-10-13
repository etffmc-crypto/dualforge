import { onTabKeyDown } from './tabKeys';

export interface SubTabsProps<T extends string> {
  tabs: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
  pills?: [string, string];
  /** When set, tabs get ids `<idPrefix>-tab-<value>` and the selected one aria-controls `<idPrefix>-panel`. */
  idPrefix?: string;
}

export const subTabId = (prefix: string, v: string) => `${prefix}-tab-${v}`;
export const subPanelId = (prefix: string) => `${prefix}-panel`;

/**
 * Text tabs inside a settings panel, flanked by shoulder-button pills; active tab gets a 2px accent underline.
 * `data-subtabs` lets gamepad navigation step them (L2/R2 on a page, L1/R1 inside a dialog).
 */
export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
  pills,
  idPrefix,
}: SubTabsProps<T>) {
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
            id={idPrefix ? subTabId(idPrefix, t.value) : undefined}
            aria-selected={t.value === value}
            aria-controls={idPrefix && t.value === value ? subPanelId(idPrefix) : undefined}
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
