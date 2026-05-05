import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINT = REPO_ROOT / "entrypoint.sh"


def run_entrypoint(tmp_path, *args, **env_overrides):
    env = os.environ.copy()
    env.update(env_overrides)
    env["HOME"] = str(tmp_path)
    return subprocess.run(
        ["bash", str(ENTRYPOINT), *args],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def test_entrypoint_does_not_require_xilinx_by_default(tmp_path):
    result = run_entrypoint(tmp_path, "true", XILINX_INSTALL=str(tmp_path / "missing-xilinx"))

    assert result.returncode == 0, result.stderr
    assert not (tmp_path / ".bashrc").read_text().strip()


def test_entrypoint_requires_settings_file_when_xilinx_is_required(tmp_path):
    result = run_entrypoint(
        tmp_path,
        "true",
        REQUIRE_XILINX="1",
        XILINX_INSTALL=str(tmp_path / "missing-xilinx"),
    )

    assert result.returncode != 0
    assert "settings64.sh" in result.stderr
    assert str(tmp_path / "missing-xilinx") in result.stderr
