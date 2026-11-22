# Vittorin Enterprise

Site-vitrine oficial da Vittorin Enterprise para aplicativos, tecnologia e inovação, pronto para implantação própria na Cloudflare.

## Experiência pública

- identidade visual responsiva inspirada na marca metálica Vittorin;
- modos claro, escuro e preferência do sistema;
- vitrines filtráveis por categoria;
- cartões de produto com imagem, status, descrição, link externo e teaser individual em vídeo;
- blocos adicionais de recepção com textos, links e destaques;
- escala de interface, tamanho tipográfico, negrito, contraste e fonte personalizada;
- transparência ajustável e fade preto opcional no card inicial de apresentação;
- trilha MP3 opcional em loop, com controle de reprodução para o visitante;
- menu flutuante opcional de contato com botões estilizados para redes sociais;
- área opcional para vídeo promocional;
- layout adaptado para desktop, tablet e celular.
- checkout próprio com preço calculado no servidor e pagamento no Mercado Pago;
- acompanhamento do pedido sem confiar no retorno do navegador.

## Estúdio privado

A rota `/studio*` é protegida pelo Cloudflare Access. O Worker valida o JWT assinado pela Cloudflare e aplica uma segunda autorização no servidor. Apenas `vittorinoenterprise@gmail.com` pode visualizar, carregar mídia ou salvar alterações.

O Estúdio permite editar:

- títulos, subtítulos, avisos, botões, links, cores, logo e imagem principal;
- produtos, ordem, categoria, status, visibilidade e destaque;
- vídeo teaser individual por produto, via upload, YouTube ou Vimeo;
- categorias, descrições, endereços e ordem;
- número de colunas da vitrine;
- vídeo promocional por upload ou URL;
- escala da interface de 60% a 160%, tamanho das letras, negrito e contraste;
- transparência do card inicial de 0% a 100% e fade preto discreto, sem desfoque sobre a logotipo;
- fonte personalizada por upload (WOFF2, WOFF, TTF ou OTF);
- trilha MP3 de fundo, volume inicial e reprodução em loop;
- até 20 elementos adicionais de recepção, ordenáveis e ocultáveis.
- até 20 canais de contato, com rede, link, cor, ordem e visibilidade independentes;
- posição do botão de contato à direita, à esquerda ou centralizado na parte inferior.
- preço, SKU, disponibilidade, estoque e forma de entrega por produto;
- painel privado de pedidos, atualização autoritativa, cancelamento, reembolso e conclusão da entrega.

## Comércio e pagamentos

A camada comercial já está preparada, mas cobranças reais permanecem bloqueadas por padrão. Ela exige, ao mesmo tempo:

1. implantação no ambiente `production`;
2. credenciais produtivas completas do Mercado Pago;
3. webhook produtivo validado por assinatura;
4. `PAYMENTS_ENABLED=1`;
5. produto visível, disponível, vendável e com preço maior que zero.

Sem todas essas condições, nenhum botão de compra real é exibido e a API recusa a criação do pedido. Consulte [PAYMENTS_PRODUCTION.md](./PAYMENTS_PRODUCTION.md) antes da ativação.

## Dados e mídia

O conteúdo estruturado é persistido em D1. Imagens, vídeos, fontes e MP3 enviados pelo Estúdio são armazenados em R2. A preferência de tema permanece apenas no dispositivo do visitante.

Por segurança e pelas políticas dos navegadores, uma trilha configurada tenta iniciar automaticamente, mas alguns visitantes precisarão clicar uma vez em **Ativar trilha**. O controle público permite pausar e retomar o áudio.

## Desenvolvimento

```bash
pnpm install
pnpm run dev
```

Para gerar a versão de produção:

```bash
pnpm run build
```

O Estúdio exige o Cloudflare Access configurado e as variáveis de domínio da equipe e audiência no ambiente implantado. A vitrine pública e o tema podem ser desenvolvidos localmente sem autenticação.

## Implantação

Consulte [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) para criar D1, R2, Access e configurar o Workers Builds conectado ao GitHub.

## Ofertas Juris Immersive

O Estúdio permite definir quais acessos acompanham cada oferta: Learn, Processus avulso ou ambos. As duas novas ofertas são criadas como rascunhos ocultos, sem preço e sem venda habilitada, ao lado de um Learn existente. Valores e configurações já existentes não são substituídos.

Defina os preços no Estúdio antes de habilitar a venda. Quando os três valores estiverem definidos, o pacote deve custar mais que o Learn e menos que a soma do Learn com o Addon avulso. Cada oferta com entrega automática precisa de um SKU exclusivo. A licença é pessoal, de uma unidade por e-mail.

O checkout grava os acessos no item do pedido e a entrega assinada versão 2 usa esse registro tanto na liberação quanto no reembolso, mesmo após uma edição do catálogo. Pedidos antigos recebem por padrão apenas Learn; eventos antigos pendentes mantêm seu formato original.

Publique a atualização das contas no Worker `juris-immersive-mobile` antes desta versão. Os endereços e segredos existentes de entrega são mantidos. A migração `0006_product_access_snapshots.sql` descreve o esquema; a produção Cloudflare mantém o bootstrap idempotente de colunas em `db/index.ts`.

`npm test` inclui testes isolados do SQL real do checkout, concorrência na edição, preservação de preços, ofertas em rascunho e entrega após mudança do catálogo. Nenhuma cobrança real é feita nesses testes.
