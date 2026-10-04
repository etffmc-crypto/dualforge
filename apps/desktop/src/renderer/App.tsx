import { Shell } from './components/Shell';
import { ComingSoon } from './components/ComingSoon';
import { useStore } from './store';
import { Home } from './pages/Home';
import { InputTest } from './pages/InputTest';
import { Sticks } from './pages/Sticks';
import { Triggers } from './pages/Triggers';
import { Settings } from './pages/Settings';
import './styles/shell.css';
import './styles/pages.css';
import './styles/controls.css';

function Page() {
  const page = useStore((s) => s.page);
  switch (page) {
    case 'home': return <Home />;
    case 'overview': return <ComingSoon title="Overview" note="Coming in Plan 3B." />;
    case 'buttons': return <ComingSoon title="Buttons" note="Coming in Plan 3B." />;
    case 'settings': return <Settings />;
    case 'inputTest': return <InputTest />;
    case 'sticks': return <Sticks />;
    case 'triggers': return <Triggers />;
    case 'motion': return <ComingSoon title="Motion" note="Coming in Plan 3." />;
    case 'vibrations': return <ComingSoon title="Vibrations" note="Coming in Plan 3." />;
    case 'lights': return <ComingSoon title="Lights" note="Coming in Plan 3." />;
  }
}

export default function App() {
  return <Shell><Page /></Shell>;
}
