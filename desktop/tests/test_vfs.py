"""Behavioral checks for the GNEX application-local save filesystem."""

import pytest

from kpex.vfs import VirtualFileSystem


def test_save_round_trip_and_seek(tmp_path):
    path = tmp_path / "save.json"
    fs = VirtualFileSystem(save_path=path)
    handle = fs.open("/icaria2.dat", 2)
    assert handle == 0
    assert fs.write(handle, bytes.fromhex("4433221188776655")) == 8
    assert fs.seek(handle, -4, 3) == 1
    assert fs.read(handle, 40) == bytes.fromhex("88776655")
    assert fs.read(handle, 1) == b""
    assert fs.close(handle) == 1

    reopened = VirtualFileSystem(save_path=path)
    handle = reopened.open("ICARIA2.DAT", 3)
    assert reopened.read(handle, 8) == bytes.fromhex("4433221188776655")
    assert reopened.write(handle, b"X") == -1
    assert reopened.close(handle) == 1
    assert reopened.open("icaria2.dat", 2) == -1  # CREATE never truncates.


def test_open_file_delete_lock_and_handle_limit():
    fs = VirtualFileSystem()
    assert fs.open("missing", 3) == -1
    handle = fs.open("save", 2)
    assert fs.delete("save") == -1
    assert fs.close(handle) == 1
    handles = [fs.open("save", 1) for _ in range(15)]
    assert handles == list(range(15))
    assert fs.open("save", 1) == -1
    for handle in handles:
        assert fs.close(handle) == 1
    assert fs.delete("save") == 1


@pytest.mark.parametrize(
    "name", ["../outside", "a/../../outside", "C:/Windows/test", "a//b", ""]
)
def test_guest_paths_never_become_host_paths(name, tmp_path):
    fs = VirtualFileSystem(save_path=tmp_path / "save.json")
    with pytest.raises(ValueError):
        fs.open(name, 2)
    assert list(tmp_path.iterdir()) == []


def test_sparse_write_is_zero_filled_and_bad_seek_keeps_cursor():
    fs = VirtualFileSystem()
    handle = fs.open("save", 2)
    assert fs.seek(handle, 3, 1) == 1
    assert fs.write(handle, b"x") == 1
    assert fs.seek(handle, -100, 2) == -1
    assert fs.handles[handle].position == 4
    assert fs.seek(handle, 0, 1) == 1
    assert fs.read(handle, 4) == b"\0\0\0x"
