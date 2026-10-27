const decodeEntities = (value) => {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }

  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
};

export const stripHtml = (value) => {
  if (typeof value !== "string" || !value) return "";

  let text = value;
  for (let pass = 0; pass < 3; pass += 1) {
    text = text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\.{3,}\/?>?/g, " ")
      .replace(/<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi, " ")
      .replace(/<\/?[a-z][^>]*>/gi, " ")
      .replace(/<\s*\/?\s*>/g, " ");
    text = decodeEntities(text);
  }

  return text.replace(/[\u00A0\xa0]/g, " ").replace(/\s+/g, " ").trim();
};
