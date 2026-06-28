export function createFilterInput(documentRef, {value = "", placeholder = "", onChange = () => {}} = {}) {
  const input = documentRef.createElement("input");
  input.type = "search";
  input.placeholder = placeholder;
  input.value = value;
  let composing = false;

  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", event => {
    composing = false;
    onChange(event.target.value);
  });
  input.addEventListener("input", event => {
    if (composing || event.isComposing) return;
    onChange(event.target.value);
  });

  return input;
}
