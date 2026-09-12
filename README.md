# Corkboard

Quadro de investigação local, inspirado nos painéis de detetive dos filmes e no Obsidian Canvas — só que bem mais simples. Quadro preto AMOLED, tudo pelo botão direito, **100% offline**: nenhum dado sai da máquina.

## O que faz

- **Anotações** em Markdown-lite: `# título`, `**negrito**`, `*itálico*`, `==marca-texto==`, `- listas`.
- **Quadros de fotos**: várias imagens num card; clique abre em tela cheia com **círculos, setas, retângulos e caneta** por cima (a foto original nunca é alterada). Cole prints com `Ctrl+V` ou arraste arquivos.
- **Ligações** entre quadros (linha com seta e rótulo), formando a árvore do caso.
- **Anotações subjetivas**: sub-quadros presos ao lado do card, marcados como *Atualização* (info nova) ou *Contradição* (fatos conflitam).
- **Datas** separadas: quando você criou o quadro × de quando é a informação × quando a foto foi tirada.
- **Desenhos** sobre o quadro para circular cards ou marcar áreas.
- **Vários casos** (investigações), cada um com seu quadro.
- **Backup** exportar/importar em um único `.json` (com fotos embutidas).
- **Export para IA**: `.zip` com um `.md` por quadro (numerados, com sub-itens `NN.1`, ligações e datas), pasta `imagens/` renomeada e um `CASO COMPLETO.md` para colar num chat.

## Atalhos

| Tecla | Ação |
|---|---|
| Botão direito | menu contextual (quadro, card, ligação, desenho, anotação subjetiva) |
| Duplo clique | editar card / anotação subjetiva |
| `N` / `F` | nova anotação / novo quadro de fotos |
| `1` `2` `3` `4` | caneta / círculo / retângulo / seta |
| `Esc` | sair da ferramenta, cancelar ligação |
| `Del` | excluir seleção |
| `Ctrl+V` | colar print como quadro de fotos |
| `Ctrl+0` | centralizar |
| `F11` | tela cheia |
| Roda / arrastar fundo | zoom / mover o quadro |

No lightbox: `←` `→` navegar · `C` círculo · `S` seta · `P` caneta · `R` retângulo · `Ctrl+Z` desfazer · `0` ajustar · `Esc` fechar.

## Instalar (Ubuntu/Debian)

Baixe o `.deb` da [página de releases](../../releases) e:

```bash
sudo apt install ./corkboard_1.0.0_amd64.deb
```

Os dados ficam em `~/.config/corkboard/` (IndexedDB do Chromium). Faça backups pelo menu.

## Desenvolver

```bash
npm install
npm run dev      # abre o app
npm run dist     # gera release/corkboard_<versão>_amd64.deb
```

Stack: Electron + TypeScript puro (sem framework), esbuild, electron-builder. O renderer usa só APIs web (IndexedDB, `<input type=file>`, `<a download>`), então portar para Android (Capacitor) é direto.

## Segurança

`contextIsolation`, `sandbox`, sem `nodeIntegration`, CSP restritiva e bloqueio de qualquer requisição que não seja `file://`/`blob:`/`data:`. Não há telemetria, atualização automática nem chamadas de rede.
