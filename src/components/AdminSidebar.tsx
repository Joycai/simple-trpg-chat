"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Users, Settings, LogOut, BarChart3, Cpu, Menu, X } from "lucide-react";
import type { ReactNode } from "react";

interface AdminSidebarProps {
  onLogout: () => Promise<void>;
  siteName: string;
}

export function AdminSidebar({ onLogout, siteName }: AdminSidebarProps) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      {/* Mobile Top Header */}
      <header className="md:hidden flex h-14 bg-surface border-b border-border items-center justify-between px-4 shrink-0 z-20 w-full">
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-surface-alt text-text-muted hover:text-text transition-colors"
            aria-label="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-text text-sm">
            {t("sidebarTitle")}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          {t("systemRunning").replace("System", "").trim()}
        </div>
      </header>

      {/* Backdrop overlay for mobile drawer */}
      {isOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 bg-black/40 z-30 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-40 md:z-auto w-56 bg-surface border-r border-border shrink-0 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header inside Sidebar (primarily for desktop or mobile close button) */}
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text tracking-wide">
              {t("sidebarTitle")}
            </h2>
            <p className="text-[10px] text-text-dim mt-1 uppercase tracking-widest">{siteName}</p>
          </div>
          <button
            onClick={closeSidebar}
            className="md:hidden p-1.5 rounded-lg hover:bg-surface-alt text-text-muted hover:text-text transition-colors"
            aria-label="Close Menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Links Navigation */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          <p className="text-[10px] text-text-dim uppercase tracking-widest px-2 mb-1">{t("sectionManagement")}</p>
          
          <SidebarLink
            href="/admin"
            icon={<LayoutDashboard className="w-4 h-4" />}
            label={t("dashboard")}
            active={pathname === "/admin"}
            onClick={closeSidebar}
          />
          <SidebarLink
            href="/admin/users"
            icon={<Users className="w-4 h-4" />}
            label={t("userManagement")}
            active={pathname === "/admin/users"}
            onClick={closeSidebar}
          />
          <SidebarLink
            href="/admin/ai"
            icon={<Cpu className="w-4 h-4" />}
            label={t("aiFeatures")}
            active={pathname === "/admin/ai"}
            onClick={closeSidebar}
          />
          <SidebarLink
            href="/admin/usage"
            icon={<BarChart3 className="w-4.5 h-4.5" />}
            label={t("tokenUsage")}
            active={pathname === "/admin/usage"}
            onClick={closeSidebar}
            isSub={true}
          />
          <SidebarLink
            href="/admin/config"
            icon={<Settings className="w-4 h-4" />}
            label={t("systemConfig")}
            active={pathname === "/admin/config"}
            onClick={closeSidebar}
          />

          <div className="border-t border-border my-3" />
          
          <form action={onLogout}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-all duration-200 text-left cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium">{t("logout")}</span>
            </button>
          </form>
        </nav>

        {/* Footer info inside Sidebar */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            {t("systemRunning")}
          </div>
        </div>
      </aside>
    </>
  );
}

interface SidebarLinkProps {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
  isSub?: boolean;
}

function SidebarLink({ href, icon, label, active, onClick, isSub }: SidebarLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 py-2 rounded-lg transition-all duration-200 ${
        active
          ? "bg-primary/10 text-primary font-bold shadow-sm"
          : "text-text-muted hover:text-text hover:bg-surface-alt"
      } ${isSub ? "pl-9 pr-3 text-xs" : "px-3 text-sm"}`}
    >
      <span className={`flex items-center justify-center ${isSub ? "w-4.5 h-4.5" : "w-5 h-5"}`}>{icon}</span>
      <span className={isSub ? "font-normal" : "font-medium"}>{label}</span>
    </Link>
  );
}
