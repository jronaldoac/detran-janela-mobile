# HS Recovery

Ferramenta de recuperação das leituras armazenadas em Gateways Hidrosolo RP2040.

**Estado atual: núcleo offline de leitura e inspeção. Não homologado para gravação no RP2040 nem para publicação MQTT.**

## O que funciona nesta base

- Inspeção de BIN e ELF32 ARM, sem exigir a pasta do código-fonte do firmware.
- Detecção **candidata** de início LittleFS quando há superblocos consecutivos; uma assinatura, sozinha, não valida a partição.
- Verificação de pacotes `.hsleituras` com hashes SHA-256, contagem e limites contra arquivos malformados.
- Decodificação conservadora de registros binários de dez bytes e exportação CSV. Data, escala e unidades permanecem sujeitas ao contrato da versão do firmware.

## Executar os testes (Windows / Linux, Python >= 3.10)

```powershell
python -m unittest discover -s tests -v
$env:PYTHONPATH = "src"
python -m hs_recovery.cli inspecionar "C:\caminho\firmware.elf"
python -m hs_recovery.cli inspecionar "C:\caminho\factory_firmware.bin"
python -m hs_recovery.cli leituras "C:\caminho\leituras.hsleituras" --csv "C:\caminho\leituras.csv"
```

Os comandos apresentados **não acessam nem modificam a flash**.

## Compromissos de segurança

1. Nenhum dump, certificado, chave privada, HSID real de cliente ou arquivo `settings` será publicado neste repositório.
2. A gravação física permanece desativada até a verificação de preservação das configurações do equipamento destino, simulações de falha de energia e validação em bancada.
3. A publicação MQTT ficará desativada até a reconstrução comprovada do contrato JSON, tópico, autenticação e confirmação de processamento.
4. Um mapa de partições somente será considerado confirmado quando houver evidência específica da revisão do firmware. BIN/ELF podem fornecer evidências, não garantia universal.
5. O código do projeto do Gateway poderá ser utilizado no laboratório para cadastrar perfis; não será exigido do técnico no atendimento.

Histórico do antigo projeto DETRAN preservado em `archive/detran-before-hs-recovery-20261015`.

Atenção: o repositório está **público**. Não faça upload de dados de clientes.

Consulte `docs/ROADMAP.md` para próximos marcos.
