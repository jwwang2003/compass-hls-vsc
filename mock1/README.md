# mock1

`mock1` is a small standalone Vitis HLS sample based on the existing `mock0` harness layout. The top function is `edge_detect`, an 8x8 Sobel edge detector with labeled row and column loops for TDM directives.

Useful commands:

```sh
make
make run
make hls
make hls-csim
```

`make hls` runs Vitis HLS synthesis. `make hls-csim` also runs Vitis C simulation first, which may require the host libc layout expected by the Vitis 2022.1 APCC wrapper.

For Compass DSE, the project source stays named `edge_detect.c`. The extension
packages that source filename separately from the DSE case name, so case names
such as `bfs` or `edge_detect` do not require renaming the C file.
