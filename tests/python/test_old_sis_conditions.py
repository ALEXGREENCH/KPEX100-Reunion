"""Forensic all-branch SIS extraction; synthetic bytes, no installer execution."""

import binascii
import hashlib
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib


ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "old_sis_conditions", ROOT.parents[1] / "tools" / "extract-old-sis.py"
)
sis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sis)


def seal(data):
    """Refresh both classic SIS checksums, excluding an optional signature."""
    uid = binascii.crc_hqx(data[:12:2], 0)
    uid |= binascii.crc_hqx(data[1:12:2], 0) << 16
    struct.pack_into("<I", data, 12, uid)
    end = struct.unpack_from("<I", data, 68)[0] or len(data)
    crc = binascii.crc_hqx(data[18:end], binascii.crc_hqx(data[:16], 0))
    struct.pack_into("<H", data, 16, crc)
    return data


def control(kind, label, expression=b"\xff\x01\x80"):
    # Expressions are deliberately opaque and not word-aligned. These tests
    # verify byte bounds and provenance, not their installer meaning.
    return dict(kind=kind, label=label, expression=expression)


def file_record(label, *values):
    return dict(kind=int(len(values) > 1), label=label, values=values)


def options_record(label, labels, bitmap=b"\x01" + b"\0" * 15):
    return dict(kind=2, label=label, labels=labels, bitmap=bitmap)


def fixture(logical_records, languages=(1,), compressed=True):
    """Encode logical installation order as reverse-stored classic SIS records.

    String and payload pools precede the record table. Consequently truncating
    a final control cannot accidentally fail on an unrelated later name/payload.
    Every file intentionally has the same destination basename.
    """
    count = len(languages)
    names_ptr = 100 + count * 2
    data = bytearray(names_ptr + count * 8)
    struct.pack_into("<4I", data, 0, 0x10272E3F, 0x10003A12, 0x10000419, 0)
    struct.pack_into("<3H", data, 18, count, len(logical_records), 0)
    struct.pack_into("<H", data, 36, 1 | (0 if compressed else 8))
    for index, language in enumerate(languages):
        struct.pack_into("<H", data, 100 + index * 2, language)

    def string(value):
        raw = value.encode("utf-16-le")
        pointer = len(data)
        data.extend(raw)
        return len(raw), pointer

    def string_table(values):
        pairs = [string(value) for value in values]
        return struct.pack(
            "<" + "I" * len(pairs) * 2,
            *[size for size, _ in pairs],
            *[pointer for _, pointer in pairs],
        )

    # Header component names use the same grouped lengths/pointers convention.
    data[names_ptr : names_ptr + count * 8] = string_table(["Demo"] * count)
    encoded = []
    for record in reversed(logical_records):
        kind = record["kind"]
        if kind in (0, 1):
            variants = count if kind == 1 else 1
            assert len(record["values"]) == variants
            source_size, source_ptr = string("c:\\source\\" + record["label"] + ".app")
            dest_size, dest_ptr = string("!:\\System\\Apps\\Demo\\shared.app")
            packed_values = []
            for value in record["values"]:
                packed = zlib.compress(value) if compressed else value
                packed_values.append((len(packed), len(data), len(value)))
                data.extend(packed)
            raw = struct.pack(
                "<7I", kind, 0, 0, source_size, source_ptr, dest_size, dest_ptr
            )
            for column in range(3):
                raw += struct.pack(
                    "<" + "I" * variants, *[v[column] for v in packed_values]
                )
            raw += struct.pack("<2I", 0, 0)  # No MIME string.
        elif kind == 2:
            assert len(record["bitmap"]) == 16
            assert all(len(labels) == count for labels in record["labels"])
            raw = struct.pack("<2I", 2, len(record["labels"]))
            raw += b"".join(string_table(labels) for labels in record["labels"])
            raw += record["bitmap"]
        elif kind in (3, 4):
            raw = (
                struct.pack("<2I", kind, len(record["expression"]))
                + record["expression"]
            )
        else:
            raw = struct.pack("<I", kind)
        encoded.append((record, raw))
    records_ptr = len(data)
    struct.pack_into("<5I", data, 48, 100, records_ptr, 0, 0, names_ptr)
    metadata = {}
    for index, (record, raw) in enumerate(encoded):
        assert record["label"] not in metadata
        metadata[record["label"]] = dict(
            index=index, offset=len(data), size=len(raw), spec=record
        )
        data.extend(raw)
    return seal(data), metadata


def branch_fixture():
    return fixture(
        [
            control(3, "if"),
            file_record("yes", b"true branch"),
            control(5, "else"),
            file_record("no", b"false branch"),
            control(6, "end"),
        ]
    )


class ConditionTests(unittest.TestCase):
    def assert_rejected_before_decode(self, data, message=None):
        with patch.object(
            sis, "decode_payload", side_effect=AssertionError("early decode")
        ) as decode:
            if message:
                with self.assertRaisesRegex(ValueError, message):
                    sis.parse_sis(data)
            else:
                with self.assertRaises(ValueError):
                    sis.parse_sis(data)
            decode.assert_not_called()

    def test_physical_first_endif_preserves_both_branches_and_safe_names(self):
        data, where = branch_fixture()
        manifest, outputs = sis.parse_sis(data)
        self.assertEqual(
            [r["record_type"] for r in manifest["records"]], [6, 0, 5, 0, 3]
        )
        self.assertEqual(manifest["extraction_policy"], "all-branches")
        self.assertIs(manifest["condition_evaluation"], False)
        self.assertEqual(manifest["expression_validation"], "opaque-bounds-only")
        self.assertEqual(
            outputs,
            [
                (f"{where['no']['index']:02}-shared.app", b"false branch"),
                (f"{where['yes']['index']:02}-shared.app", b"true branch"),
            ],
        )
        records = manifest["records"]
        for label, branch in [("yes", "if"), ("no", "else")]:
            self.assertEqual(
                records[where[label]["index"]]["conditions"],
                [
                    {
                        "if_record_index": where["if"]["index"],
                        "branch_record_index": where[branch]["index"],
                    }
                ],
            )
        for label in ["if", "else", "end"]:
            record = records[where[label]["index"]]
            self.assertEqual(record["record_offset"], where[label]["offset"])
            self.assertEqual(record["record_bytes"], where[label]["size"])
            self.assertEqual(record["variants"], [])
        # Both alternatives have the same install destination, but forensic
        # extraction must preserve two distinct flat filenames without overwrite.
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            parent = Path(temporary)
            self.assertEqual(parent.parent.resolve(), ROOT.resolve())
            output = parent / "all-branches"
            sis.write_outputs(output, manifest, outputs)
            for name, value in outputs:
                self.assertEqual((output / name).read_bytes(), value)

    def test_nested_elseif_else_and_every_language_keep_outer_inner_context(self):
        logical = [
            file_record("common", b"unconditional"),
            control(3, "outer-if", b"\x11"),
            control(3, "inner-if", b"\x22\x33\x44"),
            file_record("inner-a", b"A English", b"A alternative"),
            control(4, "inner-elseif", b"\xff\x00\xfe\x01\x02"),
            file_record("inner-b", b"B English", b"B alternative"),
            control(5, "inner-else"),
            file_record("inner-c", b"C"),
            control(6, "inner-end"),
            control(4, "outer-elseif", b"\xaa\xbb\xcc"),
            file_record("outer-b", b"D"),
            control(5, "outer-else"),
            file_record("outer-c", b"E"),
            control(6, "outer-end"),
        ]
        data, where = fixture(logical, languages=(1, 2))
        manifest, outputs = sis.parse_sis(data)
        self.assertCountEqual(
            [d for _, d in outputs],
            [
                b"unconditional",
                b"A English",
                b"A alternative",
                b"B English",
                b"B alternative",
                b"C",
                b"D",
                b"E",
            ],
        )
        self.assertEqual(len({n.casefold() for n, _ in outputs}), 8)
        records = manifest["records"]
        self.assertEqual(records[where["common"]["index"]]["conditions"], [])
        for label, inner_branch in [
            ("inner-a", "inner-if"),
            ("inner-b", "inner-elseif"),
            ("inner-c", "inner-else"),
        ]:
            self.assertEqual(
                records[where[label]["index"]]["conditions"],
                [
                    {
                        "if_record_index": where["outer-if"]["index"],
                        "branch_record_index": where["outer-if"]["index"],
                    },
                    {
                        "if_record_index": where["inner-if"]["index"],
                        "branch_record_index": where[inner_branch]["index"],
                    },
                ],
            )
        for label, branch in [("outer-b", "outer-elseif"), ("outer-c", "outer-else")]:
            self.assertEqual(
                records[where[label]["index"]]["conditions"],
                [
                    {
                        "if_record_index": where["outer-if"]["index"],
                        "branch_record_index": where[branch]["index"],
                    }
                ],
            )
        for label in ["inner-a", "inner-b"]:
            variants = records[where[label]["index"]]["variants"]
            self.assertEqual([v["language_id"] for v in variants], [1, 2])
            self.assertEqual([v["language_index"] for v in variants], [0, 1])
        for label in ["outer-if", "inner-if", "inner-elseif", "outer-elseif"]:
            expected = where[label]
            record = records[expected["index"]]
            expression = expected["spec"]["expression"]
            self.assertEqual(record["expression_offset"], expected["offset"] + 8)
            self.assertEqual(record["expression_bytes"], len(expression))
            self.assertEqual(
                record["expression_sha256"], hashlib.sha256(expression).hexdigest()
            )
            self.assertEqual(record["record_bytes"], 8 + len(expression))
            self.assertEqual(
                data[
                    record["expression_offset"] : record["expression_offset"]
                    + len(expression)
                ],
                expression,
            )

    def test_options_labels_bitmap_and_unselected_branches_are_preserved(self):
        labels = [["Bonus", "추가"], ["Sound", "소리"]]
        logical = [
            options_record("choices", labels),
            control(3, "if"),
            file_record("yes", b"selected or not"),
            control(5, "else"),
            file_record("no", b"other branch"),
            control(6, "end"),
        ]
        data, where = fixture(logical, languages=(1, 2))
        manifest, outputs = sis.parse_sis(data)
        record = manifest["records"][where["choices"]["index"]]
        self.assertEqual(record["option_count"], 2)
        self.assertEqual(record["option_labels"], labels)
        self.assertEqual(
            record["selected_options_bitmap_hex"], (b"\x01" + b"\0" * 15).hex()
        )
        self.assertEqual(record["variants"], [])
        self.assertEqual(record["record_bytes"], 24 + 8 * 2 * 2)
        # A selection bitmap is retained metadata, never a host installation choice.
        bitmap = where["choices"]["offset"] + where["choices"]["size"] - 16
        data[bitmap : bitmap + 16] = b"\0" * 16
        changed, alternative_outputs = sis.parse_sis(seal(data))
        self.assertEqual(outputs, alternative_outputs)
        self.assertEqual(
            changed["records"][where["choices"]["index"]][
                "selected_options_bitmap_hex"
            ],
            "00" * 16,
        )

    def test_file_only_manifest_shape_remains_unchanged(self):
        data, _ = fixture([file_record("plain", b"raw original")], compressed=False)
        manifest, outputs = sis.parse_sis(data)
        self.assertEqual(outputs, [("00-shared.app", b"raw original")])
        self.assertEqual(
            set(manifest),
            {
                "format",
                "input_bytes",
                "input_sha256",
                "uid1",
                "uid_crc",
                "uid_crc_verified",
                "body_crc",
                "body_crc_verified",
                "crc_body_end",
                "signature_bytes",
                "signature_verified",
                "version_major",
                "version_minor",
                "options",
                "languages",
                "component_names",
                "record_count",
                "extracted_files",
                "records",
            },
        )
        self.assertEqual(
            set(manifest["records"][0]),
            {
                "index",
                "record_offset",
                "record_type",
                "file_type",
                "details",
                "source_name",
                "destination_name",
                "mime_type",
                "variants",
            },
        )

    def test_malformed_reverse_control_flow_rejected_before_any_decode(self):
        cases = {
            "unmatched else": [control(5, "else"), file_record("body", b"payload")],
            "unmatched elseif": [control(4, "elseif"), file_record("body", b"payload")],
            "unmatched endif": [file_record("body", b"payload"), control(6, "end")],
            "unclosed if": [control(3, "if"), file_record("body", b"payload")],
            "duplicate else": [
                control(3, "if"),
                control(5, "else1"),
                file_record("body", b"payload"),
                control(5, "else2"),
                control(6, "end"),
            ],
            "elseif after else": [
                control(3, "if"),
                control(5, "else"),
                control(4, "elseif"),
                file_record("body", b"payload"),
                control(6, "end"),
            ],
            "unclosed inner": [
                control(3, "outer"),
                control(3, "inner"),
                file_record("body", b"payload"),
                control(6, "one-end"),
            ],
        }
        for label, records in cases.items():
            with self.subTest(label=label):
                self.assert_rejected_before_decode(fixture(records)[0])

    def test_unknown_late_physical_record_rejected_before_earlier_payload_decode(self):
        data, _ = fixture(
            [control(7, "unknown"), file_record("first-physical", b"payload")]
        )
        self.assert_rejected_before_decode(data, "Unsupported file record type")

    def test_control_truncations_hit_body_bounds(self):
        for kind, remaining in [(5, 3), (6, 3), (3, 4), (4, 7), (2, 4)]:
            with self.subTest(kind=kind, remaining=remaining):
                record = (
                    options_record("record", [["Option"]])
                    if kind == 2
                    else control(kind, "record")
                )
                data, where = fixture([record])
                data = data[: where["record"]["offset"] + remaining]
                self.assert_rejected_before_decode(seal(data), "bounds")

    def test_expression_overrun_after_valid_payload_rejected_before_decode(self):
        data, where = branch_fixture()
        struct.pack_into("<I", data, where["if"]["offset"] + 4, 0xFFFFFFFF)
        self.assert_rejected_before_decode(seal(data), "bounds")

    def test_options_table_bitmap_and_label_bounds(self):
        original, where = fixture([options_record("choices", [["A"], ["B"]])])
        offset = where["choices"]["offset"]
        cases = []
        data = bytearray(original)
        struct.pack_into("<I", data, offset + 4, 128)
        cases.append(("missing table", data))
        cases.append(("short bitmap", original[:-1]))
        data = bytearray(original)
        struct.pack_into("<I", data, offset + 12, len(data) + 1)
        cases.append(("label pointer", data))
        for label, data in cases:
            with self.subTest(label=label):
                self.assert_rejected_before_decode(seal(data), "bounds")

    def test_option_count_limited_to_bitmap_capacity(self):
        data, _ = fixture([options_record("too-many", [["x"]] * 129)])
        self.assert_rejected_before_decode(data)

    def test_all_128_options_and_both_language_labels_fit_the_bitmap(self):
        labels = [[f"Option {i}", f"Alternative {i}"] for i in range(128)]
        bitmap = b"\0" * 15 + b"\x80"
        data, _ = fixture([options_record("choices", labels, bitmap)], languages=(1, 2))
        manifest, outputs = sis.parse_sis(data)
        self.assertEqual(outputs, [])
        self.assertEqual(manifest["records"][0]["option_labels"], labels)
        self.assertEqual(
            manifest["records"][0]["selected_options_bitmap_hex"], bitmap.hex()
        )

    def test_bad_late_options_do_not_decode_an_earlier_physical_file(self):
        original, where = fixture(
            [
                options_record("choices", [["Option"]]),
                file_record("first-physical", b"payload"),
            ]
        )
        offset = where["choices"]["offset"]
        data = bytearray(original)
        struct.pack_into("<I", data, offset + 12, len(data) + 1)
        for label, malformed in [
            ("label outside body", data),
            ("truncated final bitmap", original[:-1]),
        ]:
            with self.subTest(label=label):
                self.assert_rejected_before_decode(seal(malformed), "bounds")

    def test_option_labels_obey_existing_total_string_budget(self):
        data, _ = fixture([options_record("choices", [["a" * 16]] * 3)])
        with patch.object(sis, "MAX_TOTAL", 60):
            self.assert_rejected_before_decode(data, "string processing budget")

    def test_payload_budget_sums_alternatives_before_decompression(self):
        data, _ = fixture(
            [
                control(3, "if"),
                file_record("yes", b"x" * 700),
                control(5, "else"),
                file_record("no", b"y" * 700),
                control(6, "end"),
            ]
        )
        with patch.object(sis, "MAX_TOTAL", 1000):
            self.assert_rejected_before_decode(data, "total processing budget")

    def test_nesting_depth_boundary(self):
        for depth in (64, 65):
            records = [control(3, f"if-{i}", b"\xfe") for i in range(depth)]
            records += [file_record("body", b"deep branch")]
            records += [control(6, f"end-{i}") for i in range(depth)]
            data, where = fixture(records)
            with self.subTest(depth=depth):
                if depth == 65:
                    self.assert_rejected_before_decode(data)
                else:
                    manifest, outputs = sis.parse_sis(data)
                    self.assertEqual([d for _, d in outputs], [b"deep branch"])
                    conditions = manifest["records"][where["body"]["index"]][
                        "conditions"
                    ]
                    self.assertEqual(
                        conditions,
                        [
                            {
                                "if_record_index": where[f"if-{i}"]["index"],
                                "branch_record_index": where[f"if-{i}"]["index"],
                            }
                            for i in range(depth)
                        ],
                    )

    def test_controls_count_toward_record_limit(self):
        data, _ = branch_fixture()
        with patch.object(sis, "MAX_RECORDS", 4):
            self.assert_rejected_before_decode(data, "record count")

    def test_crc_failure_precedes_conditional_processing_and_decode(self):
        data, _ = branch_fixture()
        data[-1] ^= 1
        self.assert_rejected_before_decode(data, "body CRC")

    def test_signature_bytes_cannot_extend_expression_bounds(self):
        data, where = branch_fixture()
        boundary = len(data)
        struct.pack_into("<I", data, 68, boundary)
        data.extend(b"opaque signature bytes")
        signed = seal(bytearray(data))
        report, outputs = sis.parse_sis(signed)
        self.assertEqual(len(outputs), 2)
        self.assertEqual(report["signature_bytes"], len(b"opaque signature bytes"))
        self.assertIs(report["signature_verified"], False)
        # The final physical IF would fit in the total input after adding one
        # byte, but that byte belongs to the signature, not the checked SIS body.
        size_ptr = where["if"]["offset"] + 4
        size = struct.unpack_from("<I", data, size_ptr)[0]
        struct.pack_into("<I", data, size_ptr, size + 1)
        self.assert_rejected_before_decode(seal(data), "bounds")

    def test_invalid_signature_pointer_rejected_before_decode(self):
        original, _ = branch_fixture()
        for pointer in (99, len(original), len(original) + 1):
            with self.subTest(pointer=pointer):
                data = bytearray(original)
                struct.pack_into("<I", data, 68, pointer)
                self.assert_rejected_before_decode(seal(data), "Signature pointer")

    def test_invalid_flow_never_creates_output_directory(self):
        data, _ = fixture([control(5, "unmatched"), file_record("first", b"payload")])
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            parent = Path(temporary)
            self.assertEqual(parent.parent.resolve(), ROOT.resolve())
            source, output = parent / "bad-flow.sis", parent / "output"
            source.write_bytes(data)
            with patch.object(
                sis, "decode_payload", side_effect=AssertionError("early decode")
            ):
                with self.assertRaises(ValueError):
                    sis.main([str(source), str(output)])
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
