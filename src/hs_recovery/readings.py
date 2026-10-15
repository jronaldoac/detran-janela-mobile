"""Leitura segura de pacote .hsleituras. Nunca grava no Gateway."""
from __future__ import annotations
import csv
import hashlib
import json
from pathlib import Path
import re
import struct
import zipfile

RECORD = struct.Struct("<iBBI")  # 10 bytes; interpretação ainda dependente da revisão
NAME = re.compile(r"backup/(0|[1-9][0-9]{0,2})\Z")
MAX_ITEM = 1_048_576
MAX_TOTAL = 16_777_216

class ArchiveError(ValueError):
    pass

def parse_records(name: str, data: bytes) -> list[dict]:
    if not NAME.fullmatch(name) or len(data) % RECORD.size:
        raise ArchiveError("Nome ou comprimento de registros inválido")
    rows = []
    for start in range(0, len(data), RECORD.size):
        val, kind, index, stamp = RECORD.unpack_from(data, start)
        rows.append({
            "arquivo": name, "sequencia": start // RECORD.size,
            "timestamp_bruto": stamp, "valor_bruto": val, "tipo_bruto": kind,
            "entrada_bruta": index, "hex": data[start:start+10].hex(" "),
            "interpretação_confirmada": False
        })
    return rows

def load_archive(path: str | Path) -> tuple[dict, list[dict]]:
    with zipfile.ZipFile(path, "r") as z:
        names = z.namelist()
        if len(names) != len(set(names)) or "manifest.json" not in names:
            raise ArchiveError("Pacote incompleto ou arquivos duplicados")
        if z.getinfo("manifest.json").file_size > 131072:
            raise ArchiveError("Manifesto muito grande")
        meta = json.loads(z.read("manifest.json"))
        if meta.get("format") != "HS-LEITURAS-1":
            raise ArchiveError("Formato de pacote desconhecido")
        mapping = meta.get("files")
        if not isinstance(mapping, dict) or set(names) != set(mapping) | {"manifest.json"}:
            raise ArchiveError("Arquivos divergentes do manifesto")
        total = 0
        rows = []
        for filename, checksum in mapping.items():
            if not NAME.fullmatch(filename):
                raise ArchiveError("Nome de arquivo não permitido")
            info = z.getinfo(filename)
            if info.file_size > MAX_ITEM:
                raise ArchiveError("Arquivo de backup excessivo")
            total += info.file_size
            if total > MAX_TOTAL:
                raise ArchiveError("Pacote excessivo")
            blob = z.read(filename)
            if len(blob) != checksum.get("bytes") or hashlib.sha256(blob).hexdigest() != checksum.get("sha256"):
                raise ArchiveError("Falha de integridade: " + filename)
            rows.extend(parse_records(filename, blob))
        if len(rows) != meta.get("total_records"):
            raise ArchiveError("Contagem de registros divergente")
        return meta, rows

def export_csv(path: str | Path, meta: dict, records: list[dict]):
    origin = meta.get("origin", {})
    with Path(path).open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["HSID informado", "Empresa informada", "Arquivo", "Registro", "Valor bruto", "Tipo bruto", "Entrada bruta", "Timestamp bruto", "Hex"])
        for row in records:
            writer.writerow([origin.get("hsid", ""), origin.get("company", ""),
                             row["arquivo"], row["sequencia"], row["valor_bruto"],
                             row["tipo_bruto"], row["entrada_bruta"],
                             row["timestamp_bruto"], row["hex"]])
