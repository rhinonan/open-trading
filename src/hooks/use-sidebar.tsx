"use client";

import * as React from "react";

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const toggle = () => setCollapsed((prev) => !prev);
  return (
    <SidebarContext value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext>
  );
}

export function useSidebar() {
  return React.useContext(SidebarContext);
}
