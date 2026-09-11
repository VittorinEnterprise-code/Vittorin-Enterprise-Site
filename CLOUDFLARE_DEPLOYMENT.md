# Publicação na Cloudflare

Este projeto usa quatro recursos independentes da conta:

- **Workers** para o site e o Estúdio;
- **D1** para textos, aparência, redes sociais, elementos de recepção, categorias e produtos;
- **R2** para imagens, vídeos, MP3 e fontes enviados;
- **Cloudflare Access** para restringir `/studio*` ao e-mail `vittorinoenterprise@gmail.com`.

O Juris Immersive não é alterado. Use nomes próprios para os recursos da Vittorin.

## 1. Criar os recursos

No painel da Cloudflare:

1. Crie o banco D1 `vittorin-enterprise-db` e copie o **Database ID**.
2. Crie o bucket R2 `vittorin-enterprise-media`.
3. Escolha o domínio público do site, por exemplo `vittorin.seudominio.com`.
4. Em Zero Trust > Access > Applications, crie uma aplicação **Self-hosted** para `vittorin.seudominio.com/studio*`.
5. Na política Allow, libere somente o e-mail `vittorinoenterprise@gmail.com`.
6. Copie o domínio da equipe, no formato `https://sua-equipe.cloudflareaccess.com`, e o **Application Audience (AUD)**.

Todos os endpoints que modificam dados ou mídia estão dentro de `/studio*`. Além da barreira do Access, o Worker valida a assinatura do token e confere novamente o e-mail no servidor.

## 2. Conectar o GitHub ao Workers Builds

Crie um Worker conectado ao repositório e use:

| Campo | Valor |
|---|---|
| Branch de produção | `main` |
| Build command | `pnpm run build:cloudflare` |
| Deploy command | `pnpm run deploy:cloudflare` |
| Root directory | `/` |
| Node.js | 22 ou superior |

Cadastre estas variáveis de build:

| Variável | Valor |
|---|---|
| `CLOUDFLARE_D1_DATABASE_ID` | ID copiado do D1 |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | `https://sua-equipe.cloudflareaccess.com` |
| `CLOUDFLARE_ACCESS_AUD` | AUD da aplicação Access |
| `CLOUDFLARE_WORKER_NAME` | `vittorin-enterprise` (opcional) |
| `CLOUDFLARE_D1_DATABASE_NAME` | `vittorin-enterprise-db` (opcional) |
| `CLOUDFLARE_R2_BUCKET_NAME` | `vittorin-enterprise-media` (opcional) |

O Worker inicializa as tabelas necessárias no D1 de forma idempotente no primeiro acesso. Assim, o deploy conectado ao GitHub não depende de uma etapa manual no console SQL. Se a Cloudflare rejeitar o vínculo D1 por permissão da conta, selecione no Workers Builds um token próprio com **Workers Scripts: Edit**, **Workers R2 Storage: Edit** e **Workers D1: Edit**.

## Atualizar pelo GitHub Desktop

Depois de substituir a pasta local do projeto pela versão atualizada:

1. Abra o repositório no GitHub Desktop e confira a lista de arquivos alterados.
2. No campo **Summary**, informe uma mensagem como `Atualiza Estúdio e personalização visual`.
3. Clique em **Commit to main**.
4. Clique em **Push origin**.
5. A Cloudflare iniciará automaticamente um novo build da branch `main`.
6. No painel, abra **Workers & Pages > vittorin-enterprise > Deployments** e aguarde o status de sucesso.

Não recrie o Worker, o D1, o R2 ou a aplicação Access. O deploy reaproveita os recursos e as variáveis já cadastrados.

## 3. Associar o domínio

Após o primeiro deploy, abra o Worker, adicione o domínio escolhido em **Settings > Domains & Routes** e confirme que a aplicação Access usa exatamente esse mesmo hostname e o caminho `/studio*`.

## Verificação final

- Acesse `/` em janela anônima: a vitrine deve abrir sem login.
- Acesse `/studio`: o Cloudflare Access deve pedir autenticação.
- Entre com `vittorinoenterprise@gmail.com`.
- Salve uma alteração, recarregue a página e confirme a persistência no D1.
- Ative um canal em **Contato & redes**, salve e confirme o botão flutuante na vitrine.
- Envie uma imagem pequena e confirme que ela reaparece na vitrine a partir do R2.
- Teste uma fonte WOFF2 e um MP3 curto; se o áudio não iniciar sozinho, clique em **Ativar trilha**, comportamento esperado em navegadores que bloqueiam autoplay com som.
