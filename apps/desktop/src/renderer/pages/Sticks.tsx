import { useState } from 'react';
import { CalibrationWizard } from '../components/CalibrationWizard';
import { SettingsLayout, SideTabs } from '../components/SettingsLayout';
import type { Side } from '../store';
import { CurveSection } from './sticks/CurveSection';
import { DeadzoneSections } from './sticks/DeadzoneSections';
import { ShapeSections } from './sticks/ShapeSections';
import { SmoothingSection } from './sticks/SmoothingSection';
import { StickStage } from './sticks/StickStage';
import { useStick } from './sticks/useStick';

export function Sticks() {
  const { side, cfg, edit } = useStick();
  // the side is pinned when the wizard opens, so LT/RT sub-tab switching can't retarget a calibration in progress
  const [calibrating, setCalibrating] = useState<Side | null>(null);
  if (!cfg) return null; // profile still loading
  const calibrate = (
    <button data-nav type="button" className="panel-btn" onClick={() => setCalibrating(side)}>
      Calibrate…
    </button>
  );
  return (
    <>
      <SettingsLayout
        label="Stick settings"
        panel={
          <>
            <SideTabs page="sticks" />
            <DeadzoneSections cfg={cfg} edit={edit} />
            <CurveSection side={side} cfg={cfg} edit={edit} />
            <ShapeSections cfg={cfg} edit={edit} extra={calibrate} />
            <SmoothingSection side={side} cfg={cfg} edit={edit} />
          </>
        }
        stage={<StickStage side={side} cfg={cfg} />}
      />
      {calibrating && <CalibrationWizard side={calibrating} onClose={() => setCalibrating(null)} />}
    </>
  );
}
