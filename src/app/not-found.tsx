import Link from 'next/link';
import { LogoMark } from '@/components/ui/icons';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <LogoMark size={28} />
      <h1 className="display mt-4 text-[1.6rem]">Page not found</h1>
      <p className="muted mt-2 text-[0.95rem]">This page does not exist, or it belongs to a workspace you do not have access to.</p>
      <Link href="/clients" className="btn btn-primary mt-5">
        Go to your clients
      </Link>
    </main>
  );
}
