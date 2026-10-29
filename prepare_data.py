"""Verify the bundled original; recover a missing copy from the public UCI ZIP."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent
SOURCE_SHA = "763ffcdd39b7f7f360243c2af8f89ed733e8b5f9e511efeb0c886b83e1b76866"
NAME = "garments_worker_productivity.csv"
URL = "https://archive.ics.uci.edu/static/public/597/productivity%2Bprediction%2Bof%2Bgarment%2Bemployees.zip"


def ensure_source():
    path = ROOT / "data" / NAME
    if not path.is_file():
        with urlopen(URL, timeout=30) as response:
            with ZipFile(BytesIO(response.read())) as archive:
                raw = archive.read(NAME)
        if sha256(raw).hexdigest() != SOURCE_SHA:
            raise ValueError("Public download differs from the audited source; no file was saved.")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    if sha256(path.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError("Original source checksum mismatch. Restore the unchanged UCI CSV.")
    return path


if __name__ == "__main__":
    print("Original source verified:", ensure_source())
