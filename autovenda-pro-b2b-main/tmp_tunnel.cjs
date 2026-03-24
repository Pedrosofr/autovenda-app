const fs = require("node:fs");
const lt = require("localtunnel");

async function main() {
  const tunnel = await lt({ port: 4173, host: "https://localtunnel.me" });
  fs.writeFileSync(".lt-url", tunnel.url, "utf8");
  console.log(tunnel.url);
}

main().catch((error) => {
  fs.writeFileSync(".lt-url", `ERR:${error.message}`, "utf8");
  console.error(error);
  process.exit(1);
});

setInterval(() => {}, 1e9);
