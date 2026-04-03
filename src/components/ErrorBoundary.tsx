import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Brain, RefreshCw } from 'lucide-react'

interface Props  { children: ReactNode }
interface State  { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SPPS ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Brain size={28} className="text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-1">An unexpected error occurred in the application.</p>
            {this.state.message && (
              <p className="text-xs font-mono bg-gray-100 rounded-lg px-3 py-2 text-red-600 mt-3 text-left break-all">
                {this.state.message}
              </p>
            )}
            <button
              onClick={() => { this.setState({ hasError: false, message: '' }); window.location.href = '/dashboard' }}
              className="mt-6 inline-flex items-center gap-2 bg-gradient-spps text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={15} /> Back to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
