"""Inspeção passiva de BIN/ELF RP2040. Detecção não autoriza escrita."""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
import struct

XIP_MIN = 0x10000000
XIP_MAX = 0x11000000
BLOCK = 4096
VERSION = re.compile(rb"(?:[Vv]ersion|[Ff]irmware|[Vv])[\\s:=_-]{0,8}([0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}(?:[-.][0-9]{1,3})?)")

class FormatError(ValueError):
    pass

def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def scan_bin(data: bytes) -> dict:
    starts = []
    for offset in range(0, len(data) - 2 * BLOCK + 1, BLOCK):
        if data[offset + 8:offset + 16] == b"littlefs" and data[offset + BLOCK + 8:offset + BLOCK + 16] == b"littlefs":
            starts.append({"file_offset": offset, "mount_verified": False})
    versions = []
    for m in VERSION.finditer(data):
        text = m.group(1).decode("ascii")
        if text not in versions:
            versions.append(text)
        if len(versions) >= 12:
            break
    return {
        "type": "BIN", "bytes": len(data), "sha256": hash_bytes(data),
        "littlefs_candidates": starts, "version_candidates": versions,
        "flash_chip_size_known": False, "partition_map_verified": False,
        "warning": "Offsets são relativos ao BIN. Não autorizam gravação na flash.",
    }

def scan_elf(data: bytes) -> dict:
    if len(data) < 52 or data[:4] != b"\\x7fELF" or data[4:6] != b"\\x01\\x01":
        raise FormatError("ELF32 little-endian inválido ou incompatível")
    values = struct.unpack_from("<HHIIIIIHHHHHH", data, 16)
    machine, entry, phoff, phentsize, phnum = values[1], values[3], values[4], values[9], values[10]
    if machine != 40:
        raise FormatError("Não é ELF ARM")
    if phnum > 1024 or (phnum and phentsize < 32) or phoff + phentsize * phnum > len(data):
        raise FormatError("Cabeçalhos de segmentos inválidos")
    segments = []
    for i in range(phnum):
        p_type, off, vaddr, paddr, size, memsize, flags, align = struct.unpack_from("<IIIIIIII", data, phoff + i * phentsize)
        if p_type != 1 or size == 0:
            continue
        if off > len(data) or size > len(data) - off:
            raise FormatError("Segmento fora do arquivo")
        segments.append({"address": f"0x{paddr:08X}", "file_offset": off, "bytes": size,
                         "is_xip": XIP_MIN <= paddr < XIP_MAX})
    return {
        "type": "ELF32 ARM", "bytes": len(data), "sha256": hash_bytes(data),
        "entry": f"0x{entry:08X}", "load_segments": segments,
        "partition_map_verified": False,
        "warning": "Segmentos ELF não comprovam todas as partições da flash.",
    }

def inspect(path: str | Path) -> dict:
    p = Path(path)
    data = p.read_bytes()
    result = scan_elf(data) if data.startswith(b"\\x7fELF") else scan_bin(data)
    result["file"] = p.name
    return result
