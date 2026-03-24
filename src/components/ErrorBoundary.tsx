import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if ((this as any).state.hasError) {
      let errorMessage = 'Ocorreu um erro inesperado.';
      
      try {
        const parsedError = JSON.parse((this as any).state.error?.message || '');
        if (parsedError.error && parsedError.error.includes('insufficient permissions')) {
          errorMessage = 'Você não tem permissão para realizar esta ação ou acessar estes dados.';
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-6">
          <div className="max-w-md w-full bg-white rounded-[32px] p-12 shadow-sm text-center border border-zinc-100">
            <h2 className="text-2xl font-bold display-font text-black mb-4">Ops! Algo deu errado.</h2>
            <p className="text-zinc-500 mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-orange-500 text-white rounded-2xl py-4 font-bold hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/20"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
