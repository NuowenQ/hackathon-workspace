declare module 'dcmjs' {
  const dcmjs: {
    data: {
      DicomMessage: {
        readFile(buffer: ArrayBuffer, options?: any): { dict: any; meta: any }
      }
      DicomMetaDictionary: {
        naturalizeDataset(dataset: any): any
      }
      BitArray: {
        unpack(packedData: ArrayBuffer): Uint8Array
        pack(pixelData: Uint8Array): Uint8Array
      }
    }
  }
  export default dcmjs
}
