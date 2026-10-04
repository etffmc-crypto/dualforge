import { Shell } from './components/Shell';
import { ComingSoon } from './components/ComingSoon';
import { useStore } from './store';
import { Home } from './pages/Home';
import { InputTest } from './pages/InputTest';
import { Sticks } from './pages/Sticks';
import { Triggers } from './pages/Triggers';
import './styles/shell.css';
import './styles/pages.css';
import './styles/controls.css';

function Page() {
  const page = useStore((s) => s.page);
  switch (page) {
    case 'home': return <Home />;
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
