#!/usr/bin/env python3
"""Download the OWASP NVD 2.0 feed into a directory for local HTTP serving."""

import argparse
import concurrent.futures
import datetime
import pathlib
import urllib.request

BASE = "https://dependency-check.github.io/DependencyCheck_Builder/nvd_cache"


def download(item):
    destination, year = item
    prefix = f"nvdcve-{year}"
    metadata = destination / f"{prefix}.meta"
    archive = destination / f"{prefix}.json.gz"
    request = urllib.request.Request(f"{BASE}/{prefix}.meta", headers={"User-Agent": "farmweather-local-nvd-mirror/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        latest_metadata = response.read()
    if archive.exists() and archive.stat().st_size and metadata.exists() and metadata.read_bytes() == latest_metadata:
        return f"current {prefix}"
    request = urllib.request.Request(f"{BASE}/{archive.name}", headers={"User-Agent": "farmweather-local-nvd-mirror/1.0"})
    temporary = archive.with_name(archive.name + ".partial")
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    expected_size = int(next(line.split(":", 1)[1] for line in latest_metadata.decode().splitlines() if line.startswith("gzSize:")))
    if temporary.stat().st_size != expected_size:
        raise RuntimeError(f"Incomplete download: {archive.name}")
    temporary.replace(archive)
    metadata.write_bytes(latest_metadata)
    return f"downloaded {archive.name} ({archive.stat().st_size} bytes)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=pathlib.Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    years = list(range(2002, datetime.datetime.now(datetime.timezone.utc).year + 1)) + ["modified"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        for result in executor.map(download, [(args.directory, year) for year in years]):
            print(result, flush=True)


if __name__ == "__main__":
    main()
