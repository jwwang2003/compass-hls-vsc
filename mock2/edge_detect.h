#ifndef EDGE_DETECT_H
#define EDGE_DETECT_H

#include <stdint.h>

#define IMG_ROWS 8
#define IMG_COLS 8
#define IMG_SIZE (IMG_ROWS * IMG_COLS)
#define EDGE_MAX 2040

typedef uint8_t pixel_t;
typedef uint16_t edge_pixel_t;
typedef int16_t grad_t;

struct bench_args_t {
  pixel_t input[IMG_SIZE];
  edge_pixel_t output[IMG_SIZE];
};

void edge_detect(pixel_t input[IMG_SIZE], edge_pixel_t output[IMG_SIZE]);

#endif
