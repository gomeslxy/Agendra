import { motion } from 'framer-motion';
import type { ProviderStat, ChainStat } from '../reports-client';

export function ProviderHealthSection({ providerStats, chainStats }: { providerStats: ProviderStat[]; chainStats: ChainStat[] }) {
  return (
    <motion.div
      className="border border-[#E4E4E7] bg-white rounded-2xl p-5 mb-6 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="mb-4 text-lg font-semibold text-[#09090B]">Saúde dos Provedores</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {providerStats.map((p) => (
          <div key={p.provider} className="border border-[#E4E4E7] bg-[#FAFAFA] rounded-xl p-4 flex flex-col gap-2">
            <h3 className="text-md font-medium text-[#09090B] capitalize">{p.provider}</h3>
            <div className="text-sm text-[#3F3F46] space-y-1">
              <p>Req 24h: <span className="font-mono font-semibold">{p.requests_24h}</span></p>
              <p>Req 7d: <span className="font-mono font-semibold">{p.requests_7d}</span></p>
              <p>Avg latency: <span className="font-mono font-semibold">{p.avg_latency_ms} ms</span></p>
              <p>Custo 7d: <span className="font-mono font-semibold">{p.total_cost_7d.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
              <p>Successes 7d: <span className="font-mono font-semibold">{p.successes_7d}</span></p>
              <p>Custo médio/req: <span className="font-mono font-semibold">{(p.total_cost_7d / (p.successes_7d || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-[#E4E4E7] pt-6">
        <h3 className="mb-4 text-md font-medium text-[#3F3F46]">Cadeias de Integração</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {chainStats.map((c) => (
            <div key={c.chain_kind} className="border border-[#E4E4E7] bg-[#FAFAFA] rounded-xl p-4 flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-[#09090B]">
                {c.chain_kind === 'conv' ? 'Conversas' : c.chain_kind === 'tools' ? 'Ferramentas' : 'Background'}
              </h4>
              <p className="text-sm text-[#3F3F46]">Quantidade: <span className="font-mono font-semibold">{c.count}</span></p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
