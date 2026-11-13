import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/ui/icons';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Link href="/" className="mb-7 flex items-center gap-2 text-[1.05rem] font-semibold tracking-tight no-underline">
        <LogoMark />
        CampaignLens
      </Link>
      <main className="panel w-full max-w-sm px-6 py-6">{children}</main>
    </div>
  );
}
