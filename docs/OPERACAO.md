# Operação e validação

## Configuração

1. Instale com `npm ci` e configure `.env.local` ou secrets do provedor.
2. Defina `PANEL_USER`, `PANEL_PASSWORD` (16 caracteres ou mais), `CRON_SECRET` e `NEXT_PUBLIC_URL`. Nunca versione credenciais. A autenticação HTTP Basic exige HTTPS em produção; não coloque senha na URL.
3. Configure `TRACKING_ALLOWED_ORIGINS` com as origens exatas das páginas, separadas por vírgula. O coletor rejeita origens não cadastradas. Isso não substitui rate limiting no provedor.
4. Use `npm run dev`. O botão **Ver demonstração** mostra fixtures apenas no navegador, sem gravação nem chamadas de conversão.
5. No script da landing, inclua `data-checkout-hosts="checkout.exemplo.com,pay.exemplo.com"`. Somente links locais e desses hosts recebem parâmetros.
6. Cadastre um segredo no webhook. O endpoint aceita `x-webhook-secret`, Bearer ou `secret` no corpo. A assinatura específica do checkout será implementada e validada com sua documentação.
7. Os crons exigem `x-cron-secret`; não aceitam segredo na URL. Sincronize Meta a cada 30 minutos e processe CAPI a cada 1–5 minutos.

## Conectar GGCheckout

1. Em **Integrações → Webhooks**, selecione **GGCheckout**, informe um nome e crie um Secret longo. O painel gera uma URL no formato `/api/webhooks/ggcheckout?id=...`.
2. No GGCheckout, abra a configuração de webhooks e cole essa URL. Informe exatamente o mesmo Secret. O GG envia `Authorization: Bearer <secret>` e `x-secret: <secret>`; o dashboard valida ambos.
3. Habilite pelo menos `pix.paid`, `card.paid`, `pix.generated`, `card.pending`, `pix.refunded`, `card.refunded` e os eventos de falha/expiração que a conta disponibilizar. O endpoint responde de forma idempotente a reentregas pelo ID do pagamento.
4. O adaptador lê `payment.id`, `payment.amount`, método, gateway, cliente, produto/order bumps, data, IP e `utm_*`. `payment.amount` é tratado como valor bruto em reais; o preço inteiro de um bump, como `2700`, é tratado como centavos conforme o exemplo oficial.
5. O GG não informa no payload documentado a comissão líquida final do produtor. Por isso o dashboard registra o bruto, marca o líquido como indisponível e não fabrica ROAS/CPA. Depois que você enviar a documentação da API ou confirmar como obter taxa, gateway e líquido, adicionaremos a reconciliação. Se precisar enviar CAPI antes disso, selecione valor bruto conscientemente.
6. Não use o endpoint genérico junto com o de GG para o mesmo produto: isso duplicaria pedidos. Faça um teste com uma venda de baixo valor e confira `payment.id`, status, produto, bump, UTMs e o registro no painel.

## Contrato de atribuição

Mantenha o contrato exibido em Integrações: `utm_campaign=nome|id`, `utm_medium=conjunto|id`, `utm_content=anúncio|id`. IDs fazem o vínculo com o gasto; nomes são apenas rótulos. Links também levam `rt_vid`. A recuperação por visitante é limitada a visitas anteriores ao pedido nos últimos 30 dias. Sem evidência de origem, a venda fica `unattributed`, nunca automaticamente orgânica.

O coletor recebe o mesmo `eventId` para uma ocorrência reenviada. Se um pixel de navegador também emitir esse evento, deve receber esse mesmo ID. A integração automática com pixels existentes e o Purchase do checkout precisam de validação antes de serem ativados; instalar duas soluções independentes pode duplicar conversões.

## Métricas

- O período usa a data de aprovação, quando disponível, e o fuso do dashboard. O fuso da conta Meta precisa coincidir com ele.
- ROAS = receita líquida / mídia; resultado registrado desconta custos e impostos cadastrados. Não inclui automaticamente imposto sobre mídia ou despesas desconhecidas.
- Zero conhecido é diferente de ausência de dados. Sem registro de mídia no período, o painel não apresenta ROAS, CPA ou resultado. Sem líquido informado pelo adaptador, receita líquida e indicadores dependentes ficam indisponíveis.
- A visão atual é de pedidos pelo estado atual: reembolso/chargeback exclui a receita do período original. Não é um livro-caixa por data de estorno e ainda não trata estorno parcial.
- A distribuição líquida por produto é proporcional aos preços de seus itens; não representa taxa real individual. Depende da semântica dos preços fornecidos pelo checkout.
- Filtros parciais de produto/conta/origem ficam bloqueados nas APIs até implementar a mesma alocação no gasto; isso impede comparar receita parcial com gasto integral.

## Garantias implementadas

Histórico dos webhooks recebidos; proteção contra regressão de pago para pendente/recusado; preservação de itens omitidos; CAPI somente para pagamento confirmado; identificador estável e deduplicação da fila; destino sem token não é marcado como enviado; e-mails mascarados na API de pedidos; navegação móvel e cards minimizáveis.

## Validação antes de produção

Execute `node tests/reliability.cjs`, `npx tsc --noEmit` e `npm run build`.
Os testes usam banco temporário e não chamam a Meta. O teste de interface local fica em `tests/ui-smoke.cjs` e usa Playwright disponível no ambiente de desenvolvimento.

A integração final ainda exige payloads anonimizados e documentação do checkout para validar campos, valores/centavos, taxas, bumps, assinatura, duplicidade e eventos fora de ordem. Confira Purchase com `test_event_code` no Events Manager antes de ativar envio real.

## Limites desta revisão

Não há execução automática de pausa/orçamento, integração validada com checkout, medição de seção/modal/rolagem, nem novo cadastro de ofertas com alocação campanha→oferta. O código mantém Next.js/React/Turso. Credenciais de integrações cadastradas pelo painel ainda são armazenadas no banco, cuja proteção é responsabilidade da hospedagem; prefira secrets para o token Meta. Configurações específicas de múltiplos pixels, assinaturas e filas concorrentes devem ser validadas na integração. Sem promessa de atribuição total ou igualdade com o Gerenciador de Anúncios.

Antes de atualizar banco existente, faça backup. A versão 2 adiciona `financials_known`; registros antigos ficam conservadoramente sem líquido validado até reconciliação.
