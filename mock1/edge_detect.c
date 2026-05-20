#include "edge_detect.h"

static grad_t abs_grad(grad_t value)
{
  return value < 0 ? (grad_t)(-value) : value;
}

void edge_detect(pixel_t input[IMG_SIZE], edge_pixel_t output[IMG_SIZE])
{
  row_loop: for (int r = 0; r < IMG_ROWS; ++r) {
    col_loop: for (int c = 0; c < IMG_COLS; ++c) {
      const int idx = r * IMG_COLS + c;

      if (r == 0 || c == 0 || r == (IMG_ROWS - 1) || c == (IMG_COLS - 1)) {
        output[idx] = 0;
      } else {
        const int up = (r - 1) * IMG_COLS;
        const int mid = r * IMG_COLS;
        const int down = (r + 1) * IMG_COLS;

        const grad_t p00 = (grad_t)input[up + c - 1];
        const grad_t p01 = (grad_t)input[up + c];
        const grad_t p02 = (grad_t)input[up + c + 1];
        const grad_t p10 = (grad_t)input[mid + c - 1];
        const grad_t p12 = (grad_t)input[mid + c + 1];
        const grad_t p20 = (grad_t)input[down + c - 1];
        const grad_t p21 = (grad_t)input[down + c];
        const grad_t p22 = (grad_t)input[down + c + 1];

        const grad_t gx = (grad_t)(-p00 + p02 - (2 * p10) + (2 * p12) - p20 + p22);
        const grad_t gy = (grad_t)(-p00 - (2 * p01) - p02 + p20 + (2 * p21) + p22);
        const grad_t mag = (grad_t)(abs_grad(gx) + abs_grad(gy));

        output[idx] = (mag > EDGE_MAX) ? (edge_pixel_t)EDGE_MAX : (edge_pixel_t)mag;
      }
    }
  }
}
