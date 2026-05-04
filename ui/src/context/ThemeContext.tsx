import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "paperclip.theme";
const DARK_THEME_COLOR = "#111111";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveThemeFromDocument(): Theme {
  return "dark";
}

function applyTheme(_theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("dark");
  root.style.colorScheme = "dark";
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta instanceof HTMLMetaElement) {
    themeColorMeta.setAttribute("content", DARK_THEME_COLOR);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveThemeFromDocument());

  const setTheme = useCallback((_nextTheme: Theme) => {
    setThemeState("dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState("dark");
  }, []);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
    } catch {
      // Ignore local storage write failures in restricted environments.
    }
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
