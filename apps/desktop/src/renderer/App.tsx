import { Shell } from './components/Shell';
import { ComingSoon } from './components/ComingSoon';
import { useStore } from './store';
import { Home } from './pages/Home';
import { InputTest } from './pages/InputTest';
import { Sticks } from './pages/Sticks';
import { Triggers } from './pages/Triggers';
import { Settings } from './pages/Settings';
import { Overview } from './pages/Overview';
import { Buttons } from './pages/Buttons';
import './styles/shell.css';
import './styles/pages.css';
import './styles/controls.css';

function Page() {
  const page = useStore((s) => s.page);
  switch (page) {
    case 'home': return <Home />;
    case 'overview': return <Overview />;
    case 'buttons': return <Buttons />;
    case 'settings': return <Settings />;
    case 'inputTest': return <InputTest />;
    case 'sticks': return <Sticks />;
    case 'triggers': return <Triggers />;
    case 'motion': return <ComingSoon title="Motion" note="Coming in Plan 3." />;
    case 'vibrations': return <ComingSoon title="Vibrations" note="Coming in Plan 3." />;
    case 'lights': return <ComingSoon title="Lights" note="Coming in Plan 3." />;
    case 'macros': return <ComingSoon title="Macros" note="Coming in Plan 3B." />;
  }
}

export default function App() {
  return <Shell><Page /></Shell>;
}
