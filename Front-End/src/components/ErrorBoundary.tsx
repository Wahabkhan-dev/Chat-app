"use client";

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production replace with your error-reporting service (Sentry, etc.)
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center gap-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            This section crashed unexpectedly. Try refreshing the page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
