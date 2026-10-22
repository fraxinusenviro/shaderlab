import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Modal = null | 'export' | 'settings' | 'new' | 'about' | 'saveAs' | 'shortcuts';
export type BottomTab = 'code' | 'console' | 'history' | 'timeline' | 'constants' | 'info';
export type RightTab = 'params' | 'mutate' | 'modulate' | 'channels';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'warn';
  text: string;
  action?: { label: string; run: () => void };
}

interface UIState {
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  bottomTab: BottomTab;
  rightTab: RightTab;
  modal: Modal;
  toasts: Toast[];
  /** Mobile drawer currently shown. */
  mobilePanel: null | 'library' | 'controls' | 'code';
  set: (patch: Partial<Omit<UIState, 'set' | 'toast' | 'dismiss'>>) => void;
  toast: (kind: Toast['kind'], text: string, action?: Toast['action']) => void;
  dismiss: (id: number) => void;
}

let toastId = 1;

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      leftOpen: true,
      rightOpen: true,
      bottomOpen: true,
      leftWidth: 260,
      rightWidth: 320,
      bottomHeight: 300,
      bottomTab: 'code',
      rightTab: 'params',
      modal: null,
      toasts: [],
      mobilePanel: null,
      set: (patch) => set(patch),
      toast: (kind, text, action) => {
        const id = toastId++;
        set({ toasts: [...get().toasts.slice(-4), { id, kind, text, action }] });
        setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 4500);
      },
      dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    }),
    {
      name: 'shader-forge:ui',
      version: 1,
      partialize: (s) => ({ leftOpen: s.leftOpen, rightOpen: s.rightOpen, bottomOpen: s.bottomOpen, leftWidth: s.leftWidth, rightWidth: s.rightWidth, bottomHeight: s.bottomHeight, bottomTab: s.bottomTab, rightTab: s.rightTab }),
    },
  ),
);

export const toast = (kind: Toast['kind'], text: string, action?: Toast['action']) => useUI.getState().toast(kind, text, action);
