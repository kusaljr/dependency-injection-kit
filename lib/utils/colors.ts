export const colorText = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  orange: (text: string) => `\x1b[33m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  white: (text: string) => `\x1b[37m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  underline: (text: string) => `\x1b[4m${text}\x1b[0m`,
  inverse: (text: string) => `\x1b[7m${text}\x1b[0m`,
  strikethrough: (text: string) => `\x1b[9m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  black: (text: string) => `\x1b[30m${text}\x1b[0m`,
  bgGreen: (text: string) => `\x1b[42m${text}\x1b[0m`,
  bgRed: (text: string) => `\x1b[41m${text}\x1b[0m`,
  bgYellow: (text: string) => `\x1b[43m${text}\x1b[0m`,
  bgBlue: (text: string) => `\x1b[44m${text}\x1b[0m`,
  bgCyan: (text: string) => `\x1b[46m${text}\x1b[0m`,
};

export const colorMethod = (method: string): string => {
  switch (method.toUpperCase()) {
    case "GET":
      return colorText.green(method.toUpperCase());
    case "POST":
      return colorText.cyan(method.toUpperCase());
    case "PATCH":
      return colorText.magenta(method.toUpperCase());
    case "DELETE":
      return colorText.red(method.toUpperCase());
    case "PUT":
      return colorText.yellow(method.toUpperCase());
    default:
      return colorText.white(method.toUpperCase());
  }
};
