# RNG Pedras Online — TOP 10 persistente

Esta versão mantém o leaderboard e o progresso dos jogadores depois de reiniciar/redeployar o serviço, **desde que o Render Persistent Disk esteja configurado**.

## Render

- Build Command: `npm install`
- Start Command: `npm start`
- Adicione um **Persistent Disk** ao Web Service.
- Mount Path: `/data`

O servidor grava o save em `/data/players.json`.

Se quiser usar outro caminho, defina a variável de ambiente:
`PERSISTENT_DATA_DIR=/seu/caminho`

### Importante
Na primeira inicialização, se `/data/players.json` ainda não existir e existir um `players.json` antigo junto do código, ele é copiado para o disco persistente. Depois disso, o arquivo do disco passa a ser o save principal.

**Não apague o Persistent Disk nem o `/data/players.json`.**

Players online continuam sendo temporários: após reinício, o contador começa em 0 e volta a contar conforme os jogadores entram.
