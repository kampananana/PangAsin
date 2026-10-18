import React, { Component } from 'react';

// WHAT: A small error boundary for admin routes.
// WHY: A crash in a single admin page (for example a missing chart import) used
//      to blank out the whole screen. This boundary catches the render error,
//      shows the message and a Reload button so a crash is never a white page.
export default class ErrorBoundary extends Component {
  state = { error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="d-flex flex-column align-items-center justify-content-center vh-100 text-center">
          <div className="text-danger mb-3">
            <strong>Something went wrong:</strong> {this.state.error.message}
          </div>
          <div className="text-muted mb-3">{this.state.errorInfo?.componentStack ?? ''}</div>
          <button className="btn btn-primary" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
