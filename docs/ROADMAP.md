# Plano de desenvolvimento e critérios de homologação

## Base atual — sem escrita em RP2040
- [x] Inspeção offline de BIN/ELF32 ARM.
- [x] Verificação dos hashes e registros de pacotes HS-LEITURAS-1.
- [x] Exportação CSV claramente identificada como leitura não homologada para envio.
- [ ] Integrar interface Windows de leitura USB com testes de regressão.
- [ ] Confirmar decodificação dos registros contra a estrutura C da revisão real.

## Etapa: gravação de leituras em Gateway substituto
- [ ] Extrair mapa ativo do equipamento de destino com evidência.
- [ ] Salvar imagem integral prévia e verificar hash.
- [ ] Modificar somente arquivos backup/* de um LittleFS **existente**, sem formatar.
- [ ] Comparar integralmente settings, certificados, licença, calibração e demais arquivos antes e depois.
- [ ] Cobrir duplicatas, partição cheia, desconexão USB, reinício no meio da operação e corte de alimentação.
- [ ] Testar em Gateway de bancada descartável e confirmar suas configurações após reboot.
- [ ] Só depois habilitar gravação física na interface.

## Etapa: envio à plataforma
- [ ] Ler definição exata de tópico, payload, IDs, registros e ACK na revisão usada pelo Gateway.
- [ ] Reproduzir protocolo em simulador de broker local.
- [ ] Exigir TLS e credenciais autorizadas específicas, nunca reutilizar chaves de cliente sem autorização.
- [ ] Registrar ACK de broker separadamente de aceitação da plataforma e controlar duplicações.
- [ ] Validar com administrador da plataforma em ambiente de teste.

## Regra de aceitação
Uma função não é considerada validada só porque o picotool executou VERIFY ou porque os testes simulados passaram. O resultado deve ser comprovado no hardware e pela aplicação após reinício.
