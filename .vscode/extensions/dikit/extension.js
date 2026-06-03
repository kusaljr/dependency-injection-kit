const path = require("path");
const {
  LanguageClient,
  ServerOptions,
  TransportKind,
} = require("vscode-languageclient/node");

let client = null;

function activate(context) {
  const serverModule = context.asAbsolutePath(
    path.join("..", "..", "..", "lib", "lsp", "server.ts")
  );

  const serverOptions = {
    run: {
      command: "bun",
      args: ["run", serverModule],
      transport: TransportKind.stdio,
    },
    debug: {
      command: "bun",
      args: ["run", "--inspect", serverModule],
      transport: TransportKind.stdio,
    },
  };

  const clientOptions = {
    documentSelector: [{ language: "dikit", scheme: "file" }],
    synchronize: {
      configurationSection: "dikit",
    },
  };

  client = new LanguageClient(
    "dikit-lsp",
    "Dikit Language Server",
    serverOptions,
    clientOptions
  );

  context.subscriptions.push(client.start());
}

function deactivate() {
  if (client) {
    return client.stop();
  }
}

module.exports = { activate, deactivate };
