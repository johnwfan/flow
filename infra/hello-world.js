import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Flow is live");
});

server.listen(port, () => {
  console.log(`hello-world listening on :${port}`);
});
