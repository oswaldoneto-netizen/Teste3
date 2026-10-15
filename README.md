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

## Online + PvP nesta correção
- Contador online usa uma sessão temporária separada do `playerId`, evitando que heartbeats de jogadores diferentes sobrescrevam o contador.
- Jogadores online são deduplicados por conta (`playerId`) e expiram após 20s sem heartbeat.
- O hitbox PvP foi ampliado e centralizado no corpo do jogador; tiros e habilidades usam a mesma área de colisão.
- O hitbox visual é mostrado de forma discreta ao redor dos jogadores durante o PvP.

## Bosses no Shooter
- A cada 30 pedras destruídas aparece um boss aleatório: RL ODIO (10.000 HP, 25 de dano, tiro a cada 10s, recompensa 1 giro), JADRIAN PELUDO (25.000 HP, 50 de dano, tiro a cada 5s, recompensa 2 giros) ou LEO ATIÇADO (50.000 HP, 100 de dano, tiro a cada 4s, recompensa 3 giros).
- Os bosses mostram nome e barra de vida, atiram projéteis contra o jogador e precisam ser derrotados rapidamente.
- Giros especiais ficam salvos no perfil local. Só podem premiar MÍTICO (RL), SECRETO (POLO), GOD (RL CHARRADO) ou CRIADOR (Oswaldo), com as probabilidades configuradas no jogo.

## Giros especiais atualizados
- Enquanto um boss estiver ativo, a tecla Espaço não dispara; o disparo por clique continua funcionando. Fora dos bosses, Espaço funciona normalmente.
- Giros especiais sempre dão recompensa: Míticos FEFA, RL, LIPE FF e SOSO TETE; Secretos SERJÃO, POLO e TUNG TUNG; GOD RL CHARRADO; Criador OSWALDO. Não existe mais resultado sem recompensa.
- Os pesos 50/5/1/0,7 foram normalizados para não haver giros vazios.
