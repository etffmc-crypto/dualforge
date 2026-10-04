import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PROFILE_IDS } from '@dualforge/shared';
import { useStore } from '../store';
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
    <div className="ptabs" role="tablist" aria-label="Profiles">
      {slots.map(({ id, name }) => {
        const active = id === activeId;
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
              className="ptab-btn"
              title={`${name} — right-click to rename`}
              onClick={() => {
                if (!active)
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
