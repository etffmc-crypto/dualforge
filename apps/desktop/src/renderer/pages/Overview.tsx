import { useId, type ComponentType, type PropsWithChildren, type ReactNode } from 'react';
import type { Profile, StickConfig, TriggerConfig } from '@dualforge/shared';
import { DualSenseTop } from '../art/DualSenseTop';
import { Battery } from '../components/Battery';
import { DualRangeSlider } from '../components/controls/DualRangeSlider';
import { CurvePreview } from '../components/controls/CurvePreview';
import { HueSlider } from '../components/controls/HueSlider';
import { RangeSlider } from '../components/controls/RangeSlider';
import { SectionLabel } from '../components/controls/SectionLabel';
import { Segmented } from '../components/controls/Segmented';
import { PRESET_LABELS, presetPreview, previewPoints } from '../components/LiveCurve';
import { ButtonsIcon, ChevronRightIcon, LightsIcon, MotionIcon, SticksIcon, TriggersIcon } from '../components/icons';
import { useStore, type Page, type Side } from '../store';
import { DS_LABEL, hueOf, mappingChips, rgbOfHue } from './overview/format';

const MAX_CHIPS = 8;
const MIN_LIVE_RANGE = 0.05; // same guard as the Sticks page: keeps `center < 1 - outer`
const tidy = (v: number) => Math.round(v * 1e6) / 1e6;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const num = (v: number) => String(Number(v.toFixed(2)));

type Lights = Profile['lights'];
const MODES: { value: Lights['mode']; label: string }[] = [
  { value: 'off', label: 'Off' }, { value: 'static', label: 'Static' }, { value: 'breathing', label: 'Breathing' },
  { value: 'rainbow', label: 'Rainbow' }, { value: 'battery', label: 'Battery' },
];
const BRIGHTNESS: { value: '2' | '1' | '0'; label: string }[] = [
  { value: '2', label: 'Low' }, { value: '1', label: 'Medium' }, { value: '0', label: 'High' }, // DualSense: 0 is brightest
];

/** One dashboard tile: icon + title, and a chevron that opens the full page. */
function OvCard({ area, title, Icon, page, children }: PropsWithChildren<{ area: string; title: string; Icon: ComponentType<{ size?: number }>; page: Page }>) {
  const id = useId();
  const setPage = useStore((s) => s.setPage);
  return (
    <section className={`ov-card ov-${area}`} aria-labelledby={id}>
      <header className="ov-head">
        <Icon size={18} />
        <h3 id={id} className="ov-title">{title}</h3>
        <button type="button" className="ov-open" aria-label={`Open ${title}`} title={`Open ${title}`} onClick={() => setPage(page)}>
          <ChevronRightIcon size={18} />
        </button>
      </header>
      <div className="ov-body">{children}</div>
    </section>
  );
}

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="ov-row">
      <span className="ov-row-label">{label}</span>
      <span className="ov-pill" data-testid={testId}>{children}</span>
    </div>
  );
}

function LightsCard({ lights, edit }: { lights: Lights; edit(fn: (l: Lights) => void): void }) {
  return (
    <OvCard area="lights" title="Lights" Icon={LightsIcon} page="lights">
      <SectionLabel>Animation</SectionLabel>
      <div className="ov-modes"><Segmented label="Light animation" options={MODES} value={lights.mode} onChange={(mode) => edit((l) => { l.mode = mode; })} /></div>
      <SectionLabel>Color</SectionLabel>
      <div className="ov-indent"><HueSlider ariaLabel="Light color" value={hueOf(lights)} onChange={(h) => edit((l) => { Object.assign(l, rgbOfHue(h)); })} /></div>
      <SectionLabel>Brightness</SectionLabel>
      <div className="ov-indent">
        <Segmented label="Light brightness" options={BRIGHTNESS} value={String(lights.brightness) as '0' | '1' | '2'} onChange={(v) => edit((l) => { l.brightness = Number(v); })} />
      </div>
    </OvCard>
  );
}

function MotionCard({ gyro }: { gyro: Profile['gyro'] }) {
  const on = gyro.output !== 'off';
  const activate = gyro.activate === 'always' || !gyro.activateButton
    ? 'Always'
    : `${gyro.activate === 'hold' ? 'Hold' : 'Toggle'} ${DS_LABEL[gyro.activateButton]}`;
  return (
    <OvCard area="motion" title="Motion" Icon={MotionIcon} page="motion">
      <Row label="Motion mode" testId="motion-mode">{on ? 'Aim' : 'Off'}</Row>
      <Row label="Output" testId="motion-output">{gyro.output === 'mouse' ? 'Mouse' : gyro.output === 'rightStick' ? 'Right stick' : 'None'}</Row>
      <Row label="Activate method" testId="motion-activate">{activate}</Row>
      <Row label="Sensitivity X / Y" testId="motion-sens">{`${num(gyro.sensitivityX)}× / ${num(gyro.sensitivityY)}×`}</Row>
      <Row label="Curve">{PRESET_LABELS[gyro.curve]}</Row>
    </OvCard>
  );
}

const HAIR = (t: TriggerConfig) => (t.hairTrigger.mode === 'adaptive' ? `Adaptive ${t.hairTrigger.value}%` : t.hairTrigger.mode === 'fixed' ? 'Fixed' : 'Off');
const EFFECT: Record<TriggerConfig['effect']['mode'], string> = { off: 'Off', resistance: 'Resistance', section: 'Section', vibration: 'Vibration' };

function TriggerSummary({ side, t }: { side: Side; t: TriggerConfig }) {
  return (
    <div className="ov-side" data-testid={`trigger-${side}`}>
      <span className="ov-rail" aria-hidden="true">{side === 'left' ? 'LT' : 'RT'}</span>
      <div className="ov-side-body">
        {t.digital ? (
          <div className="ov-digital">
            <span className="ov-badge">Digital</span>
            <span className="ov-note">Click trigger: a press sends a full pull.</span>
          </div>
        ) : (
          <>
            <div className="ov-kv"><span>Deadzone</span><span>{`${Math.round(t.deadzone.initial * 100)}–${pct(t.deadzone.max)}`}</span></div>
            <div className="ov-kv"><span>Hair trigger</span><span>{HAIR(t)}</span></div>
            <div className="ov-kv"><span>Effect</span><span>{EFFECT[t.effect.mode]}</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function StickColumn({ side, cfg, edit }: { side: Side; cfg: StickConfig; edit(fn: (c: StickConfig) => void): void }) {
  const name = side === 'left' ? 'Left stick' : 'Right stick';
  const dz = cfg.deadzone;
  const points = cfg.curve.kind === 'preset' ? presetPreview(cfg.curve.preset) : previewPoints(cfg.curve.points);
  return (
    <div className="ov-stick">
      <span className="ov-rail" aria-hidden="true">{side === 'left' ? 'L' : 'R'}</span>
      <div className="ov-stick-body">
        <span className="ov-label">Deadzone <em>{pct(dz.center)}–{pct(1 - dz.outer)}</em></span>
        <DualRangeSlider
          label={`${name} deadzone`} lo={dz.center} hi={tidy(1 - dz.outer)} minGap={MIN_LIVE_RANGE}
          onChange={(lo, hi) => edit((c) => { c.deadzone.center = lo; c.deadzone.outer = tidy(1 - hi); })}
        />
        <span className="ov-label">Anti-deadzone <em>{pct(dz.anti)}</em></span>
        <RangeSlider ariaLabel={`${name} anti-deadzone`} min={0} max={0.5} step={0.01} value={dz.anti} onChange={(v) => edit((c) => { c.deadzone.anti = v; })} />
        <div className="ov-curve">
          <CurvePreview points={points} size={76} />
          <span className="ov-note">{cfg.curve.kind === 'preset' ? PRESET_LABELS[cfg.curve.preset] : 'Custom'} curve</span>
        </div>
      </div>
    </div>
  );
}

function ButtonsCard({ profile }: { profile: Profile }) {
  const setPage = useStore((s) => s.setPage);
  const chips = mappingChips(profile);
  const shown = chips.slice(0, MAX_CHIPS);
  const more = chips.length - shown.length;
  return (
    <OvCard area="buttons" title="Buttons" Icon={ButtonsIcon} page="buttons">
      {chips.length === 0 ? (
        <div className="ov-empty">
          <p className="ov-note">Every button sends its standard Xbox input.</p>
          <button type="button" className="panel-btn" onClick={() => setPage('buttons')}>Remap buttons</button>
        </div>
      ) : (
        <ul className="ov-maps">
          {shown.map(({ button, text }) => {
            const [src, dst] = text.split(' ▸ ');
            return (
              <li key={button}>
                <button type="button" className="map-chip" aria-label={text} title={`Edit ${DS_LABEL[button]}`} onClick={() => setPage('buttons')}>
                  <span className="map-src">{src}</span><span className="map-arrow"> ▸ </span><span className="map-dst">{dst}</span>
                </button>
              </li>
            );
          })}
          {more > 0 && <li><button type="button" className="map-more" onClick={() => setPage('buttons')}>+{more} more</button></li>}
        </ul>
      )}
    </OvCard>
  );
}

/** Landing dashboard (GameSir ss2): five summary tiles around the live pad render. */
export function Overview() {
  const profile = useStore((s) => s.profile);
  const s = useStore((st) => st.snapshot);
  const updateProfile = useStore((st) => st.updateProfile);
  if (!profile) return null; // still loading
  const connected = s?.connected ?? false;
  return (
    <div className="overview">
      <LightsCard lights={profile.lights} edit={(fn) => updateProfile((d) => fn(d.lights))} />

      <div className="ov-stage">
        <div className="ov-pad">
          <DualSenseTop
            pressed={s?.raw.buttons ?? {}} lightbar={profile.lights}
            sticks={s ? { lx: s.raw.lx, ly: s.raw.ly, rx: s.raw.rx, ry: s.raw.ry } : undefined}
            playerLeds={profile.lights.playerLeds}
          />
        </div>
        <h2 className="home-name ov-name">DUALSENSE {connected && s && <Battery percent={s.battery.percent} charging={s.battery.state === 'charging'} />}</h2>
        <p className="ov-status">{connected ? `Connected · USB · ${profile.name}` : 'Not connected'}</p>
      </div>

      <MotionCard gyro={profile.gyro} />

      <OvCard area="triggers" title="Triggers" Icon={TriggersIcon} page="triggers">
        <TriggerSummary side="left" t={profile.triggers.left} />
        <TriggerSummary side="right" t={profile.triggers.right} />
      </OvCard>

      <OvCard area="sticks" title="Sticks" Icon={SticksIcon} page="sticks">
        <div className="ov-stick-cols">
          {(['left', 'right'] as const).map((side) => (
            <StickColumn key={side} side={side} cfg={profile.sticks[side]} edit={(fn) => updateProfile((d) => fn(d.sticks[side]))} />
          ))}
        </div>
      </OvCard>

      <ButtonsCard profile={profile} />
    </div>
  );
}
