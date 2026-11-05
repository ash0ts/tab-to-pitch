"""Fetch only ZIP directory metadata and MIDI entry byte ranges, never audio."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import struct
import urllib.request
import zlib

RECORD = "https://zenodo.org/api/records/14963133"
ARCHIVES = {"P1_chords.zip": (981741162, "md5:be9ef8bbdceb1912d565254e607a6d94"), "P2_chords.zip": (1150819056, "md5:eb6f74dd19162237189281688ad7ad2e")}


def ranged(url, start, end):
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {start}-{end}/"):
            raise ValueError("Server did not honor exact range; audio download prevented")
        data = response.read(end - start + 2)
        if len(data) != end - start + 1:
            raise ValueError("Range length mismatch")
        return data


def directory(url, size):
    end = ranged(url, size - 22, size - 1)
    magic, disk, first_disk, on_disk, count, length, offset, comment = struct.unpack("<4s4H2LH", end)
    if magic != b"PK\x05\x06" or disk or first_disk or comment or count != on_disk:
        raise ValueError("Unsupported archive directory")
    data = ranged(url, offset, offset + length - 1)
    entries, pos = [], 0
    while pos < len(data):
        h = struct.unpack_from("<4s6H3L5H2L", data, pos)
        if h[0] != b"PK\x01\x02":
            raise ValueError("Invalid central directory")
        name_length, extra_length, comment_length = h[10:13]
        name = data[pos + 46:pos + 46 + name_length].decode()
        if name.lower().endswith((".mid", ".midi")) and not name.startswith("__MACOSX/"):
            if ".." in Path(name).parts or Path(name).is_absolute():
                raise ValueError("Unsafe entry path")
            entries.append({"name": name, "method": h[4], "crc32": h[7], "compressedSize": h[8], "size": h[9], "offset": h[-1]})
        pos += 46 + name_length + extra_length + comment_length
    return entries, hashlib.sha256(data).hexdigest()


def fetch_entry(url, entry, output):
    header = ranged(url, entry["offset"], entry["offset"] + 29)
    h = struct.unpack("<4s5H3L2H", header)
    if h[0] != b"PK\x03\x04":
        raise ValueError("Invalid local entry header")
    start = entry["offset"] + 30 + h[-2] + h[-1]
    compressed = ranged(url, start, start + entry["compressedSize"] - 1)
    if entry["method"] == 8:
        data = zlib.decompress(compressed, -15)
    elif entry["method"] == 0:
        data = compressed
    else:
        raise ValueError("Unsupported compression")
    if len(data) != entry["size"] or zlib.crc32(data) != entry["crc32"] or not data.startswith(b"MThd"):
        raise ValueError("MIDI entry integrity failed")
    path = output / entry["name"]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(data)
    return {**entry, "sha256": hashlib.sha256(data).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    with urllib.request.urlopen(RECORD, timeout=30) as response:
        metadata_bytes = response.read()
    metadata = json.loads(metadata_bytes)
    if metadata["metadata"]["license"]["id"] != "cc-by-4.0":
        raise ValueError("License changed")
    (args.output / "zenodo-record.json").write_bytes(metadata_bytes)
    receipt = {"record": RECORD, "license": "CC-BY-4.0", "audioDownloaded": False, "archiveChecksumsVerified": False, "integrity": "Pinned publisher archive metadata, exact HTTP ranges, ZIP CRC32 and local SHA256 per extracted MIDI; complete archive MD5 not independently verified", "archives": {}, "status": "in-progress"}
    def checkpoint():
        (args.output / "acquisition.json").write_text(json.dumps(receipt, indent=2) + "\n")
    checkpoint()
    try:
        for name, (size, checksum) in ARCHIVES.items():
            source = next(f for f in metadata["files"] if f["key"] == name)
            if source["size"] != size or source["checksum"] != checksum:
                raise ValueError("Pinned archive metadata changed")
            url = source["links"]["self"]
            entries, directory_hash = directory(url, size)
            receipt["archives"][name] = {"publisherChecksum": checksum, "centralDirectorySha256": directory_hash, "entries": []}
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(fetch_entry, url, entry, args.output) for entry in entries]
                for future in futures:
                    receipt["archives"][name]["entries"].append(future.result())
                    checkpoint()
            print(json.dumps({"archive": name, "midiFiles": len(entries)}), flush=True)
        receipt["status"] = "complete"
    except Exception as error:
        receipt["status"] = "failed"
        receipt["errorType"] = type(error).__name__
        raise
    finally:
        checkpoint()


if __name__ == "__main__":
    main()
