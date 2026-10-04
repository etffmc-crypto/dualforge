import { useStore, type Page } from '../store';
const TABS: { id: Page; label: string }[] = [{ id: 'home', label: 'Home' }, { id: 'inputTest', label: 'Input Test' }];
export function TabStrip() {
  const { page, setPage } = useStore();
  return (
    <nav className="tabstrip">
      <span className="pill">LB</span>
      {TABS.map((t) => (
        <button key={t.id} className={`tab ${page === t.id ? 'active' : ''}`} onClick={() => setPage(t.id)}>{t.label}</button>
      ))}
      <span className="pill">RB</span>
    </nav>
  );
}
