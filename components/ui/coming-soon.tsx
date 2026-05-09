import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-6 text-center">
      <div className="absolute inset-0 -z-10 bg-aurora opacity-30" />
      
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.08] mb-8">
        <Construction className="h-8 w-8 text-brand-orange-400" />
      </div>
      
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      
      <p className="mb-10 max-w-md text-fg-3 leading-relaxed">
        Estamos trabalhando duro para trazer esta página ao ar. 
        A Agendra está em desenvolvimento ativo e em breve teremos novidades aqui!
      </p>
      
      <Link 
        href="/"
        className="group flex items-center gap-2 rounded-full bg-white/[0.05] border border-white/[0.1] px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/[0.1]"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        Voltar para a Home
      </Link>
    </main>
  );
}
