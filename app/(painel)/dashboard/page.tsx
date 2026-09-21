'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, money, num, pct, ratio, usePanel, useQuery } from '../../components/ui'
import { demoSummary } from '@/lib/demo'

export default function DashboardPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [liveData, setData] = useState<any>(null)
  const [demo, setDemo] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) return
    setLoading(true)
    const controller = new AbortController()
    fetch(`/api/metrics/summary?${query}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('Não foi possível carregar os dados. Tente novamente.'); return r.json() })
      .then(setData)
      .catch(e => { if (e.name !== 'AbortError') setData({ error: e.message }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, refresh])

  const data: any = demo ? demoSummary : liveData

  if (loading || !data) return <p className="text-muted">Carregando...</p>
  if (data.error) return <div role="alert" className="text-bad">{data.error} <button onClick={() => setRefresh(v => v + 1)}>Tentar novamente</button></div>

  const o = data.ordersCount
  const vazio = o.total === 0 && !data.hasSpendData

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-brand text-xs tracking-[.2em] uppercase mb-2">Visão da operação</p><h1 className="text-3xl font-semibold tracking-tight">Seu tráfego, com clareza.</h1><p className="text-muted text-sm mt-2">Pagamentos confirmados. Origem identificada. Decisões com contexto.</p></div>
        <div className="flex gap-2"><button className="border border-line rounded-lg px-4 text-sm" onClick={() => setDemo(v => !v)}>{demo ? 'Voltar aos dados reais' : 'Ver demonstração'}</button><button className="bg-brand text-slate-950 rounded-lg px-4 text-sm font-semibold" onClick={() => setRefresh(v => v + 1)}>Atualizar</button></div>
      </div>
      {demo && <div role="status" className="border border-brand rounded-xl p-4 text-brand text-sm">DEMONSTRAÇÃO · Números fictícios para avaliar o layout. Nenhum evento é enviado e nenhuma venda é gravada.</div>}
      {data.unknownFinancials > 0 && <div role="status" className="border border-warn rounded-xl p-4 text-warn text-sm">{data.unknownFinancials} pagamento(s) sem valor líquido confirmado. Receita líquida e retorno ficam indisponíveis até receber os valores do checkout.</div>}
      {!demo && !data.hasSpendData && <div className="border border-line rounded-xl p-4 text-muted text-sm">Sem dados de investimento neste período. ROAS, CPA e resultado ficam indisponíveis até a sincronização da Meta.</div>}
      <section className="rounded-2xl border border-line bg-gradient-to-br from-sky-900/30 to-panel p-6 md:p-8 flex flex-wrap justify-between gap-6">
        <div><p className="text-muted text-sm">Retorno sobre investimento em mídia</p><p className="text-5xl font-semibold tracking-tight mt-3 text-brand">{data.hasSpendData ? ratio(data.roas) : '—'}<span className="text-lg text-muted ml-2">ROAS</span></p><p className="text-muted text-sm mt-4">Receita líquida ÷ gasto de mídia. Custos adicionais não entram neste indicador.</p></div>
        <div className="max-w-sm self-center"><p className="text-sm">{!data.hasSpendData || data.roas == null ? 'Conecte suas fontes para começar a comparar.' : data.roas >= 1 ? 'A receita líquida cobre o gasto em mídia.' : 'O gasto em mídia supera a receita líquida.'}</p><p className="text-muted text-xs mt-3">O resultado abaixo também desconta os custos cadastrados. Vendas sem origem permanecem visíveis.</p></div>
      </section>
      {vazio && <PrimeiroUso />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Faturamento liquido" value={money(data.revenue, currency)} hint={`bruto ${money(data.grossRevenue, currency)}`} />
        <Card label="Gastos com anúncios" value={money(data.hasSpendData ? data.spend : null, currency)} />
        <Card label="Resultado registrado" value={money(data.hasSpendData ? data.profit : null, currency)} tone={data.hasSpendData && data.profit >= 0 ? 'good' : 'neutral'}
              hint={`margem ${pct(data.margin)}`} />
        <Card label="ROAS" value={ratio(data.hasSpendData ? data.roas : null)} hint="Receita líquida / mídia" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Vendas aprovadas" value={num(o.approved)} hint={`${num(o.total)} no total`} />
        <Card label="Pendentes" value={num(o.pending)} hint={money(data.pendingRevenue, currency)} />
        <Card label="Ticket medio" value={money(data.averageTicket, currency)} />
        <Card label="CPA" value={!data.hasSpendData || data.cpa == null ? '—' : money(data.cpa, currency)}
              hint={`CPT ${data.cpt == null ? '—' : money(data.cpt, currency)}`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Reembolsos" value={num(o.refunded)} tone={o.refunded ? 'bad' : 'neutral'} />
        <Card label="Chargebacks" value={num(o.chargedback)} tone={o.chargedback ? 'bad' : 'neutral'} />
        <Card label="Aprovacao no cartao" value={pct(data.approvalRate)} hint={`${num(o.creditCardApproved)}/${num(o.creditCardTotal)}`} />
        <Card label="Vendas sem tracking" value={num(data.untrackedApproved)} tone={data.untrackedApproved ? 'bad' : 'good'}
              hint="aprovadas sem UTM" />
      </div>

      <Chart title="Faturamento por dia" rows={data.byDay} xKey="day" currency={currency} />
      <Chart title="Faturamento por hora" rows={data.byHour} xKey="hour" currency={currency} />

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Produtos" vazio={data.byProduct.length === 0}>
          {data.byProduct.map((p: any) => (
            <Row key={p.name} label={p.name} value={money(p.revenue, currency)} sub={`${num(p.sales)} vendas`} />
          ))}
        </Panel>
        <Panel title="Origem do trafego" vazio={data.bySource.length === 0}>
          {data.bySource.map((s: any) => (
            <Row key={s.source} label={s.source} value={money(s.revenue, currency)} sub={`${num(s.orders)} pedidos`} />
          ))}
        </Panel>
      </div>
    </div>
  )
}

function Chart({ title, rows, xKey, currency }: { title: string; rows: any[]; xKey: string; currency: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="text-sm text-muted mb-3">{title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey={xKey} stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => String(Math.round(v / 100))} />
            <Tooltip
              contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8 }}
              formatter={(v: any) => money(v, currency)}
            />
            <Bar dataKey="revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Panel({ title, children, vazio }: { title: string; children: React.ReactNode; vazio?: boolean }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="text-sm text-muted mb-3">{title}</div>
      {vazio ? <p className="text-muted text-sm py-6 text-center">Sem dados nesse periodo.</p> : <div className="space-y-2">{children}</div>}
    </div>
  )
}

/** Aparece enquanto o dashboard nao recebeu nenhuma venda nem gasto. */
function PrimeiroUso() {
  return (
    <div className="border border-brand/40 bg-brand/5 rounded-xl p-5">
      <div className="font-medium mb-2">Nenhum dado ainda — faltam tres passos</div>
      <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
        <li>Cole o script na sua pagina de vendas</li>
        <li>Cole os parametros de URL no anuncio</li>
        <li>Aponte o webhook do gateway pra ca</li>
      </ol>
      <Link href="/integracoes" className="inline-block mt-3 text-sm text-brand hover:underline">
        Ir para Integracoes
      </Link>
    </div>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="truncate">{label}</span>
      <span className="text-right shrink-0">
        {value} <span className="text-muted text-xs">{sub}</span>
      </span>
    </div>
  )
}
