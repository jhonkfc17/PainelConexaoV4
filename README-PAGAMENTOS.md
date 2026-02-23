# Pagamentos no Detalhe do Empréstimo (Sidepanel)

Este patch adiciona o fluxo completo de **Pagar** no **EmprestimoDetalhe** com 3 modos:

1. **Pagar Parcela** (integral)
2. **Parcial (adiantamento / saldo)**
3. **Total (quitar contrato)**

E adiciona **Histórico de pagamentos** com **estorno (reversão) com auditoria**.

---

## 1) Passo a passo (Supabase)

### 1.1 Executar SQL (criar tabela + colunas + RPCs)

1) Abra o **Supabase Dashboard** → **SQL Editor**
2) Cole e execute o arquivo:

`supabase/sql/pagamentos_rpc.sql`

> Dica: execute em ambiente de teste primeiro.

---

## 2) Estrutura (tabelas e colunas)

### 2.1 `public.pagamentos`

Registra qualquer tipo de pagamento e mantém auditoria do estorno.

Campos principais:

- `emprestimo_id`
- `parcela_id` (opcional)
- `parcela_numero` (opcional)
- `tipo`:
  - `PARCELA_INTEGRAL`
  - `ADIANTAMENTO_MANUAL`
  - `SALDO_PARCIAL`
  - `QUITACAO_TOTAL`
- `valor`
- `juros_atraso`
- `data_pagamento` (**data escolhida na UI**)

Auditoria:

- `estornado_em`
- `estornado_por`
- `estornado_motivo`

Snapshot para reversão exata:

- `snapshot_parcela` (jsonb)
- `snapshot_emprestimo` (jsonb)
- `snapshot_parcelas` (jsonb array — usado na quitação total)

### 2.2 `public.parcelas` (campos usados pelo fluxo)

Além dos campos já existentes (`pago`, `valor`, `vencimento`, etc), o patch usa (e o SQL cria se não existir):

- `valor_pago_acumulado` (numeric)
- `saldo_restante` (numeric)
- `pago_em` (date)

---

## 3) RPCs

### 3.1 `rpc_registrar_pagamento`

Registra pagamento e atualiza parcela/contrato conforme tipo.

### 3.2 `rpc_estornar_pagamento`

Marca pagamento como estornado (não apaga) e restaura o estado anterior via snapshots.

---

## 4) Regra obrigatória (vídeo): Adiantamento Manual

- Pagamento `ADIANTAMENTO_MANUAL` **não pode ser estornado pelo fluxo normal**.
- Só pode ser estornado por **admin**.

O patch implementa esse bloqueio:

1) **No frontend** (botão “Estornar” fica desabilitado)
2) **No RPC** (`rpc_estornar_pagamento`) com parâmetro `p_is_admin`.

---

## 5) Checklist de aceite

✅ **Pagar parcela** → `parcelas.pago=true`, aparece no histórico.

✅ **Estornar pagamento de parcela** → parcela volta ao estado anterior, histórico marca `estornado_em`.

✅ **Pagar parcial/adiantamento** → cria saldo restante e na UI aparece “ainda deve X”.

✅ **Pagar saldo** → parcela fecha (`pago=true`).

✅ **Quitar total** → contrato fica `finalizado/quitado` e parcelas ficam pagas; estorno da quitação volta ao estado anterior.

---

## 6) Como validar se os RPCs estão ativos

No Supabase:

1) **Database → Functions**
2) Verifique se existem:
   - `rpc_registrar_pagamento`
   - `rpc_estornar_pagamento`

Ou rode no SQL editor:

```sql
select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('rpc_registrar_pagamento','rpc_estornar_pagamento');
```

Se não aparecerem, reexecute o `supabase/sql/pagamentos_rpc.sql`.
