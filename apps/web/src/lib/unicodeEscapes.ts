// The existing duplicate-key JSON parser uses only punycode.ucs2.encode to decode escapes.
// Browsers provide the same code-point operation without a Node built-in.
export const ucs2={encode:(points:number[])=>String.fromCodePoint(...points)};
