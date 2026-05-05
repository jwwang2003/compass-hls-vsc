CC=gcc
HLS?=vitis_hls
KERN=edge_detect
ALG=sobel

CFLAGS?=-std=c99 -O3 -Wall -Wextra -Wno-unused-label

SRCS=$(KERN).c local_support.c common/support.c
FILES=$(SRCS) $(KERN).h common/support.h

$(KERN): $(FILES) common/harness.c
	$(CC) $(CFLAGS) -Icommon -o $(KERN) $(SRCS) common/harness.c

run: $(KERN) input.data check.data
	./$(KERN) input.data check.data

hls: $(KERN).c $(KERN).h local_support.c input.data check.data hls.tcl
	$(HLS) -f hls.tcl

hls-csim: $(KERN).c $(KERN).h local_support.c input.data check.data hls.tcl
	MOCK2_RUN_CSIM=1 $(HLS) -f hls.tcl

clean:
	rm -rf $(KERN) output.data edge_detect_vitis_prj vitis_hls.log .Xil
