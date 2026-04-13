
declare module 'libreoffice-convert' {
  export function convert(
    buffer: Buffer,
    format: string,
    undefined: any,
    callback: (err: Error | null, pdfBuffer: Buffer) => void
  ): void;
}
