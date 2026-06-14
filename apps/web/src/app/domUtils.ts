export function isTextInputActive(): boolean {
  const element = window.document.activeElement;
  if (element == null) return false;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
    return true;
  return element instanceof HTMLElement && element.isContentEditable;
}
