import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportError } from '../../lib/errorReporter';

interface Props { children: React.ReactNode; resetKey?: string }
interface State { error: Error | null }

/** A crash inside one page shows a message here instead of blanking the whole application. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
    reportError(error, 'boundary', { component: (info.componentStack ?? '').split('\n').filter(Boolean).slice(0, 3).join(' < ').slice(0, 300) });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="max-w-lg mx-auto mt-16 p-6 rounded-2xl border border-rose-200 bg-rose-50 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
        <h2 className="text-base font-bold text-rose-800">This page hit an unexpected error</h2>
        <p className="text-xs text-rose-700">{this.state.error.message}</p>
        <button className="px-4 py-1.5 rounded-full bg-[#086343] text-white text-xs font-bold cursor-pointer" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
