import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  clearing: boolean;
};

async function clearRecoverableLocalState() {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // Ignore service worker cleanup failures; reloading can still recover.
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("paperclip-"))
          .map((key) => caches.delete(key)),
      );
    } catch {
      // Ignore cache API failures.
    }
  }
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false, clearing: false };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Paperclip UI failed to render", {
      error,
      info: info.componentStack,
    });
  }

  private reload = () => {
    window.location.reload();
  };

  private clearAndReload = async () => {
    this.setState({ clearing: true });
    await clearRecoverableLocalState();
    window.location.reload();
  };

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background px-4 py-10 text-foreground">
        <section className="mx-auto max-w-xl rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">页面加载失败</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                前端运行时遇到了异常。通常是浏览器里残留的旧缓存或 Service Worker
                导致的；可以先清理可恢复的本地状态再刷新，模型配置会被保留。
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={this.clearAndReload} disabled={this.state.clearing}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {this.state.clearing ? "正在清理..." : "清理本地状态并刷新"}
                </Button>
                <Button variant="outline" onClick={this.reload}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  直接刷新
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
