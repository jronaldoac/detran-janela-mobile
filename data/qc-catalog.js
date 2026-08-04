/**
 * Catálogo de rotas públicas do QConcursos para o edital DETRAN/AL 2026.
 * v0.2.0 — rotas exatas quando disponíveis; busca assistida curta como fallback.
 */
(() => {
  'use strict';

  const ROOT = 'https://www.qconcursos.com/questoes-de-concursos/disciplinas/';
  const entry = (id, block, label, path, options = {}) => ({
    id,
    block,
    label,
    url: `${ROOT}${path.replace(/^\//, '')}`,
    query: options.query || '',
    quality: options.quality || 'exact',
    aliases: options.aliases || [],
    source: options.source || 'edital',
    fallbackPath: options.fallbackPath ? `${ROOT}${options.fallbackPath.replace(/^\//, '')}` : '',
    verifiedAt: options.verifiedAt || '2026-08-04'
  });

  const assisted = (id, block, label, disciplinePath, query, aliases = []) => entry(
    id, block, label, `${disciplinePath}/questoes`,
    { query, aliases, quality: 'assisted', fallbackPath: `${disciplinePath}/questoes` }
  );

  const catalog = [
    // Língua Portuguesa
    entry('pt-interpretacao', 'LÍNGUA PORTUGUESA', 'Compreensão e interpretação de textos', 'letras-portugues/interpretacao-de-textos/questoes', { aliases: ['compreensão de textos'] }),
    entry('pt-tipologia', 'LÍNGUA PORTUGUESA', 'Tipos e gêneros textuais', 'letras-portugues/tipologia-textual/questoes', { aliases: ['gêneros textuais'] }),
    entry('pt-ortografia', 'LÍNGUA PORTUGUESA', 'Ortografia oficial', 'letras-portugues/ortografia/questoes'),
    entry('pt-coesao', 'LÍNGUA PORTUGUESA', 'Coesão, referenciação e conectores', 'letras-portugues/coesao-e-coerencia/questoes', { aliases: ['referenciação', 'conectores'] }),
    assisted('pt-verbos', 'LÍNGUA PORTUGUESA', 'Tempos e modos verbais', 'letras-portugues', 'tempos e modos verbais', []),
    assisted('pt-classes', 'LÍNGUA PORTUGUESA', 'Classes de palavras', 'letras-portugues', 'classes de palavras', ['morfologia']),
    assisted('pt-coordenacao', 'LÍNGUA PORTUGUESA', 'Coordenação', 'letras-portugues', 'orações coordenadas', []),
    assisted('pt-subordinacao', 'LÍNGUA PORTUGUESA', 'Subordinação', 'letras-portugues', 'orações subordinadas', []),
    assisted('pt-pontuacao', 'LÍNGUA PORTUGUESA', 'Pontuação', 'letras-portugues', 'pontuação', []),
    assisted('pt-concordancia', 'LÍNGUA PORTUGUESA', 'Concordância verbal e nominal', 'letras-portugues', 'concordância verbal e nominal', []),
    assisted('pt-regencia', 'LÍNGUA PORTUGUESA', 'Regência verbal e nominal', 'letras-portugues', 'regência verbal e nominal', []),
    assisted('pt-crase', 'LÍNGUA PORTUGUESA', 'Crase', 'letras-portugues', 'crase', []),
    assisted('pt-colocacao', 'LÍNGUA PORTUGUESA', 'Colocação pronominal', 'letras-portugues', 'colocação pronominal', []),
    assisted('pt-semantica', 'LÍNGUA PORTUGUESA', 'Significação das palavras', 'letras-portugues', 'semântica', ['significação das palavras']),
    assisted('pt-reescrita', 'LÍNGUA PORTUGUESA', 'Reescrita e reorganização textual', 'letras-portugues', 'reescrita de frases', ['reescrita de textos']),

    // Raciocínio lógico
    assisted('rl-proposicoes', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Proposições simples e compostas', 'matematica-raciocinio-logico', 'proposições', []),
    assisted('rl-tabela', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Tabelas-verdade', 'matematica-raciocinio-logico', 'tabela verdade', []),
    assisted('rl-equivalencias', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Equivalências lógicas', 'matematica-raciocinio-logico', 'equivalências lógicas', []),
    assisted('rl-estruturas', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Estruturas lógicas e dedução', 'matematica-raciocinio-logico', 'estruturas lógicas', []),
    assisted('rl-padroes', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Sequências, padrões, gráficos e tabelas', 'matematica-raciocinio-logico', 'sequências lógicas', ['gráficos e tabelas']),
    assisted('rl-contagem', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Problemas de contagem', 'matematica-raciocinio-logico', 'análise combinatória', ['contagem']),
    assisted('rl-probabilidade', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Probabilidade', 'matematica-raciocinio-logico', 'probabilidade', []),
    assisted('rl-falacias', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Falácias', 'matematica-raciocinio-logico', 'falácias', []),
    assisted('rl-estatistica', 'RACIOCÍNIO LÓGICO E ANALÍTICO', 'Estatística descritiva', 'matematica-raciocinio-logico', 'média moda mediana desvio padrão', []),

    // Tecnologia da Informação — conhecimentos básicos
    assisted('ti-windows', 'TECNOLOGIA DA INFORMAÇÃO', 'Windows', 'tecnologia-da-informacao-nocoes-de-informatica', 'Windows', []),
    assisted('ti-office', 'TECNOLOGIA DA INFORMAÇÃO', 'Microsoft Office', 'tecnologia-da-informacao-nocoes-de-informatica', 'Microsoft Office', ['Word', 'Excel', 'PowerPoint']),
    assisted('ti-internet', 'TECNOLOGIA DA INFORMAÇÃO', 'Internet e intranet', 'tecnologia-da-informacao-nocoes-de-informatica', 'Internet e intranet', []),
    assisted('ti-navegadores', 'TECNOLOGIA DA INFORMAÇÃO', 'Navegadores', 'tecnologia-da-informacao-nocoes-de-informatica', 'navegadores', ['Edge', 'Firefox', 'Chrome']),
    assisted('ti-email', 'TECNOLOGIA DA INFORMAÇÃO', 'Correio eletrônico e Outlook', 'tecnologia-da-informacao-nocoes-de-informatica', 'correio eletrônico Outlook', []),
    entry('ti-cloud-basic', 'TECNOLOGIA DA INFORMAÇÃO', 'Cloud computing e cloud storage', 'tecnologia-da-informacao-nocoes-de-informatica/nuvem-cloud-computing-e-cloud-storage/questoes', { aliases: ['computação em nuvem', 'armazenamento na nuvem'] }),
    assisted('ti-arquivos', 'TECNOLOGIA DA INFORMAÇÃO', 'Arquivos, pastas e programas', 'tecnologia-da-informacao-nocoes-de-informatica', 'arquivos e pastas', []),
    entry('ti-backup', 'TECNOLOGIA DA INFORMAÇÃO', 'Backup', 'tecnologia-da-informacao-nocoes-de-informatica/procedimento-de-seguranca-e-back-up/questoes', { aliases: ['procedimentos de backup'] }),
    assisted('ti-malware', 'TECNOLOGIA DA INFORMAÇÃO', 'Malware, vírus e pragas virtuais', 'tecnologia-da-informacao-nocoes-de-informatica', 'malware vírus worms', []),
    entry('ti-seguranca-basic', 'TECNOLOGIA DA INFORMAÇÃO', 'Segurança da informação básica', 'tecnologia-da-informacao-nocoes-de-informatica/seguranca-da-informacao/questoes', { aliases: ['antivírus', 'firewall', 'antispyware'] }),

    // Direito Constitucional
    assisted('dc-principios', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Princípios fundamentais', 'direito-direito-constitucional', 'princípios fundamentais', []),
    assisted('dc-direitos', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Direitos e garantias fundamentais', 'direito-direito-constitucional', 'direitos e garantias fundamentais', []),
    assisted('dc-controle', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Controle de constitucionalidade', 'direito-direito-constitucional', 'controle de constitucionalidade', []),
    assisted('dc-estado', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Organização do Estado', 'direito-direito-constitucional', 'organização do Estado', []),
    assisted('dc-poderes', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Organização dos Poderes', 'direito-direito-constitucional', 'organização dos poderes', []),
    assisted('dc-financas', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Finanças públicas e orçamento', 'direito-direito-constitucional', 'finanças públicas orçamento', []),
    assisted('dc-ordem-economica', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Ordem econômica e financeira', 'direito-direito-constitucional', 'ordem econômica e financeira', []),
    assisted('dc-stf', 'NOÇÕES DE DIREITO CONSTITUCIONAL', 'Jurisprudência do STF', 'direito-direito-constitucional', 'jurisprudência STF', []),

    // Direito Administrativo
    assisted('da-principios', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Princípios da administração pública', 'direito-direito-administrativo', 'princípios da administração pública', []),
    assisted('da-poderes', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Poderes administrativos', 'direito-direito-administrativo', 'poderes administrativos', []),
    assisted('da-servicos', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Serviços públicos', 'direito-direito-administrativo', 'serviços públicos', []),
    assisted('da-delegacao', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Concessão, permissão e autorização', 'direito-direito-administrativo', 'concessão permissão autorização', []),
    assisted('da-atos', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Atos administrativos', 'direito-direito-administrativo', 'ato administrativo', []),
    assisted('da-organizacao', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Organização administrativa', 'direito-direito-administrativo', 'organização administrativa', []),
    assisted('da-orgaos', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Órgãos públicos', 'direito-direito-administrativo', 'órgãos públicos', []),
    assisted('da-servidores', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Servidores públicos', 'direito-direito-administrativo', 'servidores públicos', []),
    assisted('da-controle', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Controle e responsabilidade do Estado', 'direito-direito-administrativo', 'controle da administração responsabilidade civil do Estado', []),
    assisted('da-improbidade', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Improbidade administrativa — Lei 8.429/1992', 'direito-direito-administrativo', 'Lei 8.429 improbidade administrativa', []),
    assisted('da-licitacoes', 'NOÇÕES DE DIREITO ADMINISTRATIVO', 'Licitações e contratos — Lei 14.133/2021', 'direito-direito-administrativo', 'Lei 14.133 licitações', []),

    // Direito Civil
    assisted('cv-fontes', 'NOÇÕES DE DIREITO CIVIL', 'Fontes, princípios e normas gerais', 'direito-direito-civil', 'fontes do direito civil', []),
    assisted('cv-pessoas', 'NOÇÕES DE DIREITO CIVIL', 'Pessoas naturais e jurídicas', 'direito-direito-civil', 'pessoas naturais e jurídicas', []),
    assisted('cv-domicilio', 'NOÇÕES DE DIREITO CIVIL', 'Domicílio', 'direito-direito-civil', 'domicílio', []),
    assisted('cv-bens', 'NOÇÕES DE DIREITO CIVIL', 'Bens', 'direito-direito-civil', 'bens', []),
    assisted('cv-atos', 'NOÇÕES DE DIREITO CIVIL', 'Atos jurídicos', 'direito-direito-civil', 'atos jurídicos', []),
    assisted('cv-negocio', 'NOÇÕES DE DIREITO CIVIL', 'Negócio jurídico', 'direito-direito-civil', 'negócio jurídico', []),
    assisted('cv-prescricao', 'NOÇÕES DE DIREITO CIVIL', 'Prescrição e decadência', 'direito-direito-civil', 'prescrição e decadência', []),
    assisted('cv-prova', 'NOÇÕES DE DIREITO CIVIL', 'Prova', 'direito-direito-civil', 'prova no direito civil', []),
    assisted('cv-obrigacoes', 'NOÇÕES DE DIREITO CIVIL', 'Obrigações', 'direito-direito-civil', 'obrigações', []),
    assisted('cv-contratos', 'NOÇÕES DE DIREITO CIVIL', 'Contratos', 'direito-direito-civil', 'contratos', []),
    assisted('cv-responsabilidade', 'NOÇÕES DE DIREITO CIVIL', 'Responsabilidade civil', 'direito-direito-civil', 'responsabilidade civil', []),
    assisted('cv-reais', 'NOÇÕES DE DIREITO CIVIL', 'Posse, propriedade e direitos reais', 'direito-direito-civil', 'posse propriedade direitos reais', []),

    // Estado de Alagoas
    entry('al-historia', 'CONHECIMENTOS DO ESTADO DE ALAGOAS', 'História e formação de Alagoas', 'historia-historia-e-geografia-de-estados-e-municipios/historia-e-geografia-do-estado-de-alagoas/questoes', { aliases: ['colonização', 'emancipação', 'província'] }),
    entry('al-palmares', 'CONHECIMENTOS DO ESTADO DE ALAGOAS', 'Quilombo dos Palmares e Zumbi', 'historia-historia-e-geografia-de-estados-e-municipios/historia-e-geografia-do-estado-de-alagoas/questoes', { query: 'Quilombo dos Palmares Zumbi', quality: 'assisted' }),
    entry('al-geografia', 'CONHECIMENTOS DO ESTADO DE ALAGOAS', 'Geografia de Alagoas', 'historia-historia-e-geografia-de-estados-e-municipios/historia-e-geografia-do-estado-de-alagoas/questoes', { query: 'geografia de Alagoas Rio São Francisco', quality: 'assisted' }),
    entry('al-politica', 'CONHECIMENTOS DO ESTADO DE ALAGOAS', 'Organização político-administrativa', 'historia-historia-e-geografia-de-estados-e-municipios/historia-e-geografia-do-estado-de-alagoas/questoes', { query: 'organização política Alagoas', quality: 'assisted' }),
    entry('al-economia', 'CONHECIMENTOS DO ESTADO DE ALAGOAS', 'Economia de Alagoas', 'historia-historia-e-geografia-de-estados-e-municipios/historia-e-geografia-do-estado-de-alagoas/questoes', { query: 'economia de Alagoas', quality: 'assisted' }),
    entry('al-cultura', 'CONHECIMENTOS DO ESTADO DE ALAGOAS', 'Cultura e patrimônio alagoano', 'historia-historia-e-geografia-de-estados-e-municipios/historia-e-geografia-do-estado-de-alagoas/questoes', { query: 'cultura patrimônio Alagoas', quality: 'assisted' }),
    entry('al-constituicao', 'CONHECIMENTOS DO ESTADO DE ALAGOAS', 'Constituição do Estado de Alagoas', 'historia-historia-e-geografia-de-estados-e-municipios/historia-e-geografia-do-estado-de-alagoas/questoes', { query: 'Constituição do Estado de Alagoas', quality: 'assisted' }),

    // Trânsito
    entry('transito-ctb', 'LEGISLAÇÃO DE TRÂNSITO', 'Código de Trânsito Brasileiro — CTB', 'direito-legislacao-de-transito/lei-n-9-503-de-1997-codigo-de-transito-brasileiro-ctb-visao-geral-e-como-estudar-disposicoes-preliminares-conceitos-e-definicoes/questoes', { fallbackPath: 'direito-legislacao-de-transito/questoes' }),
    entry('transito-contran', 'LEGISLAÇÃO DE TRÂNSITO', 'Resoluções do CONTRAN', 'direito-legislacao-de-transito/resolucoes-do-contran/questoes', { aliases: ['CONTRAN'] }),

    // Segurança da Informação
    entry('seg-conceitos', 'SEGURANÇA DA INFORMAÇÃO', 'Confidencialidade, integridade, disponibilidade, autenticidade e não repúdio', 'tecnologia-da-informacao-seguranca-da-informacao/conceitos-basicos-em-seguranca-da-informacao/questoes'),
    entry('seg-autenticacao', 'SEGURANÇA DA INFORMAÇÃO', 'Autenticação, MFA, OAuth 2.0, OpenID Connect e JWT', 'tecnologia-da-informacao-seguranca-da-informacao/autenticacao/questoes', { aliases: ['MFA', 'OAuth', 'JWT', 'OpenID Connect'] }),
    entry('seg-vulnerabilidades', 'SEGURANÇA DA INFORMAÇÃO', 'Vulnerabilidades em aplicações — SQL Injection, XSS e CSRF', 'tecnologia-da-informacao-seguranca-da-informacao/seguranca-de-sistemas-de-informacao/questoes', { query: 'SQL Injection XSS CSRF', quality: 'assisted' }),
    entry('seg-owasp', 'SEGURANÇA DA INFORMAÇÃO', 'OWASP e segurança de aplicações web', 'tecnologia-da-informacao-seguranca-da-informacao/seguranca-de-sistemas-de-informacao/questoes', { query: 'OWASP', quality: 'assisted' }),
    entry('seg-ataques', 'SEGURANÇA DA INFORMAÇÃO', 'Ataques e ameaças — DDoS, spoofing, phishing e brute force', 'tecnologia-da-informacao-seguranca-da-informacao/ataques-e-ameacas/questoes', { aliases: ['DDoS', 'DoS', 'phishing'] }),
    entry('seg-criptografia', 'SEGURANÇA DA INFORMAÇÃO', 'Criptografia simétrica, assimétrica e proteção de dados', 'tecnologia-da-informacao-seguranca-da-informacao/criptografia/questoes'),
    entry('seg-controles', 'SEGURANÇA DA INFORMAÇÃO', 'Firewalls, IDS, IPS, antivírus e controles', 'tecnologia-da-informacao-seguranca-da-informacao/controles-de-seguranca/questoes'),
    entry('seg-assinatura', 'SEGURANÇA DA INFORMAÇÃO', 'Assinatura digital', 'tecnologia-da-informacao-seguranca-da-informacao/assinatura-digital/questoes'),
    entry('seg-certificacao', 'SEGURANÇA DA INFORMAÇÃO', 'Certificação digital e PKI', 'tecnologia-da-informacao-seguranca-da-informacao/certificacao-digital-em-seguranca-da-informacao/questoes', { aliases: ['ICP-Brasil', 'PKI'] }),
    assisted('seg-lgpd', 'SEGURANÇA DA INFORMAÇÃO', 'LGPD — Lei 13.709/2018', 'tecnologia-da-informacao-seguranca-da-informacao', 'LGPD', ['Lei 13.709']),
    entry('seg-iso27001', 'SEGURANÇA DA INFORMAÇÃO', 'ISO/IEC 27001', 'tecnologia-da-informacao-seguranca-da-informacao/norma-iso-27001/questoes'),
    entry('seg-iso27002', 'SEGURANÇA DA INFORMAÇÃO', 'ISO/IEC 27002', 'tecnologia-da-informacao-seguranca-da-informacao/iso-27002/questoes'),
    entry('seg-continuidade', 'SEGURANÇA DA INFORMAÇÃO', 'Continuidade de negócios e ISO 22301', 'tecnologia-da-informacao-seguranca-da-informacao/plano-de-continuidade-de-negocios/questoes'),

    // Infraestrutura e Redes
    entry('infra-redes', 'INFRAESTRUTURA EM TI', 'Redes de computadores', 'tecnologia-da-informacao-redes-de-computadores/questoes'),
    entry('infra-tcpip', 'INFRAESTRUTURA EM TI', 'Arquitetura TCP/IP', 'tecnologia-da-informacao-redes-de-computadores/arquitetura-tcp-ip/questoes'),
    entry('infra-tcp', 'INFRAESTRUTURA EM TI', 'TCP', 'tecnologia-da-informacao-redes-de-computadores/tcp-transmission-control-protocol/questoes'),
    entry('infra-ip', 'INFRAESTRUTURA EM TI', 'IP e endereçamento', 'tecnologia-da-informacao-redes-de-computadores/ip-internet-protocol/questoes'),
    entry('infra-gerencia', 'INFRAESTRUTURA EM TI', 'Gerência de redes', 'tecnologia-da-informacao-redes-de-computadores/gerencia-de-redes/questoes'),
    entry('infra-snmp', 'INFRAESTRUTURA EM TI', 'SNMP', 'tecnologia-da-informacao-redes-de-computadores/snmp-simple-network-management-protocol/questoes'),
    entry('infra-mib', 'INFRAESTRUTURA EM TI', 'MIB e SMI', 'tecnologia-da-informacao-redes-de-computadores/mib-management-information-base/questoes'),
    entry('infra-mpls', 'INFRAESTRUTURA EM TI', 'MPLS', 'tecnologia-da-informacao-redes-de-computadores/mpls/questoes'),
    assisted('infra-wireless', 'INFRAESTRUTURA EM TI', 'Redes sem fio, 802.11, 802.1X, EAP, WEP e WPA', 'tecnologia-da-informacao-redes-de-computadores', '802.11 WPA 802.1X', []),
    entry('infra-switches', 'INFRAESTRUTURA EM TI', 'Switching e switches', 'tecnologia-da-informacao-redes-de-computadores/switches/questoes'),
    entry('infra-roteadores', 'INFRAESTRUTURA EM TI', 'Routing e roteadores', 'tecnologia-da-informacao-redes-de-computadores/roteadores/questoes'),
    entry('infra-seguranca-redes', 'INFRAESTRUTURA EM TI', 'Segurança em redes, firewall, IDS, IPS, NAT e VPN', 'tecnologia-da-informacao-seguranca-da-informacao/controles-de-seguranca/questoes', { query: 'firewall IDS IPS NAT VPN', quality: 'assisted' }),
    entry('infra-malware', 'INFRAESTRUTURA EM TI', 'Malware e ataques de rede', 'tecnologia-da-informacao-seguranca-da-informacao/ataques-e-ameacas/questoes'),
    entry('infra-crypto', 'INFRAESTRUTURA EM TI', 'Criptografia, protocolos e certificação', 'tecnologia-da-informacao-seguranca-da-informacao/criptografia/questoes'),
    entry('infra-cloud', 'INFRAESTRUTURA EM TI', 'Cloud computing', 'tecnologia-da-informacao-sistemas-operacionais/cloud-computing/questoes'),
    entry('infra-virtualizacao', 'INFRAESTRUTURA EM TI', 'Virtualização', 'tecnologia-da-informacao-sistemas-operacionais/virtualizacao/questoes'),
    entry('infra-cluster', 'INFRAESTRUTURA EM TI', 'Alta disponibilidade, clusters e failover', 'tecnologia-da-informacao-sistemas-operacionais/clusters/questoes'),
    assisted('infra-balanceamento', 'INFRAESTRUTURA EM TI', 'Balanceamento de carga e replicação de estado', 'tecnologia-da-informacao-redes-de-computadores', 'balanceamento de carga failover', []),
    entry('infra-armazenamento', 'INFRAESTRUTURA EM TI', 'Armazenamento de dados', 'tecnologia-da-informacao-redes-de-computadores/armazenamento-de-dados-em-redes-de-computadores/questoes'),
    entry('infra-raid', 'INFRAESTRUTURA EM TI', 'RAID', 'tecnologia-da-informacao-redes-de-computadores/raid-redundant-array-of-independent-disks/questoes'),
    entry('infra-san', 'INFRAESTRUTURA EM TI', 'SAN', 'tecnologia-da-informacao-redes-de-computadores/san-storage-area-network/questoes'),
    entry('infra-nas', 'INFRAESTRUTURA EM TI', 'NAS', 'tecnologia-da-informacao-redes-de-computadores/armazenamento-de-dados-em-redes-de-computadores/questoes', { query: 'NAS', quality: 'assisted' }),
    entry('infra-backup', 'INFRAESTRUTURA EM TI', 'Tecnologias de backup', 'tecnologia-da-informacao-seguranca-da-informacao/backup-em-seguranca-da-informacao/questoes'),
    assisted('infra-dedup', 'INFRAESTRUTURA EM TI', 'Deduplicação', 'tecnologia-da-informacao-redes-de-computadores', 'deduplicação', []),
    entry('infra-containers', 'INFRAESTRUTURA EM TI', 'Docker, Kubernetes e conteinerização', 'tecnologia-da-informacao-sistemas-operacionais/virtualizacao/questoes', { query: 'Docker Kubernetes', quality: 'assisted' }),
    assisted('infra-devops', 'INFRAESTRUTURA EM TI', 'DevOps', 'tecnologia-da-informacao-sistemas-operacionais', 'DevOps', []),

    // Sistemas Operacionais
    assisted('so-fundamentos', 'SISTEMAS OPERACIONAIS', 'Fundamentos de sistemas operacionais', 'tecnologia-da-informacao-sistemas-operacionais', 'fundamentos sistemas operacionais', []),
    assisted('so-processos', 'SISTEMAS OPERACIONAIS', 'Gestão de processos', 'tecnologia-da-informacao-sistemas-operacionais', 'processos', []),
    assisted('so-memoria', 'SISTEMAS OPERACIONAIS', 'Gestão de memória', 'tecnologia-da-informacao-sistemas-operacionais', 'gerenciamento de memória', []),
    assisted('so-io', 'SISTEMAS OPERACIONAIS', 'Entrada e saída', 'tecnologia-da-informacao-sistemas-operacionais', 'entrada e saída', []),
    assisted('so-admin', 'SISTEMAS OPERACIONAIS', 'Instalação e administração de sistemas operacionais', 'tecnologia-da-informacao-sistemas-operacionais', 'administração de sistemas operacionais', []),
    assisted('so-windows-redhat', 'SISTEMAS OPERACIONAIS', 'Windows Server e Red Hat Enterprise Linux', 'tecnologia-da-informacao-sistemas-operacionais', 'Windows Server Red Hat Enterprise Linux', []),
    entry('so-ad', 'SISTEMAS OPERACIONAIS', 'Active Directory', 'tecnologia-da-informacao-sistemas-operacionais/administracao-de-usuarios-ad-active-directory/questoes'),
    entry('so-ldap', 'SISTEMAS OPERACIONAIS', 'LDAP', 'tecnologia-da-informacao-redes-de-computadores/ldap-lightweight-directory-access-protocol/questoes'),
    entry('so-interoperabilidade', 'SISTEMAS OPERACIONAIS', 'Interoperabilidade e redes Windows', 'tecnologia-da-informacao-redes-de-computadores/redes-windows/questoes'),

    // Governança de TI — assuntos atômicos
    entry('gov-cobit2019', 'GOVERNANÇA DE TI', 'COBIT 2019', 'tecnologia-da-informacao-governanca-de-ti/cobit-2019/questoes'),
    entry('gov-iso38500', 'GOVERNANÇA DE TI', 'ISO/IEC 38500', 'tecnologia-da-informacao-governanca-de-ti/norma-nbr-iso-iec-38500-2009/questoes'),
    assisted('gov-iso31000', 'GOVERNANÇA DE TI', 'ISO 31000', 'tecnologia-da-informacao-governanca-de-ti', 'ISO 31000', []),
    assisted('gov-coso', 'GOVERNANÇA DE TI', 'COSO', 'tecnologia-da-informacao-governanca-de-ti', 'COSO', []),
    entry('gov-itil4', 'GOVERNANÇA DE TI', 'ITIL 4', 'tecnologia-da-informacao-governanca-de-ti/itil-4/questoes'),
    entry('gov-pmbok7', 'GOVERNANÇA DE TI', 'PMBOK 7ª edição', 'tecnologia-da-informacao-governanca-de-ti/planejamento-e-gestao-de-sistemas-de-ti/questoes', { query: 'PMBOK 7', quality: 'assisted' }),
    entry('gov-scrum', 'GOVERNANÇA DE TI', 'Scrum', 'tecnologia-da-informacao-engenharia-de-software/scrum/questoes'),
    entry('gov-kanban', 'GOVERNANÇA DE TI', 'Kanban', 'tecnologia-da-informacao-governanca-de-ti/gerencia-de-processos/questoes', { query: 'Kanban', quality: 'assisted' }),
    entry('gov-peti', 'GOVERNANÇA DE TI', 'PETI e PDTI', 'tecnologia-da-informacao-governanca-de-ti/planejamento-estrategico-de-ti-peti/questoes'),
    assisted('gov-contratacoes', 'GOVERNANÇA DE TI', 'Contratações de TI no setor público', 'tecnologia-da-informacao-governanca-de-ti', 'contratações de TI setor público', []),
    entry('gov-bpmn', 'GOVERNANÇA DE TI', 'BPMN e gestão de processos', 'tecnologia-da-informacao-governanca-de-ti/gerencia-de-processos/questoes'),
    entry('gov-bsc', 'GOVERNANÇA DE TI', 'BSC e indicadores de desempenho', 'tecnologia-da-informacao-governanca-de-ti/balanced-scorecard-em-governanca-de-t-i-bsc/questoes'),
    entry('gov-iso27001', 'GOVERNANÇA DE TI', 'ISO/IEC 27001', 'tecnologia-da-informacao-seguranca-da-informacao/norma-iso-27001/questoes'),
    entry('gov-iso27002', 'GOVERNANÇA DE TI', 'ISO/IEC 27002', 'tecnologia-da-informacao-seguranca-da-informacao/iso-27002/questoes'),
    entry('gov-iso22301', 'GOVERNANÇA DE TI', 'ISO 22301 e continuidade de negócios', 'tecnologia-da-informacao-seguranca-da-informacao/plano-de-continuidade-de-negocios/questoes'),
    assisted('gov-nist', 'GOVERNANÇA DE TI', 'NIST Cybersecurity Framework', 'tecnologia-da-informacao-seguranca-da-informacao', 'NIST Cybersecurity Framework', [])
  ];

  window.QC_ROUTE_CATALOG = Object.freeze(catalog);
})();
