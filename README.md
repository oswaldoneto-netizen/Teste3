# RNG Pedras — Raid Cooperativa

Modo online cooperativo contra chefes, com salas de até 10 jogadores.

## O que foi corrigido
- Movimentação local preditiva e sincronização de posição no servidor, com setas/WASD no PC e controles direcionais por toque no celular.
- A nave da raid usa o personagem salvo pelo jogador: nome, raridade/cor, dano e vida base.
- O personagem escolhido é salvo no perfil local e restaurado ao reabrir o site.
- Habilidade especial com cooldown, dano ajustado à raridade/personagem e escudo com dois bloqueios.
- Sala de espera de 15 segundos, inicia antes se atingir 10 jogadores.
- Boss compartilhado e fases progressivamente mais difíceis.

## Render
Build command: `npm install`
Start command: `npm start`

Não apague `players.json` no servidor em produção; ele contém o progresso salvo.
