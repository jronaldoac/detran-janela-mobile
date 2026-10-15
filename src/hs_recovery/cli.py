"""Interface de linha de comando: somente arquivos locais."""
from __future__ import annotations
import argparse
import json
from .firmware import inspect
from .readings import load_archive, export_csv

def main(argv=None):
    parser = argparse.ArgumentParser(description="HS Recovery (inspeção offline)")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("inspecionar")
    p.add_argument("arquivo")
    r = sub.add_parser("leituras")
    r.add_argument("arquivo")
    r.add_argument("--csv")
    a = parser.parse_args(argv)
    if a.command == "inspecionar":
        result = inspect(a.arquivo)
    else:
        meta, rows = load_archive(a.arquivo)
        result = {"registros": len(rows), "origem": meta.get("origin", {}),
                  "arquivos": len(meta["files"]), "pronto_para_plataforma": False}
        if a.csv:
            export_csv(a.csv, meta, rows)
            result["csv"] = a.csv
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
