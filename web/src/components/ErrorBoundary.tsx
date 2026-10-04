/**
 * If something on the page throws while drawing (a bug, or data the page did not expect),
 * say so and offer a reload — instead of leaving a blank page with no way forward.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[page]", error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="flex max-w-md flex-col items-center gap-3 rounded-2xl bg-surface p-8 text-center shadow-soft">
          <div className="text-xl font-bold">Something on the page went wrong</div>
          <div className="text-mute">Reloading usually fixes it. If it keeps happening, the links file may hold something the page can't draw — restart App Router, which tidies the file's entries when it starts.</div>
          <div className="break-words font-mono text-[12.5px] text-faint">{this.state.error.message}</div>
          <div className="flex flex-wrap justify-center gap-2">
            <a href="#/settings" onClick={() => this.setState({ error: null })} className="inline-flex h-11 items-center rounded-[10px] border border-line-2 bg-surface px-4 font-semibold text-ink no-underline hover:bg-surface-2">Open Settings</a>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 cursor-pointer items-center rounded-[10px] bg-accent px-4 font-semibold text-accent-ink">Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
