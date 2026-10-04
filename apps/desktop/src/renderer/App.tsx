import { Shell } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';
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
import { Profiles } from './pages/Profiles';
import { Health } from './pages/Health';
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
    case 'profiles': return <Profiles />;
    case 'health': return <Health />;
  }
}

export default function App() {
  // outermost, so a render error anywhere (a page, a selector, the shell itself) shows the restart card, never a blank window
  return <ErrorBoundary><Shell><Page /></Shell></ErrorBoundary>;
}
