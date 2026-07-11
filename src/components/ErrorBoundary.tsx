import { Component, ErrorInfo, ReactNode } from 'react';

// Catches any render-time crash in the tree below and shows the error instead
// of an unexplained white screen. Without this, a throw in any page component
// (or in a module) leaves an empty #root — exactly the blank-screen trap that
// made the first deploy hard to diagnose.
type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console so F12 shows the stack, not just a blank page.
    console.error('Admin crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="login-wrap">
          <div className="login">
            <div className="brand">
              <div className="brand-mark">T</div>
              <div>
                <h1>Transformica</h1>
                <span>Admin console</span>
              </div>
            </div>
            <div className="error-box">
              Something went wrong loading the panel.
              <br />
              <code>{this.state.error.message}</code>
            </div>
            <button className="btn ghost" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
