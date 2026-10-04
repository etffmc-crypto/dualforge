import { useState, type FormEvent } from 'react';
import { MAX_AUTO_SWITCH_RULES, MAX_EXE_LENGTH, type Settings } from '@dualforge/shared';
import { Segmented } from '../../components/controls/Segmented';
import { TrashIcon } from '../../components/icons';
import { useStore } from '../../store';
import { PickGameModal } from './PickGameModal';
import { slotOptions, type Slot } from './slots';

type Rule = Settings['autoSwitch'][number];

/** Why `exe` can't be added, or null when it can. `exe` is already trimmed and lowercased. */
export function exeProblem(exe: string, rules: readonly Rule[]): string | null {
  if (!exe) return 'Type the game’s program name, e.g. eldenring.exe, or pick it from the running programs.';
  if (!exe.endsWith('.exe') || exe === '.exe') return 'The program name must end in .exe, e.g. eldenring.exe.';
  if (/[\\/:*?"<>|]/.test(exe)) return 'Use the program’s file name only, without a folder.';
  if (exe.length > MAX_EXE_LENGTH) return `Program names can be at most ${MAX_EXE_LENGTH} characters.`;
  if (rules.some((r) => r.exe.toLowerCase() === exe)) return `${exe} already has a rule. Remove it first to change its profile.`;
  return null;
}

/** Per-game auto-switch rules (settings.autoSwitch): while the exe is in front, the engine runs its profile. */
export function AutoSwitchCard({ slots }: { slots: Slot[] }) {
  const rules = useStore((s) => s.settings?.autoSwitch ?? []);
  const updateSettings = useStore((s) => s.updateSettings);
  const [exe, setExe] = useState('');
  const [profileId, setProfileId] = useState<Rule['profileId']>(slots[1]!.id);
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const full = rules.length >= MAX_AUTO_SWITCH_RULES;
  const nameOf = (id: string) => slots.find((s) => s.id === id)?.name ?? id;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = exe.trim().toLowerCase();
    const p = exeProblem(name, rules);
    if (p) { setProblem(p); return; }
    setProblem(null);
    setExe('');
    void updateSettings({ autoSwitch: [...rules, { exe: name, profileId }] });
  };
  const remove = (r: Rule) => void updateSettings({ autoSwitch: rules.filter((x) => x !== r) });

  return (
    <section className="pf-card" aria-labelledby="pf-auto">
      <h3 id="pf-auto" className="pf-heading">Auto-switch</h3>
      <p className="psec-hint">While one of these games is in front, DualForge runs its profile. Switch away and your active profile comes back.</p>
      <table className="as-table">
        <thead><tr><th scope="col">Game executable</th><th scope="col">Profile</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>
          {rules.length === 0 && <tr><td colSpan={3} className="as-empty">No games yet. Add one below.</td></tr>}
          {rules.map((r) => (
            <tr key={r.exe} aria-label={`${r.exe} → ${nameOf(r.profileId)}`}>
              <td className="as-exe">{r.exe}</td>
              <td><span className="as-profile"><span className="as-arrow" aria-hidden="true">→</span>{nameOf(r.profileId)}</span></td>
              <td className="as-act">
                <button type="button" className="step-icon danger" aria-label={`Remove rule for ${r.exe}`} title="Remove" onClick={() => remove(r)}>
                  <TrashIcon size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="as-add" onSubmit={add} noValidate>
        <div className="as-exe-row">
          <input
            className="pf-input mono-in" aria-label="Game executable" placeholder="game.exe" value={exe} maxLength={MAX_EXE_LENGTH + 16}
            spellCheck={false} disabled={full} onChange={(e) => { setExe(e.currentTarget.value); setProblem(null); }}
          />
          <button type="button" className="panel-btn" disabled={full} onClick={() => setPicking(true)}>Pick running game</button>
        </div>
        <span className="pf-field-label" aria-hidden="true">Runs profile</span>
        <Segmented label="Profile for this game" options={slotOptions(slots)} value={profileId} onChange={(v) => setProfileId(v)} />
        <div className="pf-line">
          {problem
            ? <span className="pf-err" role="alert">{problem}</span>
            : <span className="psec-hint">{full ? `${MAX_AUTO_SWITCH_RULES} rules is the limit. Remove one to add another.` : `${rules.length} of ${MAX_AUTO_SWITCH_RULES} rules`}</span>}
          <button type="submit" className="panel-btn primary" disabled={full}>Add rule</button>
        </div>
      </form>
      {picking && (
        <PickGameModal
          taken={new Set(rules.map((r) => r.exe.toLowerCase()))} onClose={() => setPicking(false)}
          onPick={(n) => { setExe(n); setProblem(null); setPicking(false); }}
        />
      )}
    </section>
  );
}
