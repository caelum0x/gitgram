// VSCode API wrapper
declare const acquireVsCodeApi: () => { postMessage: (msg: any) => void; getState: () => any; setState: (s: any) => void }
export const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : { postMessage: () => {}, getState: () => ({}), setState: () => {} }
