# RNG Online — Leaderboard TOP 10 corrigido

Esta versão corrige o bug em que jogadores desapareciam do TOP 10.

- Cada jogador é identificado pelo `playerId` persistente.
- Dois jogadores com o mesmo nível continuam sendo dois jogadores diferentes.
- Dois jogadores com o mesmo Nick também não são fundidos automaticamente.
- Troca de Nick continua sendo reconhecida usando `previousNick`/`nickHistory` quando o ID antigo não está disponível.
- O leaderboard sempre retorna até 10 jogadores reais.
- Celular e PC consultam a mesma lista no servidor.
- Se houver Persistent Disk montado em `/data`, o save fica em `/data/players.json`.

## Render

Build: `npm install`

Start: `npm start`

Persistent Disk mount path: `/data`
