# RNG Pedras Shooter

## Render
- Build command: `npm install`
- Start command: `npm start`

## Atualização
Esta versão mantém o sistema existente de jogadores. Não apague `players.json` nem o disco persistente `/data` no Render.

## Eventos globais
O modo teste usa a senha `02072482`. Depois de desbloquear, os controles de evento permitem ativar por 5 minutos: 2x Sorte, +200 pontos especiais para jogadores online ou Evento Completo (2x Sorte + 200 pontos especiais). A raridade EVENT (0,1%) fica disponível enquanto o evento estiver ativo.

## Administração pelo Modo Teste
Depois de liberar o modo teste com a senha, o painel lista os jogadores online e permite adicionar níveis, enviar uma classe para o jogador equipar no próximo heartbeat, banir e desbanir. Os banimentos ficam salvos em `players.json`/disco persistente.

## Balanceamento e competição
- Pedras continuam ficando mais resistentes conforme o nível/pontuação aumentam.
- Cada boss fica progressivamente mais resistente e causa mais dano, com limite para a progressão não crescer infinitamente.
- A habilidade Q do RL DO CU SECO foi reduzida para 8 meteoros, dano limitado e raio final menor, sem explosão duplicada.
- Maestria tem limite máximo de nível 500.
- Novo TOP 10 de abates de pedras em uma única partida, salvo no servidor em `players.json`/disco persistente.

Não apague `players.json` nem o disco persistente `/data` no Render.
