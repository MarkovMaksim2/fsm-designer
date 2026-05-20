import { Component } from "react";

import { Button } from "@/components/ui/button";

/** @extends {Component<{ children: import("react").ReactNode }, { hasError: boolean, message: string }>} */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error) {
      return {
        hasError: true,
        message: error instanceof Error ? error.message : "Неизвестная ошибка интерфейса",
      };
  }

  componentDidCatch(error) {
    console.error("Интерфейс аварийно завершился внутри ErrorBoundary:", error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-shell">
          <section className="error-boundary-card">
            <p className="eyebrow">Восстановление интерфейса</p>
            <h1>Редактор столкнулся с неперехваченной ошибкой интерфейса.</h1>
            <p className="error-boundary-copy">
              Текущее дерево React не смогло завершить рендеринг. Перезагрузи страницу, чтобы
              восстановить работу редактора.
            </p>
            {this.state.message ? (
              <pre className="error-boundary-message">{this.state.message}</pre>
            ) : null}
            <Button onClick={this.handleReload} type="button">
              Перезагрузить интерфейс
            </Button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
