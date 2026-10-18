import React from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "#1e1e1e",
            color: "#f5f5f5",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 13,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>문제가 발생했습니다</h2>
          <p style={{ margin: 0, color: "#b3b3b3", maxWidth: 480 }}>
            {this.state.error.message}
          </p>
          <p style={{ margin: 0, color: "#b3b3b3", maxWidth: 480 }}>
            문서는 브라우저 자동 저장에 남아 있습니다. 새로고침하면 복원됩니다. 최근
            내보내기 파일이 있으면 가져오기로 복구할 수 있습니다.
          </p>
          <button onClick={() => window.location.reload()}>새로고침</button>
        </div>
      );
    }
    return this.props.children;
  }
}
