import { SettingsLayout, SideTabs } from '../components/SettingsLayout';
import { CurveSection } from './sticks/CurveSection';
import { DeadzoneSections } from './sticks/DeadzoneSections';
import { ShapeSections } from './sticks/ShapeSections';
import { SmoothingSection } from './sticks/SmoothingSection';
import { StickStage } from './sticks/StickStage';
import { useStick } from './sticks/useStick';

export function Sticks() {
  const { side, cfg, edit } = useStick();
  if (!cfg) return null; // profile still loading
  return (
    <SettingsLayout
      label="Stick settings"
      panel={
        <>
          <SideTabs page="sticks" />
          <DeadzoneSections cfg={cfg} edit={edit} />
          <CurveSection side={side} cfg={cfg} edit={edit} />
          <ShapeSections cfg={cfg} edit={edit} />
          <SmoothingSection side={side} cfg={cfg} edit={edit} />
        </>
      }
      stage={<StickStage side={side} cfg={cfg} />}
    />
  );
}
