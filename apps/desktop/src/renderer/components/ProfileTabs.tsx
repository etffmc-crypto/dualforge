import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isFreeSlot, PROFILE_IDS } from '@dualforge/shared';
import { ProTag, useProLocked } from './Pro';
import { useStore } from '../store';
import { onTabKeyDown } from './controls/tabKeys';
import { PencilIcon } from './icons';

const MAX_NAME = 40;

function RenameField({
  initial,
  label,
  onDone,
}: {
  initial: string;
  label: string;
  onDone(name: string | null): void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (!done.current) {
      done.current = true;
      onDone(name);
    }
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    }
  };
  return (
    <input
      data-nav
      ref={ref}
      className="ptab-input"
      aria-label={label}
      value={value}
      maxLength={MAX_NAME}
      spellCheck={false}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={onKey}
      onBlur={() => finish(value)}
    />
  );
}

/** Header slot switcher: click a slot to run it, right-click (or the pencil on the running slot) to rename it in place. */
export function ProfileTabs() {
  const profiles = useStore((s) => s.profiles);
  const activeId = useStore((s) => s.activeProfileId ?? s.settings?.activeProfile ?? null);
  const activate = useStore((s) => s.activateProfile);
  const rename = useStore((s) => s.renameProfile);
  const [editing, setEditing] = useState<string | null>(null);
  const proLocked = useProLocked();
  const goPlan = useStore((s) => s.goPlan);

  const slots = PROFILE_IDS.map((id, i) => ({
    id,
    name: profiles.find((p) => p.id === id)?.name ?? `Profile ${i + 1}`,
  }));
  const commit = (id: string, old: string, raw: string | null) => {
    setEditing(null);
    const name = raw?.trim();
    if (!name || name === old) return;
    void rename(id, name).catch((err: unknown) =>
      useStore.setState({ lastError: { code: 'E_PROFILE_RENAME', msg: String(err) } }),
    );
  };

  return (
    <div
      className="ptabs"
      role="tablist"
      aria-label="Profiles"
      onKeyDown={(e) => {
        const tab = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
        if (!tab) return; // the pencil and the rename field keep their own keys
        const focused = Array.from(e.currentTarget.querySelectorAll('[role="tab"]')).indexOf(tab);
        if (e.key === 'F2') {
          e.preventDefault();
          if (focused >= 0) setEditing(slots[focused]!.id);
          return;
        }
        // arrows only move focus: activating a slot reloads the engine profile, so Enter/Space does that
        onTabKeyDown(e, slots.length, focused, () => {});
      }}
    >
      {slots.map(({ id, name }) => {
        const active = id === activeId;
        const locked = proLocked && !isFreeSlot(id); // slots 3 and 4 on Free: a click opens the Plan card
        if (editing === id) {
          return (
            <span key={id} className={`ptab editing${active ? ' active' : ''}`}>
              <RenameField
                initial={name}
                label={`Rename ${name}`}
                onDone={(v) => commit(id, name, v)}
              />
            </span>
          );
        }
        return (
          <span key={id} className={`ptab${active ? ' active' : ''}`}>
            <button
              data-nav
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className="ptab-btn"
              title={`${name} — right-click or F2 to rename`}
              onClick={() => {
                if (locked && !active) goPlan();
                else if (!active)
                  void activate(id).catch((err: unknown) =>
                    useStore.setState({
                      lastError: { code: 'E_PROFILE_ACTIVATE', msg: String(err) },
                    }),
                  );
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setEditing(id);
              }}
            >
              <span className="ptab-dot" aria-hidden="true" />
              <span className="ptab-name">{name}</span>
              {locked && <ProTag />}
            </button>
            {active && (
              <button
                data-nav
                type="button"
                className="ptab-edit"
                aria-label={`Rename ${name}`}
                title="Rename"
                onClick={() => setEditing(id)}
              >
                <PencilIcon size={12} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
