declare module "jsbarcode" {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    margin?: number;
    displayValue?: boolean;
    text?: string;
  }

  export default function JsBarcode(
    element: Element | string,
    value: string,
    options?: JsBarcodeOptions,
  ): unknown;
}
