# Vittorin Enterprise

Site-vitrine oficial da Vittorin Enterprise para aplicativos, tecnologia e inovação, pronto para implantação própria na Cloudflare.

## Experiência pública

- identidade visual responsiva inspirada na marca metálica Vittorin;
- modos claro, escuro e preferência do sistema;
- vitrines filtráveis por categoria;
- cartões de produto com imagem, status, descrição e link externo;
- área opcional para vídeo promocional;
- layout adaptado para desktop, tablet e celular.

## Estúdio privado

A rota `/studio*` é protegida pelo Cloudflare Access. O Worker valida o JWT assinado pela Cloudflare e aplica uma segunda autorização no servidor. Apenas `vittorinoenterprise@gmail.com` pode visualizar, carregar mídia ou salvar alterações.

O Estúdio permite editar:

- títulos, subtítulos, avisos, botões, links, cores, logo e imagem principal;
- produtos, ordem, categoria, status, visibilidade e destaque;
- categorias, descrições, endereços e ordem;
- número de colunas da vitrine;
- vídeo promocional por upload ou URL.

## Dados e mídia

O conteúdo estruturado é persistido em D1. Imagens e vídeos enviados pelo Estúdio são armazenados em R2. A preferência de tema permanece apenas no dispositivo do visitante.

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
