export function toExternalScriptTag(url: string): string {
  return `<script src='${url}'></script>`;
}

export function toInlineScriptTag(jsCode: string): string {
  return `<script>${jsCode}</script>`;
}

export function toExternalStylesheetTag(url: string): string {
  return `<link href='${url}' rel='stylesheet'>`;
}

export function toTags(
  customCode: string | string[] | undefined,
  toScript: (url: string) => string
): string {
  if (typeof customCode === "string") {
    return toScript(customCode);
  } else if (Array.isArray(customCode)) {
    return customCode.map(toScript).join("\n");
  } else {
    return "";
  }
}

export function stringify(obj: any): string {
  const placeholder = "____FUNCTIONPLACEHOLDER____";
  const fns: Function[] = [];
  let json = JSON.stringify(
    obj,
    function (key, value) {
      if (typeof value === "function") {
        fns.push(value);
        return placeholder;
      }
      return value;
    },
    2
  );
  json = json.replace(new RegExp('"' + placeholder + '"', "g"), () =>
    fns.shift()!.toString()
  );
  return "var options = " + json + ";";
}
