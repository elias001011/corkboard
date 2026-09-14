# Corkboard

Quadro de investigação local, inspirado nos painéis de detetive dos filmes e no Obsidian Canvas — só que bem mais simples. Quadro preto AMOLED, tudo pelo botão direito, **100% offline**: nenhum dado sai da máquina.

> Este é um projeto pessoal, open source sob licença MIT. Issues e PRs são bem-vindos.

## O que faz

- **Anotações** em Markdown-lite: `# título`, `## super título`, `### subtítulo`, `**negrito**`, `*itálico*`, `==marca-texto==`, `- listas`.
- **Quadros de fotos** (até 100 por quadro): clique abre a **lista** de fotos do quadro; de lá você abre o visualizador em tela cheia, com **círculos, setas, retângulos e caneta** por cima (a foto original nunca é alterada). Cole prints com `Ctrl+V` ou arraste arquivos. Formatos que o app não consegue abrir (HEIC, TIFF, RAW…) são recusados com aviso.
- **Ligações** entre quadros — e também a partir de anotações subjetivas — com seta, rótulo e cor, formando a árvore do caso.
- **Anotações subjetivas**: sub-quadros presos ao card, marcados como *Atualização* (info nova), *Contradição* (fatos conflitam) ou um **tipo seu** (nome e cor: "Hipótese", "Álibi", "Fonte duvidosa"…). Escolhem um lado livre de ligações e podem ser arrastadas/redimensionadas.
- **Datas** separadas: quando você criou o quadro × de quando é a informação × quando a foto foi tirada.
- **Desenhos** sobre o quadro para circular cards ou marcar áreas.
- **Vários casos** (investigações), cada um com seu quadro.
- **Desfazer/refazer** ilimitado dentro da sessão (`Ctrl+Z` / `Ctrl+Shift+Z`).
- **Backup** exportar/importar em um único `.json` (com fotos embutidas).
- **Export para IA**: `.zip` com um `.md` por quadro (numerados, com sub-itens `NN.1`, ligações e datas), pasta `imagens/` renomeada (com versão marcada) e um `CASO COMPLETO.md` para colar num chat.

Toda exportação abre um diálogo "Salvar como" e lembra a última pasta usada.

## Atalhos

| Tecla | Ação |
|---|---|
| Botão direito | menu contextual (quadro, card, ligação, desenho, anotação subjetiva, foto) |
| Duplo clique | editar card / anotação subjetiva; abrir uma foto direto |
| `N` / `F` | nova anotação / novo quadro de fotos |
| `1` `2` `3` `4` | caneta / círculo / retângulo / seta |
| `Esc` | sair da ferramenta, cancelar ligação, fechar lista/visualizador |
| `Del` | excluir seleção |
| `Ctrl+Z` / `Ctrl+Shift+Z` | desfazer / refazer |
| `Ctrl+V` | colar print (no quadro selecionado, na lista de fotos aberta, ou num quadro novo) |
| `Ctrl+0` | centralizar |
| `F11` | tela cheia |
| Roda / arrastar fundo / botão do meio | zoom / mover o quadro (com um card em edição, só o botão do meio move) |

No visualizador de fotos: `←` `→` navegar · `C` círculo · `S` seta · `R` retângulo · `P` caneta · `Ctrl+Z` apagar última marca · `0` ajustar · `Del` remover · `Esc` voltar à lista.

## Instalar

Baixe da [página de releases](../../releases):

| Sistema | Arquivo | Como |
|---|---|---|
| Ubuntu/Debian | `corkboard_<v>_amd64.deb` | `sudo apt install ./corkboard_<v>_amd64.deb` |
| Outras distros Linux | `corkboard_<v>_x86_64.AppImage` | `chmod +x` e executar |
| Windows | `corkboard_<v>_win_x64.exe` (instalador) ou `…_portable.exe` | executar; o SmartScreen pode avisar (app não assinado): "Mais informações" → "Executar assim mesmo" |
| macOS | `corkboard_<v>_mac_x64.dmg` (Intel) ou `…_arm64.dmg` (Apple Silicon) | arrastar para Aplicativos; na 1ª abertura, botão direito → Abrir (app não assinado) |

Dados ficam na pasta de configuração do usuário (`~/.config/corkboard/` no Linux, `%APPDATA%\corkboard` no Windows, `~/Library/Application Support/corkboard` no macOS). Faça backups pelo menu.

## Desenvolver

```bash
npm install
npm run dev        # compila e abre o app
npm run typecheck  # tsc --noEmit
npm run dist:linux # deb + AppImage (também dist:win / dist:mac no SO correspondente)
```

Stack: Electron + TypeScript puro (sem framework), esbuild, electron-builder.

```
src/main/main.ts         janela, diálogo "Salvar como" (IPC), bloqueio de rede
src/preload/preload.ts   única ponte exposta ao renderer: saveFile()
src/renderer/            app: canvas, cards, ligações, fotos, export, backup
```

O renderer usa só APIs web (IndexedDB, `<input type=file>`, clipboard) e feature-detecta a ponte de salvar — sem ela, cai em download comum. Isso mantém a porta aberta para um port Android (Capacitor) com o mesmo código.

Releases: crie uma tag `vX.Y.Z` (com a `version` do `package.json` igual) e o GitHub Actions compila Linux, Windows e macOS em paralelo e anexa tudo à release.

## Segurança e privacidade

`contextIsolation`, `sandbox`, sem `nodeIntegration`, CSP restritiva e bloqueio de qualquer requisição que não seja `file://`/`blob:`/`data:`. Não há telemetria, atualização automática nem chamadas de rede. A única ponte main↔renderer é `saveFile`, que abre um diálogo nativo e grava os bytes recebidos.

## Licença

[MIT](LICENSE)
