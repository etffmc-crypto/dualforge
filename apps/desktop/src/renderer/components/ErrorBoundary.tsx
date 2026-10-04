import { Component, type ErrorInfo, type PropsWithChildren } from 'react';

interface State { error: unknown }

/** `E_…` code when the error carries one, else the error's name (TypeError, …). */
function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  return error instanceof Error ? error.name : 'Error';
}
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Last line of defence around the whole app: a render error anywhere shows a restart card with what broke, instead of
 * React unmounting everything and leaving a blank window. The card needs no store, IPC or Shell — only its styles in shell.css.
 */
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('Unknown error') };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[renderer crash]', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <section className="crash-card" role="alert" aria-labelledby="crash-title">
          <h1 id="crash-title" className="crash-title">Something went wrong — restart</h1>
          <p className="crash-text">
            DualForge hit an error it could not recover from. Reload the window to carry on; profiles already saved are kept.
          </p>
          <p className="crash-detail">
            <span className="crash-code">{codeOf(error)}</span>
            <span className="crash-msg">{messageOf(error)}</span>
          </p>
          {/* the Shell (and with it gamepad navigation) is gone: focus the way out so Enter / Space work */}
          <button type="button" className="panel-btn primary crash-btn" autoFocus onClick={() => location.reload()}>Reload</button>
        </section>
      </div>
    );
  }
}
