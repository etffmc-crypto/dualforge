import { Shell } from './components/Shell';
import { useStore } from './store';
import { Home } from './pages/Home';
import { InputTest } from './pages/InputTest';
import './styles/shell.css';
import './styles/pages.css';
export default function App() {
  const page = useStore((s) => s.page);
  return <Shell>{page === 'home' ? <Home /> : <InputTest />}</Shell>;
}
