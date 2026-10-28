"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";

export type UserSession = {
  userId: string;
  name: string;
  email: string;
  role: string;
  roleKey: string;
  schoolId: string | null;
  directorateId: string | null;
  isActive: boolean;
  isLocked: boolean;
  permissions: Record<string, unknown>;
} | null;

type SessionContextType = {
  user: UserSession;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionCtx = createContext<SessionContextType | null>(null);
const ToastCtx = createContext<{
  toasts: Toast[];
  add: (o: Omit<Toast, "id">) => void;
  remove: (id: string) => void;
} | null>(null);

type Toast = { id: string; type: "success" | "error" | "info"; message: string };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (mounted) setUser(data.user ?? null);
        } else if (mounted) setUser(null);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: data.message || "فشل تسجيل الدخول" };
    }
    await fetchSession();
    return { ok: true, message: data.message };
  }, []);

  const fetchSession = async () => {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setUser(data.user ?? null);
    } else {
      setUser(null);
    }
  };

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    await fetchSession();
  }, []);

  return (
    <SessionCtx.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((o: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { ...o, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const remove = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <ToastCtx.Provider value={{ toasts, add, remove }}>
      {children}
      <div className="fixed bottom-5 left-5 rtl:left-auto rtl:right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white shadow-lg min-w-[300px] ${
              t.type === "success"
                ? "bg-navy border-l-4 border-success"
                : t.type === "error"
                ? "bg-navy border-l-4 border-danger"
                : "bg-navy border-l-4 border-turquoise"
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="ml-auto opacity-60 hover:opacity-100"
              aria-label="إغلاق الإشعار"
            >
                            ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
