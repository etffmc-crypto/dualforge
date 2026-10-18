import { Suspense, lazy } from 'react';
import { Shell } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store';
import { Home } from './pages/Home';
import { Overview } from './pages/Overview';
import './styles/shell.css';
import './styles/pages.css';
import './styles/controls.css';

// secondary pages load on first visit so the first paint ships a smaller bundle
const InputTest = lazy(() => import('./pages/InputTest').then((m) => ({ default: m.InputTest })));
const Sticks = lazy(() => import('./pages/Sticks').then((m) => ({ default: m.Sticks })));
const Triggers = lazy(() => import('./pages/Triggers').then((m) => ({ default: m.Triggers })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Buttons = lazy(() => import('./pages/Buttons').then((m) => ({ default: m.Buttons })));
const Turbo = lazy(() => import('./pages/Turbo').then((m) => ({ default: m.Turbo })));
const Macros = lazy(() => import('./pages/Macros').then((m) => ({ default: m.Macros })));
const Motion = lazy(() => import('./pages/Motion').then((m) => ({ default: m.Motion })));
const Vibrations = lazy(() =>
  import('./pages/Vibrations').then((m) => ({ default: m.Vibrations })),
);
const Lights = lazy(() => import('./pages/Lights').then((m) => ({ default: m.Lights })));
const Profiles = lazy(() => import('./pages/Profiles').then((m) => ({ default: m.Profiles })));
const Health = lazy(() => import('./pages/Health').then((m) => ({ default: m.Health })));

function Page() {
  const page = useStore((s) => s.page);
  switch (page) {
    case 'home':
      return <Home />;
    case 'overview':
      return <Overview />;
    case 'buttons':
      return <Buttons />;
    case 'turbo':
      return <Turbo />;
    case 'settings':
      return <Settings />;
    case 'inputTest':
      return <InputTest />;
    case 'sticks':
      return <Sticks />;
    case 'triggers':
      return <Triggers />;
    case 'motion':
      return <Motion />;
    case 'vibrations':
      return <Vibrations />;
    case 'lights':
      return <Lights />;
    case 'macros':
      return <Macros />;
    case 'profiles':
      return <Profiles />;
    case 'health':
      return <Health />;
  }
}

export default function App() {
  // outermost, so a render error anywhere (a page, a selector, the shell itself) shows the restart card, never a blank window
  return (
    <ErrorBoundary>
      <Shell>
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </Shell>
    </ErrorBoundary>
  );
}
