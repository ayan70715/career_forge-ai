declare module "mammoth/mammoth.browser" {
  export type MammothMessage = {
    type: string;
    message: string;
  };

  export type MammothRawTextResult = {
    value: string;
    messages: MammothMessage[];
  };

  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<MammothRawTextResult>;
}
