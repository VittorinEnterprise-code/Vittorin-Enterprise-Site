# Ativação segura de pagamentos reais

O código de produção está preparado, mas nasce com a cobrança real desligada. O teste privado em `/studio/checkout-teste` continua isolado e nunca é promovido automaticamente para produção.

## O que já está implementado

- preço e disponibilidade sempre lidos do D1; o navegador não escolhe o valor;
- cópia imutável dos itens, preço, moeda, comprador e forma de entrega;
- idempotência ponta a ponta para impedir pedido duplicado em tentativas repetidas;
- reconciliação por `external_reference` quando a resposta de criação for incerta;
- recupera automaticamente criações interrompidas com a mesma chave idempotente;
- estoque ilimitado ou finito, com reserva atômica e proteção contra edições antigas do Estúdio;
- Checkout Pro pela API Orders do Mercado Pago;
- URL de checkout aceita apenas em domínios HTTPS oficiais do Mercado Pago;
- retorno público com token opaco e sem dados pessoais;
- webhook `Order (Mercado Pago)` com HMAC, janela contra replay e deduplicação;
- consulta autoritativa `GET /v1/orders/{id}` antes de marcar um pedido como pago;
- confirmação de pagamento somente para `processed` + `accredited`;
- verificação de vendedor, aplicação, referência, valor, moeda e modo produtivo;
- painel privado em `/studio/pedidos`, com atualização, cancelamento, reembolso integral e conclusão da entrega;
- logs estruturados sem token de acesso, segredo ou e-mail do comprador.

## Trava de ativação

A cobrança somente funciona quando todas as condições abaixo forem verdadeiras:

- `DEPLOYMENT_ENV=production`;
- `PAYMENTS_ENABLED=1`;
- `PUBLIC_SITE_URL` for uma origem HTTPS válida;
- todos os dados produtivos abaixo estiverem presentes;
- o produto estiver visível, com status disponível, **Produto vendável** ativado e preço maior que zero.

Deixe `CLOUDFLARE_PAYMENTS_ENABLED=0` até concluir todo o checklist. Credenciais, isoladamente, não ativam cobranças.

Depois da primeira ativação, `PAYMENTS_ENABLED=0` funciona como interruptor para **novas** compras. Não remova os segredos nem as demais variáveis ao usar esse interruptor: webhooks, consultas, cancelamentos e reembolsos de pedidos já existentes continuam dependendo deles.

## Dados de runtime no Worker de produção

Cadastre no painel da Cloudflare, nunca no repositório:

| Nome | Tipo | Origem |
|---|---|---|
| `MP_ACCESS_TOKEN` | Secret | Credencial de produção da aplicação Mercado Pago |
| `MP_WEBHOOK_SECRET` | Secret | Assinatura secreta exibida ao configurar Webhooks |
| `PAYMENT_ORDER_TOKEN_SECRET` | Secret | segredo aleatório próprio, com pelo menos 32 caracteres |
| `MP_SELLER_USER_ID` | Secret ou variável | ID numérico da conta vendedora autenticada |
| `MP_APPLICATION_ID` | Variável | ID numérico da mesma aplicação Mercado Pago |

`PUBLIC_SITE_URL` e `PAYMENTS_ENABLED` são gerados a partir de `CLOUDFLARE_PUBLIC_SITE_URL` e `CLOUDFLARE_PAYMENTS_ENABLED` no Workers Builds.

Para gerar `PAYMENT_ORDER_TOKEN_SECRET` no PowerShell sem exibi-lo em arquivos:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Copie o resultado diretamente para um Secret da Cloudflare e limpe o terminal. Qualquer token do Mercado Pago que já tenha aparecido em conversa, captura de tela, histórico de terminal ou log deve ser revogado e substituído antes da produção.

## Webhook do Mercado Pago

Na mesma aplicação que gerou a credencial produtiva:

1. Abra **Webhooks** e selecione o modo de produção.
2. Use `https://SEU-DOMINIO/api/webhooks/mercado-pago`.
3. Ative o evento **Order (Mercado Pago)**.
4. Salve a assinatura secreta em `MP_WEBHOOK_SECRET`.
5. Confirme nos logs da Cloudflare um evento `mercado_pago_webhook_processed` após uma compra controlada.

O sistema responde rapidamente à notificação, valida `x-signature`, consulta novamente a ordem no Mercado Pago e só então atualiza o pedido. O retorno do navegador jamais confirma pagamento.

Documentação oficial: [criação da order](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order?scope=prod), [URLs de retorno](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/web-integration/configure-back-urls?scope=prod), [webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/notifications?scope=prod) e [entrada em produção](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/go-to-production?scope=prod).

## Checklist antes de mudar para `1`

- conta vendedora e identidade empresarial aprovadas pelo Mercado Pago;
- aplicação correta em modo produtivo e credencial nova;
- domínio HTTPS definitivo funcionando;
- política de privacidade, termos, contato, preço e regras de cancelamento/reembolso publicados;
- produto configurado no Estúdio com SKU, preço, estoque e forma de entrega;
- webhook produtivo salvo e assinatura configurada;
- regra de Rate Limiting/WAF da Cloudflare para `POST /api/checkout/orders`;
- observabilidade e alertas revisados;
- compra real de valor mínimo aprovada por responsável, seguida de conferência no Mercado Pago, D1 e `/studio/pedidos`;
- cancelamento e reembolso validados em pedido controlado;
- processo de entrega definido para `manual`, `digital` ou `external`.

Só depois disso altere `CLOUDFLARE_PAYMENTS_ENABLED` para `1` e faça um novo deploy de produção. Para interromper novas vendas, volte imediatamente para `0` e redeploy, mantendo as credenciais de runtime; pedidos já criados continuam consultáveis e operáveis no painel.

## Comportamentos operacionais importantes

- Um retorno de sucesso no navegador não vale como confirmação; aguarde **Pago** no painel.
- Uma falha de rede depois do envio ao Mercado Pago fica em **Revisão necessária** e preserva o estoque. O sistema pesquisa a referência externa antes de repetir a mesma chave idempotente e nunca gera outra cobrança automaticamente.
- Uma criação interrompida antes de salvar a resposta é retomada com a chave original na próxima atividade da loja; o navegador também preserva a tentativa durante recargas da aba.
- A order de checkout tem vigência de um dia; ao expirar, o status cancelado devolve a reserva de estoque.
- Cancelar libera uma reserva de estoque ainda não paga.
- Reembolsar não repõe estoque automaticamente, pois devolução física ou revogação digital exige decisão operacional.
- **Concluir entrega** só fica disponível depois da confirmação do pagamento.
