"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const items=[{href:"/",label:"Home",icon:"⌂"},{href:"/hunt",label:"Hunt",icon:"◎"},{href:"/terminal",label:"Terminal",icon:"⌘"},{href:"/portfolio",label:"Portfolio",icon:"◈"},{href:"/more",label:"More",icon:"⋯"}];
export function BottomNav(){const pathname=usePathname();return <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"><div className="mx-auto flex h-16 max-w-5xl items-center justify-around">{items.map(item=>{const active=item.href==="/"?pathname==="/":pathname.startsWith(item.href);return <Link key={item.href} href={item.href} className={cn("flex h-full flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",active?"text-primary":"text-muted-foreground")}><span className="font-mono text-lg leading-none">{item.icon}</span>{item.label}</Link>})}</div></nav>}
