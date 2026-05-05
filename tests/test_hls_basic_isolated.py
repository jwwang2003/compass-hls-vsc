from pathlib import Path

from bome.hls_basic import HLSBasic


def make_hls_basic(tmp_path, mode="motpe"):
    hls = HLSBasic.__new__(HLSBasic)
    hls.root = str(tmp_path)
    hls.mode = mode
    hls.bench = "MachSuite"
    hls.case = "aes"
    hls.ver = ""
    hls.alg = "motpe_f"
    hls.process = 1
    hls.isolated = "run-isolated"
    hls.isolated_folder_path = str(tmp_path / "run-isolated")
    return hls


def test_isolated_mode_keeps_static_config_under_repo_root(tmp_path):
    hls = make_hls_basic(tmp_path)

    assert Path(hls.get_config_path()) == tmp_path / "config" / "MachSuite" / "aes_config.yaml"
    assert Path(hls.get_params_path()) == tmp_path / "config" / "MachSuite" / "aes_params.yaml"


def test_isolated_mode_keeps_benchmark_source_under_repo_root(tmp_path):
    hls = make_hls_basic(tmp_path)

    assert Path(hls.get_ori_prj_path()) == tmp_path / "benchmark" / "MachSuite" / "aes"


def test_isolated_mode_writes_generated_dataset_under_isolated_folder(tmp_path):
    hls = make_hls_basic(tmp_path)

    assert Path(hls.get_dataset_path()) == (
        tmp_path / "run-isolated" / "artifacts" / "MachSuite" / "motpe_f_ds" / "aes" / "p1"
    )
