'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

// Default error fallback component
interface ErrorFallbackProps {
  error?: Error;
  onReset?: () => void;
  title?: string;
  message?: string;
}

export function ErrorFallback({
  error,
  onReset,
  title = 'Something went wrong',
  message = 'We encountered an unexpected error. Please try again.',
}: ErrorFallbackProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center"
      role="alert"
    >
      <div className="w-16 h-16 mb-4 rounded-full bg-error/10 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-error"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-muted mb-4 max-w-md">{message}</p>

      {process.env.NODE_ENV === 'development' && error && (
        <details className="mb-4 text-left max-w-md w-full">
          <summary className="cursor-pointer text-sm text-muted hover:text-foreground">
            Error details
          </summary>
          <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto">
            {error.message}
            {error.stack && (
              <>
                {'\n\n'}
                {error.stack}
              </>
            )}
          </pre>
        </details>
      )}

      <div className="flex gap-3">
        {onReset && (
          <button
            onClick={onReset}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}

// Smaller inline error component
export function InlineError({
  message = 'Failed to load',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-3 bg-error/10 text-error rounded-lg text-sm">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs font-medium underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// Empty state component
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center text-2xl">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-muted text-sm mb-4 max-w-sm">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
