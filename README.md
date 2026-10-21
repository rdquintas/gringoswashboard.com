# gringoswashboard.com

Site estático da **Gringos Washboard Band**, alojado no **Netlify**. Cada `commit` na branch principal dispara um deploy automático. Sem backend, sem base de dados, sem segredos.

- **Build:** Node.js (`build.js`) gera o site final em `dist/`. Por agora só copia `src/` para `dist/`.
- **Conteúdo:** por agora é só uma página (`src/index.html`) com um título: sem CSS, sem JavaScript e sem tema.

## Estrutura

```
src/              ficheiros do site (copiados para dist/ pelo build)
  index.html      página inicial
build.js          build: limpa dist/ e copia src/ para lá
dist/             resultado do build (ignorado pelo Git; o Netlify gera o seu)
netlify.toml      configuração do Netlify (comando, pasta publicada, Node 22, cabeçalhos de segurança)
```

## Testar localmente
```bash
npm run build        # gera dist/
npm run dev          # build + serve dist em http://localhost:3000/
```
(`netlify dev` também serve.) Node 22 (`.nvmrc`). Não há dependências: o `npm install` não é necessário por agora.

## Fluxo de trabalho
1. Editar os ficheiros em `src/`.
2. `commit` + `push` na branch principal.
3. O Netlify corre `npm run build` e publica `dist/`.
4. Se o build falhar, o Netlify **não publica** e mantém o deploy anterior online (Netlify → *Deploys* → build falhado → log).

## Netlify: configuração inicial
1. Fazer push deste repositório para o GitHub.
2. Netlify → *Add new site* → *Import from Git* → escolher o repositório. O `netlify.toml` já define o comando (`npm run build`), a pasta (`dist`) e o Node 22.
3. Configurar o domínio em *Domain management*.

## Notas
- Segurança: cabeçalhos e CSP no `netlify.toml`. A CSP só permite recursos do próprio domínio e **não permite scripts nem estilos inline**: quando se acrescentar CSS/JS, vai em ficheiros. Qualquer domínio externo novo tem de ser acrescentado à CSP.
