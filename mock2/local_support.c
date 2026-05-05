#include "edge_detect.h"
#include "./common/support.h"
#include <string.h>

int INPUT_SIZE = sizeof(struct bench_args_t);

void run_benchmark(void *vargs)
{
  struct bench_args_t *args = (struct bench_args_t *)vargs;
  edge_detect(args->input, args->output);
}

void input_to_data(int fd, void *vdata)
{
  struct bench_args_t *data = (struct bench_args_t *)vdata;
  char *p, *s;

  memset(vdata, 0, sizeof(struct bench_args_t));

  p = readfile(fd);
  s = find_section_start(p, 1);
  parse_uint8_t_array(s, data->input, IMG_SIZE);
  free(p);
}

void data_to_input(int fd, void *vdata)
{
  struct bench_args_t *data = (struct bench_args_t *)vdata;

  write_section_header(fd);
  write_uint8_t_array(fd, data->input, IMG_SIZE);
}

void output_to_data(int fd, void *vdata)
{
  struct bench_args_t *data = (struct bench_args_t *)vdata;
  char *p, *s;

  memset(vdata, 0, sizeof(struct bench_args_t));

  p = readfile(fd);
  s = find_section_start(p, 1);
  parse_uint16_t_array(s, data->output, IMG_SIZE);
  free(p);
}

void data_to_output(int fd, void *vdata)
{
  struct bench_args_t *data = (struct bench_args_t *)vdata;

  write_section_header(fd);
  write_uint16_t_array(fd, data->output, IMG_SIZE);
}

int check_data(void *vdata, void *vref)
{
  struct bench_args_t *data = (struct bench_args_t *)vdata;
  struct bench_args_t *ref = (struct bench_args_t *)vref;
  int has_errors = 0;

  for (int i = 0; i < IMG_SIZE; ++i) {
    has_errors |= (data->output[i] != ref->output[i]);
  }

  return !has_errors;
}
