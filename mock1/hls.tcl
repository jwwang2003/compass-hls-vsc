open_project -reset edge_detect_vitis_prj

set_top edge_detect

add_files edge_detect.c
add_files -tb local_support.c
add_files -tb common/support.c
add_files -tb common/harness.c
add_files -tb input.data
add_files -tb check.data

open_solution -reset solution
set_part {xc7vx485tffg1761-2}
create_clock -period 10 -name default

if {[info exists ::env(MOCK2_RUN_CSIM)] && $::env(MOCK2_RUN_CSIM) eq "1"} {
  csim_design
}

csynth_design

exit
