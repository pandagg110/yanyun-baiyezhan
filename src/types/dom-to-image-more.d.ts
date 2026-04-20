declare module 'dom-to-image-more' {
    interface Options {
        filter?: (node: Node) => boolean;
        backgroundColor?: string;
        width?: number;
        height?: number;
        style?: Partial<CSSStyleDeclaration>;
        quality?: number;
        imagePlaceholder?: string;
        cacheBust?: boolean;
        scale?: number;
        useCredentials?: boolean;
    }

    function toSvg(node: HTMLElement, options?: Options): Promise<string>;
    function toPng(node: HTMLElement, options?: Options): Promise<string>;
    function toJpeg(node: HTMLElement, options?: Options): Promise<string>;
    function toBlob(node: HTMLElement, options?: Options): Promise<Blob>;
    function toPixelData(node: HTMLElement, options?: Options): Promise<Uint8ClampedArray>;

    export default { toSvg, toPng, toJpeg, toBlob, toPixelData };
}
