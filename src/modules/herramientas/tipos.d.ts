// Módulos sin tipos propios que usan las herramientas PDF
declare module '@jspawn/qpdf-wasm/qpdf.js' {
  const crear: (opciones?: object) => Promise<unknown>;
  export default crear;
}
