import hashlib
import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hs_recovery.firmware import FormatError, scan_bin, scan_elf, inspect
from hs_recovery.readings import ArchiveError, load_archive, parse_records, export_csv

class FirmwareTests(unittest.TestCase):
    def test_littlefs_pair_and_no_map_promise(self):
        b = bytearray(b"\\xff" * (4096 * 4))
        b[4096 + 8:4096 + 16] = b"littlefs"
        b[8192 + 8:8192 + 16] = b"littlefs"
        x = scan_bin(bytes(b))
        self.assertEqual(x["littlefs_candidates"][0]["file_offset"], 4096)
        self.assertFalse(x["partition_map_verified"])

    def test_lone_string_is_not_proof(self):
        b = bytearray(b"\\xff" * (4096 * 4))
        b[4096 + 8:4096 + 16] = b"littlefs"
        self.assertEqual(scan_bin(bytes(b))["littlefs_candidates"], [])

    def test_elf_segment_not_partition(self):
        b = bytearray(200)
        b[:16] = b"\\x7fELF" + bytes([1, 1, 1]) + bytes(9)
        struct.pack_into("<HHIIIIIHHHHHH", b, 16, 2, 40, 1, 0x1000A000, 52, 0, 0, 52, 32, 1, 40, 0, 0)
        struct.pack_into("<IIIIIIII", b, 52, 1, 128, 0x1000A000, 0x1000A000, 16, 16, 5, 256)
        x = scan_elf(bytes(b))
        self.assertEqual(x["load_segments"][0]["address"], "0x1000A000")
        self.assertFalse(x["partition_map_verified"])

    def test_bad_elf_rejected(self):
        with self.assertRaises(FormatError):
            scan_elf(b"\\x7fELF")

    def test_inspection_does_not_change_file(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "firmware.bin"
            p.write_bytes(b"hello")
            before = p.read_bytes()
            inspect(p)
            self.assertEqual(p.read_bytes(), before)

class BackupTests(unittest.TestCase):
    def package(self, mismatch=False):
        record = struct.pack("<iBBI", -1, 0, 0, 1780000000)
        expected = hashlib.sha256(record).hexdigest()
        m = {"format": "HS-LEITURAS-1", "origin": {"hsid": "test", "company": "test"},
             "files": {"backup/0": {"bytes": len(record), "sha256": "0"*64 if mismatch else expected}},
             "total_records": 1}
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as z:
            z.writestr("manifest.json", json.dumps(m))
            z.writestr("backup/0", record)
        return data.getvalue()

    def test_archive_hash(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.hse"
            p.write_bytes(self.package())
            meta, rows = load_archive(p)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["valor_bruto"], -1)
            self.assertFalse(rows[0]["interpretação_confirmada"])
            outfile = Path(td) / "o.csv"
            export_csv(outfile, meta, rows)
            self.assertTrue(outfile.exists())

    def test_corrupt_hash_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.hse"
            p.write_bytes(self.package(mismatch=True))
            with self.assertRaises(ArchiveError):
                load_archive(p)

    def test_partial_record_rejected(self):
        with self.assertRaises(ArchiveError):
            parse_records("backup/1", b"\\x00"*9)

    def test_path_traversal_rejected(self):
        with self.assertRaises(ArchiveError):
            parse_records("backup/../../settings", b"\\x00"*10)

if __name__ == "__main__":
    unittest.main()
