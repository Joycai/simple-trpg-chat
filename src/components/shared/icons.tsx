"use client";

import {
  User, Package, Ticket, Bot, Crosshair, Settings, BarChart3,
  Users, Info, Lock, Download, Dices, ClipboardList, Key,
  Trash2, Pencil, X, Menu, ArrowLeft, LogOut, FileText,
  Heart, Clover, Ruler, Home, Wand, Search, Plus, Zap, Skull, Image,
  ImagePlus, MessageSquareLock, EyeOff, Loader2, Send, Minus, ChevronDown,
  Copy, SlidersHorizontal, Navigation, MessageSquare, Check, CheckCheck,
  Target, Eye, Droplet, Braces, Clock,
  HelpCircle, AlertTriangle, UserPlus, CheckSquare,
  type LucideIcon,
} from "lucide-react";

interface IconProps {
  className?: string;
}

const wrap = (Icon: LucideIcon) => {
  const Component = ({ className }: IconProps) => <Icon className={className || "w-5 h-5"} />;
  Component.displayName = Icon.displayName || Icon.name;
  return Component;
};

export const Icons = {
  User: wrap(User),
  Package: wrap(Package),
  Ticket: wrap(Ticket),
  Bot: wrap(Bot),
  Crosshair: wrap(Crosshair),
  Settings: wrap(Settings),
  BarChart3: wrap(BarChart3),
  Users: wrap(Users),
  Info: wrap(Info),
  Lock: wrap(Lock),
  Download: wrap(Download),
  Dices: wrap(Dices),
  ClipboardList: wrap(ClipboardList),
  Key: wrap(Key),
  Trash2: wrap(Trash2),
  Pencil: wrap(Pencil),
  X: wrap(X),
  Menu: wrap(Menu),
  ArrowLeft: wrap(ArrowLeft),
  LogOut: wrap(LogOut),
  FileText: wrap(FileText),
  Heart: wrap(Heart),
  Clover: wrap(Clover),
  Ruler: wrap(Ruler),
  Home: wrap(Home),
  Wand: wrap(Wand),
  Search: wrap(Search),
  Plus: wrap(Plus),
  Zap: wrap(Zap),
  Skull: wrap(Skull),
  Image: wrap(Image),
  ImagePlus: wrap(ImagePlus),
  MessageSquareLock: wrap(MessageSquareLock),
  EyeOff: wrap(EyeOff),
  Loader2: wrap(Loader2),
  Send: wrap(Send),
  Minus: wrap(Minus),
  ChevronDown: wrap(ChevronDown),
  Copy: wrap(Copy),
  SlidersHorizontal: wrap(SlidersHorizontal),
  Navigation: wrap(Navigation),
  MessageSquare: wrap(MessageSquare),
  Check: wrap(Check),
  CheckCheck: wrap(CheckCheck),
  Target: wrap(Target),
  Eye: wrap(Eye),
  Droplet: wrap(Droplet),
  Braces: wrap(Braces),
  Clock: wrap(Clock),
  HelpCircle: wrap(HelpCircle),
  AlertTriangle: wrap(AlertTriangle),
  UserPlus: wrap(UserPlus),
  CheckSquare: wrap(CheckSquare),
};
