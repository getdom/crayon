export { addSourceAttributes, parseLocator, ATTR } from "./transform/index.js";
export { applyTextEdit, locateTextEdit, countOccurrences, replaceEverywhere } from "./writer/index.js";
export { locateElement, updateAttributes } from "./writer/attrs.js";
export type { TextEdit, EditResult, EditFailure } from "./writer/index.js";
