import type { GyroConfig } from '@dualforge/shared';
import { SettingsLayout } from '../components/SettingsLayout';
import { useStore } from '../store';
import { CalibrateSection } from './motion/CalibrateSection';
import { ModeRow, OutputRows } from './motion/MotionRows';
import { MotionSections } from './motion/MotionSections';
import { MotionStage } from './motion/MotionStage';
import '../styles/motion.css';

/** Motion page (GameSir ss1): gyro aim rows on top, shaping sections below, live rotation meter on the stage. */
export function Motion() {
  const gyro = useStore((s) => s.profile?.gyro ?? null);
  const updateProfile = useStore((s) => s.updateProfile);
  if (!gyro) return null; // profile still loading
  const edit = (fn: (g: GyroConfig) => void) => {
    updateProfile((d) => fn(d.gyro));
  };
  const off = gyro.output === 'off';
  return (
    <SettingsLayout
      label="Motion settings"
      panel={
        <>
          <div className="mrows">
            <ModeRow gyro={gyro} edit={edit} />
            {/* everything that only matters while motion aim is on greys out (and stops taking input) when it is off */}
            <fieldset className="mbody" disabled={off}>
              <legend className="sr-only">Motion aim settings</legend>
              <OutputRows gyro={gyro} edit={edit} />
            </fieldset>
          </div>
          <fieldset className="mbody mbody-sections" disabled={off}>
            <legend className="sr-only">Motion shaping</legend>
            <MotionSections gyro={gyro} edit={edit} />
          </fieldset>
          <CalibrateSection bias={gyro.bias} />
        </>
      }
      stage={<MotionStage gyro={gyro} />}
    />
  );
}
