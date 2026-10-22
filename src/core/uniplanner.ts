import type { UplDocument, UplRequest, UplResult } from "./types";

interface UniplannerApi {
  applyMutation(documentJson: string, requestJson: string): string;
  previewMutation(documentJson: string, requestJson: string): string;
  version: string;
}

declare global {
  interface Window {
    uniplanner?: UniplannerApi;
  }
}

export function previewMutation(document: UplDocument, request: UplRequest): UplResult {
  return run(getApi().previewMutation, document, request);
}

export function applyMutation(document: UplDocument, request: UplRequest): UplResult {
  return run(getApi().applyMutation, document, request);
}

function getApi(): UniplannerApi {
  const api = window.uniplanner;
  if (!api) throw new Error("uniplanner-core.js is not loaded");
  return api;
}

function run(
  apply: (documentJson: string, requestJson: string) => string,
  document: UplDocument,
  request: UplRequest,
): UplResult {
  return JSON.parse(apply(JSON.stringify(document), JSON.stringify(request))) as UplResult;
}
