declare module 'tree-sitter-c' {
  const C: any;
  export default C;
}

interface EmscriptenModule {
  [key: string]: unknown;
}
