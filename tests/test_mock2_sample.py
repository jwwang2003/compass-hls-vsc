import shutil
import subprocess
from pathlib import Path

import pytest


def test_mock2_sample_builds_and_runs_from_clean_copy(tmp_path):
    repo_root = Path(__file__).resolve().parents[1]
    sample_root = repo_root / "mock2"

    assert sample_root.exists()
    assert not (sample_root / "bfs.c").exists()
    assert (sample_root / "edge_detect.c").exists()
    assert (sample_root / "edge_detect.h").exists()
    assert (sample_root / "hls.tcl").exists()
    assert "vitis_hls" in (sample_root / "Makefile").read_text(encoding="utf-8")

    if not shutil.which("make") or not shutil.which("gcc"):
        pytest.skip("mock2 build test requires make and gcc")

    work_root = tmp_path / "mock2"
    shutil.copytree(sample_root, work_root)

    subprocess.run(["make", "clean"], cwd=work_root, check=True, text=True, capture_output=True)
    subprocess.run(["make"], cwd=work_root, check=True, text=True, capture_output=True)
    result = subprocess.run(["make", "run"], cwd=work_root, check=True, text=True, capture_output=True)

    assert "Success." in result.stdout
    assert (work_root / "output.data").read_text(encoding="utf-8") == (
        work_root / "check.data"
    ).read_text(encoding="utf-8")
