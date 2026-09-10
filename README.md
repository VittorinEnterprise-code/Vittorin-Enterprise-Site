# Vittorin Enterprise

Site-vitrine oficial da Vittorin Enterprise para aplicativos, tecnologia e inovação, pronto para implantação própria na Cloudflare.

## Experiência pública

- identidade visual responsiva inspirada na marca metálica Vittorin;
- modos claro, escuro e preferência do sistema;
- vitrines filtráveis por categoria;
- cartões de produto com imagem, status, descrição e link externo;
- blocos adicionais de recepção com textos, links e destaques;
- escala de interface, tamanho tipográfico, negrito, contraste e fonte personalizada;
- transparência ajustável e fade preto opcional nas vitrines;
- trilha MP3 opcional em loop, com controle de reprodução para o visitante;
- área opcional para vídeo promocional;
- layout adaptado para desktop, tablet e celular.

## Estúdio privado

A rota `/studio*` é protegida pelo Cloudflare Access. O Worker valida o JWT assinado pela Cloudflare e aplica uma segunda autorização no servidor. Apenas `vittorinoenterprise@gmail.com` pode visualizar, carregar mídia ou salvar alterações.

O Estúdio permite editar:

- títulos, subtítulos, avisos, botões, links, cores, logo e imagem principal;
- produtos, ordem, categoria, status, visibilidade e destaque;
- categorias, descrições, endereços e ordem;
- número de colunas da vitrine;
- vídeo promocional por upload ou URL;
- escala da interface de 60% a 160%, tamanho das letras, negrito e contraste;
- transparência das vitrines de 0% a 100% e fade preto discreto;
- fonte personalizada por upload (WOFF2, WOFF, TTF ou OTF);
- trilha MP3 de fundo, volume inicial e reprodução em loop;
- até 20 elementos adicionais de recepção, ordenáveis e ocultáveis.

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
