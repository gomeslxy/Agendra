import React from 'react';
import { motion } from 'framer-motion';
import type { ProviderStat, ChainStat } from '../reports-client';

/**
 * ProviderHealthSection
 * Displays health/status metrics for integration providers (e.g., WhatsApp, Instagram).
 * Uses liquid glass design with subtle motion.
 */
export function ProviderHealthSection({ providerStats, chainStats }: { providerStats: ProviderStat[]; chainStats: ChainStat[] }) {
  return (
    <motion.div
      className="glass rounded-2xl p-5 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="mb-4 text-lg font-semibold text-white/80">Saúde dos Provedores</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {providerStats.map((p) => (
          <div key={p.provider} className="glass rounded-xl p-4 flex flex-col gap-2">
            <h3 className="text-md font-medium text-white">{p.provider}</h3>
            <div className="text-sm text-white/70">
              <p>Req 24h: {p.requests_24h}</p>
              <p>Req 7d: {p.requests_7d}</p>
              <p>Avg latency: {p.avg_latency_ms} ms</p>
              <p>Custo 7d: {p.total_cost_7d.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              <p>Successes 7d: {p.successes_7d}</p>
              <p>Avg cost per request: {(p.total_cost_7d / (p.successes_7d || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            </div>
          </div>
        ))}
        {/* Chain Stats */}
        <div className="mt-6">
          <h3 className="mb-2 text-md font-medium text-white/80">Cadeias de Integração</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {chainStats.map((c) => (
              <div key={c.chain_kind} className="glass rounded-xl p-4 flex flex-col gap-2">
                <h4 className="text-sm font-semibold text-white">
                  {c.chain_kind === 'conv' ? 'Conversas' : c.chain_kind === 'tools' ? 'Ferramentas' : 'Background'}
                </h4>
                <p className="text-sm text-white/70">Quantidade: {c.count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
