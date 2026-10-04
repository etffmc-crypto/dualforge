import { useEffect, type PropsWithChildren } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { useStore } from '../store';
export function Shell({ children }: PropsWithChildren) {
  const { subscribe, loadProfile } = useStore();
  useEffect(() => { void loadProfile(); return subscribe(); }, [subscribe, loadProfile]);
  return <div className="app"><Header /><main className="body">{children}</main><Footer /></div>;
}
