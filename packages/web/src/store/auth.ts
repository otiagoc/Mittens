import { create } from "zustand";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("mittens_token"),
  isAuthenticated: !!localStorage.getItem("mittens_token"),
  login: (token) => {
    localStorage.setItem("mittens_token", token);
    set({ token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem("mittens_token");
    set({ token: null, isAuthenticated: false });
  },
}));
