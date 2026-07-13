import React, { useState } from "react";
import { LayoutDashboard, BarChart3, Database, Menu, X, ChevronLeft, ChevronRight, User, Scale } from "lucide-react";
import DanfoodsLogo from "../logo/DanfoodsLogo.tsx";

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
}

interface ShellProps {
  children: React.ReactNode;
  activeModule: string;
  setActiveModule: (module: string) => void;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sales", label: "Sales & Rentabilitet", icon: BarChart3 },
  { id: "tab-vind", label: "Tab / Vind Afstemning", icon: Scale },
  { id: "database", label: "Database Management", icon: Database },
];

export default function Shell({ children, activeModule, setActiveModule }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50/50 overflow-hidden font-sans">
      {/* 1. Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-slate-900 text-slate-400 border-r border-slate-800 transition-all duration-300 relative shrink-0 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Title / Logo Area */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          {!collapsed ? (
            <DanfoodsLogo light={true} className="h-11 w-44" />
          ) : (
            <div className="h-9 w-9 rounded-lg flex items-center justify-center mx-auto bg-brand text-white font-bold transition-all">
              <span className="text-base">😊</span>
            </div>
          )}

          {/* Toggle button */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-slate-800 hover:text-white rounded transition absolute -right-3 top-4.5 bg-slate-900 border border-slate-800 text-slate-400 cursor-pointer"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
          </button>
        </div>

        {/* Sidebar Items navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => {
            const active = activeModule === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 group relative cursor-pointer ${
                  active
                    ? "bg-brand text-white shadow-xs"
                    : "hover:bg-slate-800/60 hover:text-slate-200 text-slate-400"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? "text-white" : "text-slate-500 group-hover:text-slate-300"}`} />
                {!collapsed && <span>{item.label}</span>}

                {/* Collapsed Tooltip */}
                {collapsed && (
                  <span className="absolute left-full ml-4 px-2 py-1 bg-slate-950 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50 pointer-events-none">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 shrink-0">
          {!collapsed ? (
            <div className="space-y-1">
              <p className="font-semibold text-slate-400">V1.0.0 (DMS)</p>
              <p>Food Wholesale Solution</p>
            </div>
          ) : (
            <span className="font-bold">v1</span>
          )}
        </div>
      </aside>

      {/* 2. Mobile Nav Drawer Toggle Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 text-white flex items-center justify-between px-4 z-40">
        <DanfoodsLogo light={true} className="h-10 w-36" />
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-1 text-slate-400 hover:text-white cursor-pointer"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* 3. Mobile Navigation Drawer menu */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-slate-900/90 text-slate-400 pt-20 px-6 space-y-4">
          {SIDEBAR_ITEMS.map((item) => {
            const active = activeModule === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveModule(item.id);
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer ${
                  active ? "bg-brand text-white" : "hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 4. Main App Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden pt-16 md:pt-0">
        {/* Top Header Row */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400">AKTIVT MILJØ:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-brand-light text-brand border border-brand-light uppercase">
              Mock Simulation Active (No sheets auth required)
            </span>
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 text-xs">
            <div className="text-right hidden sm:block">
              <p className="font-semibold text-gray-800">Rasim Studio</p>
              <p className="text-[10px] text-gray-400 font-mono">studiorasim@gmail.com</p>
            </div>
            <div className="p-2 bg-brand-light text-brand rounded-full">
              <User className="h-4 w-4" />
            </div>
          </div>
        </header>

        {/* Inner Content Area */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {children}
        </main>
      </div>
    </div>
  );
}
