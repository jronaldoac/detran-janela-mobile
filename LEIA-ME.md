# DETRAN Janela Mobile v0.1

Aplicativo móvel independente para escolher automaticamente o que estudar em janelas curtas e abrir o QConcursos já com filtros básicos.

## O que já faz

- usa o conteúdo programático completo do DETRAN-AL 2026;
- exclui `ATUALIDADES (DISCURSIVA)` das missões objetivas;
- sugere missões de 5, 10, 15, 20, 30 ou 45 minutos;
- prioriza conhecimentos específicos, assuntos frequentes, revisões vencidas e baixo desempenho;
- abre o QConcursos com banca CEBRASPE, modalidade Certo/Errado e exclusão de anuladas/desatualizadas;
- permite cadastrar a URL exata de um filtro salvo para cada assunto;
- registra somente o resumo da sessão, sem copiar questões;
- atualiza fraquezas e revisões localmente;
- funciona como PWA e fica disponível offline depois da primeira abertura;
- exporta JSON para futura integração com o sistema do computador.

## Testar no computador

Execute `ABRIR_NO_PC.bat` e abra `http://127.0.0.1:8088`.

## Usar no celular

A PWA precisa ser publicada em HTTPS. A forma mais simples é:

1. criar um repositório no GitHub;
2. enviar o conteúdo desta pasta;
3. ativar GitHub Pages em **Settings > Pages**;
4. abrir a URL gerada no Edge ou Chrome do celular;
5. usar **Adicionar à tela inicial** ou **Instalar aplicativo**.

Os dados de estudo ficam no próprio navegador do celular. A pasta publicada não contém credenciais do QConcursos nem seus resultados pessoais.

## Filtros do QConcursos

A busca automática usa parâmetros públicos de URL. Para uma correspondência perfeita com a taxonomia do QConcursos:

1. abra a missão;
2. ajuste o filtro no QConcursos, se necessário;
3. salve o filtro no QConcursos;
4. copie a URL;
5. volte ao DETRAN Janela, toque na engrenagem da missão e cole a URL.

Da próxima vez, o aplicativo abrirá diretamente esse filtro.

## Integração futura

Use **Dados > Exportar JSON**. Esse arquivo contém:

- sessões móveis;
- minutos e questões;
- acertos, erros e brancos;
- confiança;
- desempenho por tópico;
- datas de revisão;
- URLs dos filtros salvos.

Esse schema será usado posteriormente para integrar o celular ao sistema principal do computador.
