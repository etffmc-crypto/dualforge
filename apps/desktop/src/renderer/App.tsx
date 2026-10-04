import { Shell } from './components/Shell';
import { useStore } from './store';
import { Home } from './pages/Home';
import { InputTest } from './pages/InputTest';
import { Sticks } from './pages/Sticks';
import { Triggers } from './pages/Triggers';
import { Settings } from './pages/Settings';
import { Overview } from './pages/Overview';
import { Buttons } from './pages/Buttons';
import { Macros } from './pages/Macros';
import { Motion } from './pages/Motion';
import { Vibrations } from './pages/Vibrations';
import { Lights } from './pages/Lights';
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
    case 'motion': return <Motion />;
    case 'vibrations': return <Vibrations />;
    case 'lights': return <Lights />;
    case 'macros': return <Macros />;
  }
}

export default function App() {
  return <Shell><Page /></Shell>;
}
