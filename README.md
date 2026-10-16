# RNG Pedras — Rework de raridades

## O que mudou
- Raridades, cores, dano, vida e apelidos atualizados conforme a lista solicitada.
- Comum a Lendário usam Q de 5 projéteis; o dano escala com a raridade.
- Mítico: raio fixo no mouse por 3 segundos, causando 40 de dano por segundo.
- Secreto: Pollo usa ferramentas no Q e graxa no R; Serjão usa carro no Q e ganha bônus de velocidade no R.
- GOD: RL CHARRADO aplica efeito de erva e reduz a frequência de ataques do boss; Jadrian Sandan lança barquinhas e ganha bônus de dano no R.
- ADMIN: Leo Pedreiro cria clones no Q e lança tijolos no R.
- CRIADOR: Oswaldo dispara laser no Q e invoca clones automáticos por 7 segundos no R. Não aparece na grade de raridades.
- Nomes longos não redimensionam a caixa de resultado.
- Maestria aumenta ao derrotar inimigos e bosses; inimigos com mais vida concedem mais XP de maestria.
- O modo de teste para escolher qualquer personagem foi removido.

## Chances
As chances solicitadas somam 97,4%. Para garantir que toda rolagem entregue um personagem, os 2,6% restantes são atribuídos a Comum; a interface indica a chance total como 52,6%*.

## Publicação
Use `npm install` e `npm start` no Render. Maestria e perfil são salvos no navegador do jogador.


## Ajustes de dificuldade e ADMIN
- Ataques dos bosses ficaram mais lentos, com menos projéteis rápidos e chuva de bolas menos frequente; ataques especiais avisam por mais tempo e causam menos dano.
- Tiros das naves inimigas desaparecem assim que a nave que os disparou é destruída.
- LEO PEDREIRO: F congela inimigos e projéteis hostis por 7 segundos (recarga de 25 segundos).
- LEO PEDREIRO: L alterna entre rajada normal e tiro pesado único, mais lento, com dano multiplicado por 3,5.

## Balanceamento recente
- RL CHARRADO nerfado: o Q causa menos dano e reduz o ritmo do boss por 3 segundos em vez de 5; o R concede velocidade por 4 segundos e tem recarga de 22 segundos.
- LEO PEDREIRO: F para o tempo por 7 segundos, com recarga reduzida para 15 segundos.
- Todas as raridades podem apertar L para alternar entre rajada e tiro pesado. O tiro pesado viaja mais devagar, tem intervalo de 0,9 segundo e causa 3,5 vezes o dano base da raridade equipada.


Ajuste mais recente: a habilidade F do LEO PEDREIRO para o tempo por 4 segundos e tem recarga de 20 segundos.

## Evolução da nave (GOD, ADMIN e CRIADOR)
- Exclusiva das raridades GOD, ADMIN e CRIADOR no modo shooter.
- A cada 3 abates para a primeira evolução, depois a cada 6, 9, 12 e 15 abates acumulados, aparece uma escolha de melhoria e a partida pausa até selecionar.
- Melhorias acumuláveis: Canhão Duplo (+2 projéteis), Atirador (+22% dano), Guarda Lateral (+2 tiros laterais), Tanque (+25% de vida máxima e cura), Metralhadora (+12% velocidade de tiro e +8% dano).
- A evolução é reiniciada ao começar uma nova partida; não altera raridades abaixo de GOD.


## Correção do sistema de evolução
- Adicionado contador visível de abates/evolução para GOD, ADMIN e CRIADOR.
- A evolução é acionada diretamente nos eventos reais de destruir pedras, naves inimigas ou bosses.
- Metas acumuladas: 3, 6, 9, 12 e 15 abates.


## Evolução de nave (GOD, ADMIN e CRIADOR)
As evoluções agora exigem 500, 1.000, 1.500, 2.000 e 2.500 abates acumulados na partida para liberar cada uma das cinco escolhas. Apenas GOD, ADMIN e CRIADOR podem evoluir.


## Sistema de evolução para todas as raridades
- Agora todas as raridades podem evoluir, com a primeira evolução em 500 abates e metas seguintes em 1.000, 1.500, 2.000 e 2.500 abates.
- A melhoria Guarda Lateral não aparece para Mítico, Secreto, GOD, ADMIN e CRIADOR, pois essas raridades já disparam muitos projéteis.


Atualização: para as raridades MÍTICO, SECRETO, GOD, ADMIN e CRIADOR, a melhoria que substitui a Guarda Lateral é NAVE AUXILIAR. Ela acompanha a nave e dispara automaticamente a cada 1,4 segundo, causando pouco dano (máximo de 10 por projétil). Para raridades abaixo de Mítico, a opção Guarda Lateral continua disponível. O sistema de evolução continua exigindo 500 abates por marco.


## Balanceamento de vida por raridade
- Comum: 250 HP (recebe 60% do dano).
- Raro: 400 HP (recebe 68% do dano).
- Épico: 550 HP (recebe 76% do dano).
- Lendário: 700 HP (recebe 84% do dano).
- Mítico: 900 HP (recebe 92% do dano).
- Secreto: 1.100 HP (recebe 95% do dano).
- GOD: 1.500 HP; ADMIN: 2.000 HP; CRIADOR: 2.500 HP.
O dano recebido é ajustado por raridade contra tiros inimigos, ataques de bosses e pedras que escapam da tela.


- Bosses now appear after 75 total kills (rocks and enemy ships), instead of 30, giving players more time to prepare.


## Novo modo online: Raid cooperativa
- O botão PVP ONLINE agora abre uma raid cooperativa: até 10 jogadores se unem contra o mesmo chefe, em vez de lutar um contra o outro. A sala fica aberta por 15 segundos para reunir a equipe; se lotar antes, a raid começa imediatamente.
- Os tiros e a rajada de cada jogador reduzem a mesma barra de vida do chefe.
- O chefe ataca periodicamente um dos aliados; use movimento e escudo para sobreviver.
- Cada chefe derrotado inicia uma nova fase. A vida do chefe cresce 70% por fase e o dano/ritmo dos ataques aumenta.
- Para testar online, publique os arquivos no Render com `npm install` e `npm start`; a raid começa após os 15 segundos da sala, ou antes se entrarem 10 jogadores.
