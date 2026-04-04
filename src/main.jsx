import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('CLARK Error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        style: { padding: 40, textAlign: 'center', fontFamily: 'Cairo, sans-serif', direction: 'rtl' }
      },
        React.createElement('h1', { style: { color: '#EF4444', marginBottom: 16 } }, '⚠️ حدث خطأ'),
        React.createElement('pre', { style: { color: '#64748B', marginBottom: 16, whiteSpace: 'pre-wrap', fontSize: 12, background: '#F8FAFC', padding: 16, borderRadius: 8, textAlign: 'left', direction: 'ltr' } }, String(this.state.error?.message || this.state.error)),
        React.createElement('button', {
          onClick: () => window.location.reload(),
          style: { padding: '10px 24px', borderRadius: 8, background: '#0EA5E9', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }
        }, 'اعادة تحميل')
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null, React.createElement(App))
)
